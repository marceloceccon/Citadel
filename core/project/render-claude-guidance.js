#!/usr/bin/env node

'use strict';

function renderList(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

function renderClaudeGuidance(spec) {
  return [
    '# Claude Harness',
    '',
    spec.project.summary,
    '',
    '## What This Is',
    '',
    spec.project.summary,
    '',
    '## Key Conventions',
    '',
    renderList(spec.conventions),
    '',
    '## Workflows',
    '',
    renderList(spec.workflows),
    '',
    '## Constraints',
    '',
    renderList(spec.constraints),
    '',
    '## Handoff Summary (Required)',
    '',
    'After completing any task, output a `HANDOFF` block:',
    '',
    '```',
    '---HANDOFF---',
    '- What was built or changed',
    '- Key decisions and tradeoffs',
    '- Unresolved items or next steps',
    '---',
    '```',
    '',
    '3-5 bullets, under 150 words.',
    '',
  ].join('\n');
}

module.exports = Object.freeze({
  renderClaudeGuidance,
});
