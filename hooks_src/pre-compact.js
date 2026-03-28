#!/usr/bin/env node

/**
 * pre-compact.js — PreCompact hook (smart version)
 *
 * Saves critical context state before Claude's message compression.
 * The restore-compact.js hook re-injects this on the next SessionStart.
 *
 * Smart behavior (controlled by harness.json preCompact config):
 *   handoffMode: "auto"   — silently write a full handoff doc before compaction (DEFAULT)
 *   handoffMode: "prompt" — output a warning that compaction is happening (non-interactive)
 *   handoffMode: "off"    — skip auto-save entirely (legacy behavior)
 *
 * What it always saves (state file):
 *   - Active campaign slug + Active Context excerpt
 *   - Active fleet session
 *   - Pending research / roadmap artifacts
 *
 * What "auto" mode additionally saves (handoff doc):
 *   - Full session handoff to .planning/handoffs/session-{date}.md
 *   - Includes: active campaign, what was built, decisions, unresolved items
 *
 * Fringe cases:
 *   - PLUGIN_DATA_DIR not writable: falls back to .claude/ in project root
 *   - No active campaign: still saves state file (may be empty, that's fine)
 *   - handoffMode missing from config: defaults to "auto" (safe default)
 *   - Hook crashes: non-critical, process.exit(0) always
 */

const fs = require('fs');
const path = require('path');
const health = require('./harness-health-util');

const PROJECT_ROOT = health.PROJECT_ROOT;
const PLUGIN_DATA_DIR = health.PLUGIN_DATA_DIR;
const STATE_FILE = path.join(PLUGIN_DATA_DIR, 'compact-state.json');

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
  health.increment('pre-compact', 'count');

  const config = health.readConfig();
  const preCompactConfig = config.preCompact || {};
  const handoffMode = preCompactConfig.handoffMode || 'auto';

  const state = {
    savedAt: new Date().toISOString(),
    activeCampaign: null,
    activeFleetSession: null,
    recentContext: null,
    pendingResearch: [],
    handoffMode,
  };

  // Find active campaign
  const campaignsDir = path.join(PROJECT_ROOT, '.planning', 'campaigns');
  if (fs.existsSync(campaignsDir)) {
    try {
      const files = fs.readdirSync(campaignsDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(campaignsDir, file), 'utf8');
        if (/^Status:\s*active/mi.test(content)) {
          state.activeCampaign = file.replace('.md', '');
          const ctxMatch = content.match(/## Active Context\s*\n([\s\S]*?)(?=\n## |\n---|$)/);
          if (ctxMatch) state.recentContext = ctxMatch[1].trim().slice(0, 500);
          const nextMatch = content.match(/## Continuation State\s*\n([\s\S]*?)(?=\n## |\n---|$)/);
          if (nextMatch) state.continuationState = nextMatch[1].trim().slice(0, 500);
          break;
        }
      }
    } catch { /* non-critical */ }
  }

  // Find active fleet session
  const fleetDir = path.join(PROJECT_ROOT, '.planning', 'fleet');
  if (fs.existsSync(fleetDir)) {
    try {
      const files = fs.readdirSync(fleetDir).filter(f => f.startsWith('session-') && f.endsWith('.md'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(fleetDir, file), 'utf8');
        if (/status:\s*(active|needs-continue)/mi.test(content)) {
          state.activeFleetSession = file.replace('session-', '').replace('.md', '');
          break;
        }
      }
    } catch { /* non-critical */ }
  }

  // Detect recent research artifacts (modified in last 2 hours)
  const researchDir = path.join(PROJECT_ROOT, '.planning', 'research');
  if (fs.existsSync(researchDir)) {
    try {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const scanDir = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) { scanDir(full); continue; }
          if (!entry.name.endsWith('.md')) continue;
          const stat = fs.statSync(full);
          if (stat.mtimeMs > twoHoursAgo) {
            state.pendingResearch.push(path.relative(PROJECT_ROOT, full).replace(/\\/g, '/'));
          }
        }
      };
      scanDir(researchDir);
    } catch { /* non-critical */ }
  }

  // Write state file (always)
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // Fallback: write to .claude/ if PLUGIN_DATA_DIR fails
    try {
      const fallback = path.join(PROJECT_ROOT, '.claude', 'compact-state.json');
      fs.writeFileSync(fallback, JSON.stringify(state, null, 2));
    } catch { /* truly non-critical */ }
  }

  // Auto-handoff: write full session handoff doc
  if (handoffMode === 'auto') {
    writeHandoffDoc(state);
  } else if (handoffMode === 'prompt') {
    // Non-interactive warning — hooks can't truly prompt, but we can surface context
    const lines = ['[PreCompact] Context is about to be compressed.'];
    if (state.activeCampaign) lines.push(`  Active campaign: ${state.activeCampaign}`);
    if (state.activeFleetSession) lines.push(`  Active fleet session: ${state.activeFleetSession}`);
    if (state.pendingResearch.length) lines.push(`  Recent research files: ${state.pendingResearch.length} file(s)`);
    lines.push('  Set preCompact.handoffMode to "auto" in harness.json to save this automatically.');
    hookOutput('pre-compact', 'info', lines.join('\n'), {
      activeCampaign: state.activeCampaign,
      activeFleetSession: state.activeFleetSession,
      pendingResearchCount: state.pendingResearch.length,
    });
  }
  // mode "off": no output, no handoff doc

  process.exit(0);
}

function writeHandoffDoc(state) {
  try {
    const handoffsDir = path.join(PROJECT_ROOT, '.planning', 'handoffs');
    if (!fs.existsSync(handoffsDir)) fs.mkdirSync(handoffsDir, { recursive: true });

    const dateSlug = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const handoffFile = path.join(handoffsDir, `session-${dateSlug}.md`);

    const lines = [
      `# Session Handoff — ${new Date().toISOString()}`,
      `> Auto-saved by pre-compact hook before context compression.`,
      `> To continue: read this file + the campaign/fleet file listed below.`,
      '',
    ];

    if (state.activeCampaign) {
      lines.push(`## Active Campaign: ${state.activeCampaign}`);
      lines.push(`File: .planning/campaigns/${state.activeCampaign}.md`);
      if (state.recentContext) {
        lines.push('', '### Active Context', state.recentContext);
      }
      if (state.continuationState) {
        lines.push('', '### Continuation State', state.continuationState);
      }
      lines.push('');
    }

    if (state.activeFleetSession) {
      lines.push(`## Active Fleet Session: ${state.activeFleetSession}`);
      lines.push(`File: .planning/fleet/session-${state.activeFleetSession}.md`);
      lines.push('');
    }

    if (state.pendingResearch.length) {
      lines.push('## Recent Research Artifacts');
      lines.push('These files were modified in the last 2 hours and may contain unsaved analysis:');
      for (const f of state.pendingResearch) lines.push(`- ${f}`);
      lines.push('');
    }

    if (!state.activeCampaign && !state.activeFleetSession && !state.pendingResearch.length) {
      lines.push('No active campaigns or recent research detected at time of compaction.');
    }

    fs.writeFileSync(handoffFile, lines.join('\n'));
  } catch { /* non-critical */ }
}

main();
