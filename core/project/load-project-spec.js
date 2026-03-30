#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_SPEC_VERSION, createProjectSpecSkeleton } = require('../contracts/project-spec');

const SECTION_NAMES = Object.freeze([
  'Project',
  'Conventions',
  'Workflows',
  'Constraints',
]);

function parseKeyValueLines(lines) {
  const obj = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;
    const key = trimmed.slice(0, colonIndex).trim().toLowerCase();
    const value = trimmed.slice(colonIndex + 1).trim();
    if (key && value) obj[key] = value;
  }
  return obj;
}

function parseBulletLines(lines) {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function extractSection(text, sectionName) {
  const lines = text.split('\n');
  const header = `## ${sectionName}`;
  const startIndex = lines.findIndex((line) => line.trim() === header);
  if (startIndex === -1) return '';

  const collected = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) break;
    collected.push(line);
  }
  return collected.join('\n').trim();
}

function parseProjectSpec(text) {
  const spec = createProjectSpecSkeleton();
  const normalized = text.replace(/\r\n/g, '\n');

  const versionMatch = normalized.match(/^Version:\s*(.+)$/mi);
  if (versionMatch) spec.version = versionMatch[1].trim();

  const projectSection = extractSection(normalized, 'Project');
  const projectMeta = parseKeyValueLines(projectSection.split('\n'));
  spec.project.name = projectMeta.name || '';
  spec.project.summary = projectMeta.summary || '';

  spec.conventions = parseBulletLines(extractSection(normalized, 'Conventions').split('\n'));
  spec.workflows = parseBulletLines(extractSection(normalized, 'Workflows').split('\n'));
  spec.constraints = parseBulletLines(extractSection(normalized, 'Constraints').split('\n'));

  return spec;
}

function validateProjectSpec(spec) {
  const errors = [];

  if (!spec || typeof spec !== 'object') {
    return ['Project spec must be an object'];
  }
  if (spec.version !== PROJECT_SPEC_VERSION) {
    errors.push(`Unsupported project spec version: ${spec.version}`);
  }
  if (!spec.project || typeof spec.project !== 'object') {
    errors.push('Project spec missing project metadata');
  } else {
    if (!spec.project.name) errors.push('Project spec missing project name');
    if (!spec.project.summary) errors.push('Project spec missing project summary');
  }

  for (const field of ['conventions', 'workflows', 'constraints']) {
    if (!Array.isArray(spec[field])) {
      errors.push(`Project spec field must be an array: ${field}`);
    }
  }

  return errors;
}

function resolveProjectSpecPath(projectRoot, explicitPath) {
  if (explicitPath) return path.resolve(explicitPath);
  return path.join(projectRoot, '.citadel', 'project.md');
}

function loadProjectSpec(projectRoot, explicitPath) {
  const specPath = resolveProjectSpecPath(projectRoot, explicitPath);
  const content = fs.readFileSync(specPath, 'utf8');
  const spec = parseProjectSpec(content);
  return {
    path: specPath,
    content,
    spec,
    errors: validateProjectSpec(spec),
  };
}

module.exports = Object.freeze({
  SECTION_NAMES,
  parseProjectSpec,
  validateProjectSpec,
  resolveProjectSpecPath,
  loadProjectSpec,
});
