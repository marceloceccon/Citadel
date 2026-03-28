#!/usr/bin/env node

/**
 * doc-sync.js — Standalone doc staleness processor
 *
 * Reads .planning/telemetry/doc-sync-queue.jsonl for pending staleness events
 * written by the post-edit.js hook during a session, then surfaces them to
 * Claude at session end (or on manual invocation) so documentation can be
 * updated.
 *
 * This is NOT a PostToolUse hook — it is called by session-end.js (or run
 * manually via `node hooks_src/doc-sync.js`) to summarize what needs review.
 *
 * It never modifies files. Only Claude can actually update documentation.
 *
 * Usage:
 *   node hooks_src/doc-sync.js                      # process full queue
 *   node hooks_src/doc-sync.js --dry-run            # show queue without marking
 */

const fs = require('fs');
const path = require('path');

// Resolve project root from harness-health-util if available, otherwise CWD
let PROJECT_ROOT;
try {
  const health = require('./harness-health-util');
  PROJECT_ROOT = health.PROJECT_ROOT;
} catch {
  PROJECT_ROOT = process.cwd();
}

const QUEUE_PATH = path.join(PROJECT_ROOT, '.planning', 'telemetry', 'doc-sync-queue.jsonl');

const CITADEL_UI = process.env.CITADEL_UI === 'true';

function hookOutput(hookName, action, message, data = {}) {
  if (CITADEL_UI) {
    process.stdout.write(JSON.stringify({
      hook: hookName,
      action,
      message,
      timestamp: new Date().toISOString(),
      data,
    }));
  } else {
    process.stdout.write(message);
  }
}

function main() {
  const dryRun = process.argv.includes('--dry-run');

  // Read the queue
  let lines = [];
  try {
    if (!fs.existsSync(QUEUE_PATH)) {
      hookOutput('doc-sync', 'info', '[doc-sync] No queue file found — nothing to process.\n');
      process.exit(0);
    }
    const raw = fs.readFileSync(QUEUE_PATH, 'utf8');
    lines = raw.split('\n').filter(l => l.trim().length > 0);
  } catch (err) {
    process.stderr.write('[doc-sync] Failed to read queue: ' + err.message + '\n');
    process.exit(0);
  }

  if (lines.length === 0) {
    hookOutput('doc-sync', 'info', '[doc-sync] Queue is empty — no doc updates needed.\n');
    process.exit(0);
  }

  // Parse entries
  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }

  // Filter to only pending (needs-review) entries
  const pending = entries.filter(e => e.status === 'needs-review');

  if (pending.length === 0) {
    hookOutput('doc-sync', 'info', '[doc-sync] All items already surfaced — nothing new.\n');
    process.exit(0);
  }

  // Check which files still exist (skip deleted files)
  const stillExist = pending.filter(e => {
    if (!e.file) return false;
    const abs = path.isAbsolute(e.file) ? e.file : path.join(PROJECT_ROOT, e.file);
    return fs.existsSync(abs);
  });

  const gone = pending.length - stillExist.length;

  // Surface the list
  const fileList = [...new Set(stillExist.map(e => e.file))];

  if (fileList.length === 0) {
    hookOutput('doc-sync', 'info', '[doc-sync] All flagged files have been deleted — nothing to review.\n');
  } else {
    let msg = `[doc-sync] ${fileList.length} file(s) may need doc updates:\n` +
      fileList.map(f => '  - ' + f).join('\n') + '\n';
    if (gone > 0) {
      msg += `  (${gone} item(s) skipped — source file no longer exists)\n`;
    }
    msg += '\nThese files have exported function signatures and co-located documentation.\n' +
      'Review and update README.md or JSDoc comments as needed.\n';
    hookOutput('doc-sync', 'info', msg, { files: fileList, skipped: gone });
  }

  // Mark surfaced items in the queue (rewrite the file)
  if (!dryRun) {
    try {
      const surfacedFiles = new Set(fileList);
      const updated = entries.map(e => {
        if (e.status === 'needs-review' && surfacedFiles.has(e.file)) {
          return { ...e, status: 'surfaced', surfacedAt: new Date().toISOString() };
        }
        return e;
      });
      fs.writeFileSync(QUEUE_PATH, updated.map(e => JSON.stringify(e)).join('\n') + '\n');
    } catch (err) {
      process.stderr.write('[doc-sync] Warning: failed to mark items as surfaced: ' + err.message + '\n');
    }
  }

  process.exit(0);
}

main();
