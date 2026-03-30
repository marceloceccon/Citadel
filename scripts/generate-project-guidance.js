#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { loadProjectSpec } = require(path.join(__dirname, '..', 'core', 'project', 'load-project-spec'));
const { renderClaudeGuidance } = require(path.join(__dirname, '..', 'core', 'project', 'render-claude-guidance'));
const { renderCodexGuidance } = require(path.join(__dirname, '..', 'core', 'project', 'render-codex-guidance'));

function parseArgs(argv) {
  const args = {
    projectRoot: process.cwd(),
    specPath: null,
    target: 'all',
    write: false,
    overwrite: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--project-root') args.projectRoot = path.resolve(argv[++i]);
    else if (arg === '--spec') args.specPath = path.resolve(argv[++i]);
    else if (arg === '--target') args.target = argv[++i];
    else if (arg === '--write') args.write = true;
    else if (arg === '--overwrite') args.overwrite = true;
  }

  return args;
}

function buildTargets(spec) {
  return {
    claude: {
      filePath: 'CLAUDE.md',
      content: renderClaudeGuidance(spec),
    },
    codex: {
      filePath: 'AGENTS.md',
      content: renderCodexGuidance(spec),
    },
  };
}

function shouldWrite(targetPath, overwrite) {
  if (!fs.existsSync(targetPath)) return true;
  return overwrite;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const loaded = loadProjectSpec(args.projectRoot, args.specPath);

  if (loaded.errors.length > 0) {
    console.error(`Project spec is invalid: ${loaded.errors.join('; ')}`);
    process.exit(1);
  }

  const allTargets = buildTargets(loaded.spec);
  const targetNames = args.target === 'all' ? ['claude', 'codex'] : [args.target];

  for (const targetName of targetNames) {
    const target = allTargets[targetName];
    if (!target) {
      console.error(`Unknown target: ${targetName}`);
      process.exit(1);
    }

    const absolutePath = path.join(args.projectRoot, target.filePath);
    if (!args.write) {
      const status = fs.existsSync(absolutePath) ? 'exists' : 'missing';
      console.log(`[dry-run] ${target.filePath}: ${status}`);
      continue;
    }

    if (!shouldWrite(absolutePath, args.overwrite)) {
      console.log(`[skip] ${target.filePath} already exists. Use --overwrite to replace it.`);
      continue;
    }

    fs.writeFileSync(absolutePath, target.content, 'utf8');
    console.log(`[write] ${target.filePath}`);
  }
}

main();
