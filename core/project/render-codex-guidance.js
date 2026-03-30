#!/usr/bin/env node

'use strict';

function renderList(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

function renderCodexGuidance(spec) {
  return [
    `# ${spec.project.name}`,
    '',
    spec.project.summary,
    '',
    '## Citadel Project Guidance',
    '',
    'This file is the Codex-facing projection of the canonical Citadel project spec.',
    '',
    '## Conventions',
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
    '## Handoff Summary',
    '',
    'When a task completes, prefer a concise handoff that states:',
    '',
    '- What changed',
    '- Key decisions',
    '- Remaining risks or next steps',
    '',
  ].join('\n');
}

module.exports = Object.freeze({
  renderCodexGuidance,
});
