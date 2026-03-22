#!/usr/bin/env node

/**
 * post-edit.js — PostToolUse hook (runs on every Edit/Write)
 *
 * Language-adaptive per-file type checking:
 *   - TypeScript: tsc --noEmit on the changed file
 *   - Python: mypy or pyright on the changed file
 *   - Go: go vet on the package
 *   - Rust: cargo check (whole project, but fast with incremental)
 *
 * Also runs lightweight performance lint and dependency-aware pattern detection.
 *
 * Exit codes:
 *   0 = success (or non-checkable file, or non-Edit/Write tool)
 *   2 = type errors found in edited file
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const health = require('./harness-health-util');

const PROJECT_ROOT = health.PROJECT_ROOT;

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    const startTime = Date.now();
    let event;
    try {
      event = JSON.parse(input);
    } catch {
      process.exit(0);
    }

    const toolName = event.tool_name || '';

    // Only run on Edit and Write operations
    if (toolName !== 'Edit' && toolName !== 'Write') {
      process.exit(0);
    }

    // Extract file path from tool input
    const filePath = event.tool_input?.file_path || event.tool_input?.path || '';
    if (!filePath) {
      process.exit(0);
    }

    const pathCheck = health.validatePath(filePath);
    if (!pathCheck.safe) {
      health.securityWarning('post-edit', `Possible injection in file path — ${pathCheck.violation}. Skipping typecheck.`);
      process.exit(0);
    }

    const relativePath = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');

    // Run performance lint, dependency pattern checks, and design manifest checks
    performanceLint(filePath, relativePath);
    dependencyPatternLint(filePath, relativePath);
    designManifestLint(filePath, relativePath);

    // Run type check
    const exitCode = typeCheck(filePath, relativePath);

    health.logTiming('post-edit', Date.now() - startTime, {
      file: relativePath,
      typecheck: exitCode === 0 ? 'pass' : 'fail',
    });

    process.exit(exitCode);
  });
}

// ── Type Checking ────────────────────────────────────────────────────────────

function typeCheck(filePath, relativePath) {
  const config = health.readConfig();
  const language = config.language || 'unknown';
  const typecheckConfig = config.typecheck || {};

  // No typecheck configured — skip gracefully
  if (!typecheckConfig.command) {
    // Log once per session so beginners know setup is available
    const notifiedFlag = path.join(PROJECT_ROOT, '.planning', 'telemetry', '.typecheck-notified');
    if (language === 'unknown' && !fs.existsSync(notifiedFlag)) {
      try {
        const telemetryDir = path.dirname(notifiedFlag);
        if (fs.existsSync(telemetryDir)) {
          fs.writeFileSync(notifiedFlag, Date.now().toString());
          process.stdout.write('[typecheck] No typecheck configured. Run /do setup to enable per-edit type checking.');
        }
      } catch {
        // Silently skip if we can't write the flag
      }
    }
    return 0;
  }

  try {
    if (language === 'typescript') {
      return typecheckTypeScript(filePath, relativePath);
    } else if (language === 'python') {
      return typecheckPython(filePath, relativePath, typecheckConfig.command);
    } else if (language === 'go') {
      return typecheckGo(filePath, relativePath);
    } else if (language === 'rust') {
      return typecheckRust();
    }
  } catch (err) {
    // Typecheck failure should not block the edit
    if (err.status === 2 || (err.stdout && err.stdout.includes('error'))) {
      return 2;
    }
  }

  return 0;
}

function typecheckTypeScript(filePath, relativePath) {
  // Only check .ts and .tsx files
  if (!/\.(ts|tsx)$/.test(filePath)) return 0;
  // Skip declaration files
  if (/\.d\.ts$/.test(filePath)) return 0;

  try {
    execFileSync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
      cwd: PROJECT_ROOT,
      timeout: 25000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return 0;
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    // Filter to only errors in the edited file
    const lines = output.split('\n').filter(line => {
      const normalized = line.replace(/\\/g, '/');
      return normalized.includes(relativePath) && line.includes('error TS');
    });

    if (lines.length > 0) {
      const msg = [
        `[typecheck] ${lines.length} error(s) in ${relativePath}:`,
        ...lines.slice(0, 10),
        lines.length > 10 ? `  ... and ${lines.length - 10} more` : null,
      ].filter(Boolean).join('\n');
      process.stdout.write(msg);
      return 2;
    }
    return 0;
  }
}

function typecheckPython(filePath, relativePath, command) {
  if (!/\.py$/.test(filePath)) return 0;

  const cmdCheck = health.validateCommand(command);
  if (!cmdCheck.safe) {
    health.securityWarning('post-edit', `Possible injection in typecheck command — ${cmdCheck.violation}. Skipping typecheck.`);
    return 0;
  }

  // Command is expected to be simple whitespace-separated tokens (e.g., "mypy --strict").
  // Quoted arguments like --config-file "my config.ini" are not supported.
  const [cmd, ...cmdArgs] = command.split(/\s+/);
  try {
    execFileSync(cmd, [...cmdArgs, filePath], {
      cwd: PROJECT_ROOT,
      timeout: 20000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return 0;
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    const lines = output.split('\n').filter(l => l.includes('error'));
    if (lines.length > 0) {
      process.stdout.write(`[typecheck] Errors in ${relativePath}:\n${lines.slice(0, 10).join('\n')}`);
      return 2;
    }
    return 0;
  }
}

function typecheckGo(filePath, relativePath) {
  if (!/\.go$/.test(filePath)) return 0;
  const dir = path.dirname(filePath);

  try {
    execFileSync('go', ['vet', './...'], {
      cwd: dir,
      timeout: 20000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return 0;
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    if (output.trim()) {
      process.stdout.write(`[typecheck] go vet issues:\n${output.slice(0, 500)}`);
      return 2;
    }
    return 0;
  }
}

function typecheckRust() {
  try {
    execFileSync('cargo', ['check', '--message-format=short'], {
      cwd: PROJECT_ROOT,
      timeout: 30000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return 0;
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    const errors = output.split('\n').filter(l => l.includes('error'));
    if (errors.length > 0) {
      process.stdout.write(`[typecheck] cargo check errors:\n${errors.slice(0, 10).join('\n')}`);
      return 2;
    }
    return 0;
  }
}

// ── Performance Lint ─────────────────────────────────────────────────────────

function performanceLint(filePath, relativePath) {
  // Only lint source files
  if (!/\.(ts|tsx|js|jsx|py|go|rs)$/.test(filePath)) return;

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  const warnings = [];

  // Check for confirm/alert/prompt (cross-language web anti-pattern)
  if (/\.(ts|tsx|js|jsx)$/.test(filePath)) {
    if (/\bconfirm\s*\(/.test(content)) warnings.push('Uses confirm() — use an in-app modal instead');
    if (/\balert\s*\(/.test(content)) warnings.push('Uses alert() — use an in-app notification instead');
    if (/\bprompt\s*\(/.test(content)) warnings.push('Uses prompt() — use an in-app input instead');
  }

  // Check for transition-all (CSS performance) — only in CSS/JS/TS files
  if (/\.(ts|tsx|js|jsx|css|scss)$/.test(filePath) && /transition-all/.test(content)) {
    warnings.push('Uses transition-all — specify properties explicitly (e.g., transition-[opacity,transform])');
  }

  if (warnings.length > 0) {
    process.stdout.write(
      `[lint] ${relativePath}:\n` + warnings.map(w => `  - ${w}`).join('\n') + '\n'
    );
  }
}

// ── Dependency-Aware Pattern Detection ────────────────────────────────────────

// Cache package.json deps for the session (process lifetime)
let _cachedDeps = null;

function getProjectDeps() {
  if (_cachedDeps !== null) return _cachedDeps;
  try {
    const pkgPath = path.join(PROJECT_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    _cachedDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
  } catch {
    _cachedDeps = {};
  }
  return _cachedDeps;
}

function dependencyPatternLint(filePath, relativePath) {
  // Only check source files
  if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) return;

  const config = health.readConfig();
  const patterns = config.dependencyPatterns;
  if (!patterns || !Array.isArray(patterns) || patterns.length === 0) return;

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  const deps = getProjectDeps();
  const warnings = [];

  for (const entry of patterns) {
    if (!entry.dependency || !deps[entry.dependency]) continue;
    if (!Array.isArray(entry.banned)) continue;

    for (const banned of entry.banned) {
      if (content.includes(banned)) {
        const msg = entry.message || 'Use the library instead.';
        warnings.push('Found ' + banned + ' but ' + entry.dependency + ' is installed. ' + msg);
        break; // One warning per dependency, not per match
      }
    }
  }

  if (warnings.length > 0) {
    process.stdout.write(
      '[dep-lint] ' + relativePath + ':\n' + warnings.map(function(w) { return '  - ' + w; }).join('\n') + '\n'
    );
  }
}



// ── Design Manifest Lint ────────────────────────────────────────────────────

let _cachedManifest = null;
let _manifestChecked = false;

function loadDesignManifest() {
  if (_manifestChecked) return _cachedManifest;
  _manifestChecked = true;
  try {
    const manifestPath = path.join(PROJECT_ROOT, '.planning', 'design-manifest.md');
    if (!fs.existsSync(manifestPath)) return null;
    _cachedManifest = fs.readFileSync(manifestPath, 'utf8');
  } catch {
    _cachedManifest = null;
  }
  return _cachedManifest;
}

function extractManifestColors(manifest) {
  const colors = [];
  const colorRegex = /#[0-9a-fA-F]{3,8}\b/g;
  const lines = manifest.split('\n');
  let inColors = false;
  for (const line of lines) {
    if (/^## Colors/.test(line)) { inColors = true; continue; }
    if (/^## [^C]/.test(line) && inColors) break;
    if (inColors) {
      let match;
      while ((match = colorRegex.exec(line)) !== null) {
        colors.push(match[0].toLowerCase());
      }
    }
  }
  return colors;
}

function designManifestLint(filePath, relativePath) {
  // Only check style-relevant files
  if (!/\.(css|scss|tsx|jsx)$/.test(filePath)) return;

  const manifest = loadDesignManifest();
  if (!manifest) return;

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  const paletteColors = extractManifestColors(manifest);
  if (paletteColors.length === 0) return;

  // Find hex colors in the edited file
  const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
  const foundColors = new Set();
  let match;
  while ((match = hexRegex.exec(content)) !== null) {
    foundColors.add(match[0].toLowerCase());
  }

  const offPalette = [...foundColors].filter(c => !paletteColors.includes(c));

  if (offPalette.length > 0) {
    process.stdout.write(
      `[design] ${relativePath}: Found ${offPalette.length} color(s) not in design manifest palette: ${offPalette.slice(0, 5).join(', ')}` +
      (offPalette.length > 5 ? ` (+${offPalette.length - 5} more)` : '') +
      `\n  Palette: ${paletteColors.slice(0, 8).join(', ')}${paletteColors.length > 8 ? ' ...' : ''}\n`
    );
  }
}

main();
