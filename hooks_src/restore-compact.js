#!/usr/bin/env node

/**
 * restore-compact.js — SessionStart hook (compact matcher)
 *
 * Re-injects critical context after Claude's message compression.
 * Reads the state saved by pre-compact.js and outputs it so Claude
 * knows what was happening before the compaction.
 */

const fs = require('fs');
const path = require('path');
const health = require('./harness-health-util');

const PROJECT_ROOT = health.PROJECT_ROOT;
const PLUGIN_DATA_DIR = health.PLUGIN_DATA_DIR;
// Check both PLUGIN_DATA_DIR (new) and .claude/ (legacy) for backward compatibility
const STATE_FILE = path.join(PLUGIN_DATA_DIR, 'compact-state.json');
const LEGACY_STATE_FILE = path.join(PROJECT_ROOT, '.claude', 'compact-state.json');

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
  // Try PLUGIN_DATA_DIR first, fall back to legacy .claude/ location
  const stateFile = fs.existsSync(STATE_FILE) ? STATE_FILE
    : fs.existsSync(LEGACY_STATE_FILE) ? LEGACY_STATE_FILE
    : null;

  if (!stateFile) {
    process.exit(0);
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    process.exit(0);
  }

  const lines = ['[Context Restored] State from before compaction:'];

  if (state.activeCampaign) {
    lines.push(`  Active campaign: ${state.activeCampaign}`);
    lines.push(`  Campaign file: .planning/campaigns/${state.activeCampaign}.md`);
  }

  if (state.activeFleetSession) {
    lines.push(`  Active fleet session: ${state.activeFleetSession}`);
    lines.push(`  Session file: .planning/fleet/session-${state.activeFleetSession}.md`);
  }

  if (state.recentContext) {
    lines.push(`  Context: ${state.recentContext}`);
  }

  if (lines.length > 1) {
    lines.push('  Read the campaign/session file to rebuild full context.');
    hookOutput('restore-compact', 'info', lines.join('\n'), {
      activeCampaign: state.activeCampaign || null,
      activeFleetSession: state.activeFleetSession || null,
    });
  }

  process.exit(0);
}

main();
