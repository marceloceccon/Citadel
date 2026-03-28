#!/usr/bin/env node

/**
 * post-compact.js — PostCompact hook
 *
 * Fires immediately after context compression IN THE SAME SESSION.
 * This closes the gap where pre-compact.js saves state and restore-compact.js
 * reads it on the NEXT session — but if the user continues working in the same
 * session after compaction, the context was lost with no re-injection.
 *
 * What it does:
 *   Reads the compact-state.json written by pre-compact.js and outputs
 *   a concise context reminder directly into the current session.
 *
 * Fringe cases:
 *   - No state file: output nothing (compaction happened before any campaigns)
 *   - State file is from a different session: compare timestamps, skip if >1hr old
 *   - Active campaign file deleted since compaction: note the discrepancy
 */

const fs = require('fs');
const path = require('path');
const health = require('./harness-health-util');

const PROJECT_ROOT = health.PROJECT_ROOT;
const PLUGIN_DATA_DIR = health.PLUGIN_DATA_DIR;

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
  health.increment('post-compact', 'count');

  // Try PLUGIN_DATA_DIR first, fall back to legacy location
  const stateFile = [
    path.join(PLUGIN_DATA_DIR, 'compact-state.json'),
    path.join(PROJECT_ROOT, '.claude', 'compact-state.json'),
  ].find(f => fs.existsSync(f));

  if (!stateFile) {
    process.exit(0);
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    process.exit(0);
  }

  // Skip if state is stale (saved more than 1 hour ago — different session)
  if (state.savedAt) {
    const age = Date.now() - new Date(state.savedAt).getTime();
    if (age > 60 * 60 * 1000) {
      process.exit(0);
    }
  }

  const lines = ['[PostCompact] Context was compressed. Restoring session state:'];
  let hasContent = false;

  if (state.activeCampaign) {
    hasContent = true;
    lines.push(`  Campaign: ${state.activeCampaign}`);
    lines.push(`  File: .planning/campaigns/${state.activeCampaign}.md`);

    // Verify campaign file still exists
    const campaignFile = path.join(PROJECT_ROOT, '.planning', 'campaigns', `${state.activeCampaign}.md`);
    if (!fs.existsSync(campaignFile)) {
      lines.push(`  WARNING: Campaign file not found — may have been moved to completed/`);
    }
  }

  if (state.activeFleetSession) {
    hasContent = true;
    lines.push(`  Fleet session: ${state.activeFleetSession}`);
    lines.push(`  File: .planning/fleet/session-${state.activeFleetSession}.md`);
  }

  if (state.recentContext) {
    lines.push(`  Last context: ${state.recentContext.slice(0, 200)}${state.recentContext.length > 200 ? '...' : ''}`);
  }

  if (state.pendingResearch && state.pendingResearch.length) {
    lines.push(`  Recent research: ${state.pendingResearch.slice(0, 3).join(', ')}${state.pendingResearch.length > 3 ? ` (+${state.pendingResearch.length - 3} more)` : ''}`);
  }

  if (hasContent) {
    lines.push('  Read the campaign/fleet file to fully restore context before continuing.');
    hookOutput('post-compact', 'info', lines.join('\n'), {
      activeCampaign: state.activeCampaign || null,
      activeFleetSession: state.activeFleetSession || null,
    });
  }

  process.exit(0);
}

main();
