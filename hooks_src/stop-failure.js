#!/usr/bin/env node

/**
 * stop-failure.js — StopFailure hook
 *
 * Fires when a Stop hook itself fails (API error, hook crash, etc.).
 * Logs the failure to telemetry and audit so it doesn't disappear silently.
 *
 * StopFailure events are often the first sign that something is fundamentally
 * wrong — the agent couldn't even finish cleanly. This hook makes that visible.
 */

const fs = require('fs');
const path = require('path');
const health = require('./harness-health-util');

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
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    let event = {};
    try { event = JSON.parse(input); } catch { /* partial input ok */ }

    const error = (event.error || event.hook_error || '').toString().slice(0, 500);
    const hookName = event.hook_name || 'unknown';

    health.increment('stop-failure', 'count');

    // Write to audit log — stop failures are always significant
    health.writeAuditLog('stop-failure', {
      hook: hookName,
      error: error || null,
      severity: 'high',
    });

    // Surface to Claude so it knows the session ended abnormally
    if (error) {
      hookOutput('stop-failure', 'error',
        `[StopFailure] A Stop hook failed: ${hookName}\n` +
        `Error: ${error}\n` +
        `This session may not have cleaned up properly. Check .planning/telemetry/audit.jsonl for details.`,
        { hookName, error }
      );
    }

    process.exit(0);
  });
}

main();
