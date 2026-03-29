---
name: learn
description: >-
  Post-campaign learning extractor. Reads a completed campaign file, its
  postmortem, and telemetry audit log to extract successful patterns,
  failed patterns, key decisions, and quality rule candidates. Writes
  findings to the knowledge base and optionally appends quality rules to
  harness.json. Auto-triggered after /postmortem completes.
user-invocable: true
auto-trigger: false
last-updated: 2026-03-26
---

# /learn — Campaign Pattern Extractor

## Identity

/learn turns completed campaigns into institutional knowledge. It reads the
artifacts left behind — campaign files, postmortems, audit logs — and
extracts what worked, what failed, what decisions were made, and what should
become permanent quality rules.

It writes to `.planning/knowledge/` so future campaigns and agents can
benefit from hard-won lessons without repeating them.

## When to Use

- After any completed campaign (auto-triggered by /postmortem)
- Manually: `/learn` runs on the most recently completed campaign
- Targeted: `/learn {slug}` runs on a specific campaign
- When the user says "extract patterns", "learn from that", "save what worked"

## Invocation Forms

```
/learn                  — most recently completed campaign
/learn {slug}           — specific campaign by slug
/learn {file-path}      — specific campaign file path
```

## Inputs

1. A campaign slug, file path, or "most recent" resolution
2. Corresponding postmortem in `.planning/postmortems/` (optional)
3. `.planning/telemetry/audit.jsonl` filtered to this campaign

## Protocol

### Step 1: RESOLVE TARGET CAMPAIGN

**If `/learn` (no argument):**
- Glob `.planning/campaigns/completed/*.md` or `.planning/campaigns/*.md`
  where `Status: completed`
- Sort by modification time descending
- Take the most recent
- If none found: output "No completed campaigns found. Run /learn after a
  campaign completes." and stop

**If `/learn {slug}`:**
- Search `.planning/campaigns/` for a file whose name contains `{slug}`
- If not found in active campaigns, check `.planning/campaigns/completed/`
- If still not found: "No campaign found matching '{slug}'."

### Step 2: GATHER SOURCES

**Campaign file (required):**
- Full content — direction, phases, Decision Log, Feature Ledger,
  circuit breaker activations, review queue items

**Postmortem (optional):**
- Search `.planning/postmortems/` for files matching `*{slug}*`
- If found: read the full postmortem
- If not found: note "Postmortem not found — proceeding without it" and continue

**Audit telemetry (optional):**
- Read last 200 lines of `.planning/telemetry/audit.jsonl`
- Filter entries that contain the campaign slug or timestamps within the
  campaign's active period (if dates are available in the campaign file)
- If no matching entries found: note "No audit telemetry found for this campaign"

### Step 3: EXTRACT PATTERNS

Analyze gathered sources and extract four categories:

#### A. Successful Patterns
Approaches, tool sequences, or architectural decisions that demonstrably worked.
Evidence: phases completed without rework, postmortem "patterns" section positives,
commit sequences that proceeded without reverts.

For each pattern:
- Name: short descriptive label
- Description: what was done
- Evidence: which phase/commit/log entry supports this
- Applicability: when this pattern applies (file type, domain, task type)

#### B. Failed Patterns (Anti-patterns)
What was tried and failed, with context for why.
Evidence: phases that needed rework, circuit breaker trips, quality gate blocks,
reverted commits, "What Broke" entries in postmortem.

For each anti-pattern:
- Name: short descriptive label
- Description: what was done
- Failure mode: what went wrong
- Evidence: which hook/gate/commit caught it
- Avoidance: how to avoid this pattern

#### C. Key Decisions
Architectural or approach decisions from the campaign's Decision Log.
If no Decision Log exists, extract from phase descriptions and commit messages.

For each decision:
- Decision: what was decided
- Rationale: why (from the log, or inferred from context)
- Outcome: did it work out? (completed vs. rework)

#### D. Quality Rule Candidates
Patterns that tripped quality gates OR recurring anti-patterns that could be
caught automatically. Only generate a rule if:
- The pattern is a clear, specific regex (not a vague principle)
- It would apply to a specific file pattern
- It occurred more than once OR was severe enough to warrant a rule

For each rule candidate:
- Proposed regex pattern
- File pattern it applies to (e.g., `**/*.ts`, `src/domains/**`)
- Message to show when triggered
- Confidence: high | medium | low (skip low-confidence rules)

### Step 4: WRITE KNOWLEDGE FILES

**Create `.planning/knowledge/{slug}-patterns.md`:**

```markdown
# Patterns: {Campaign Name}

> Extracted: {ISO date}
> Campaign: {path to campaign file}
> Postmortem: {path, or "none"}

## Successful Patterns

### {N}. {Pattern Name}
- **Description:** {what was done}
- **Evidence:** {source}
- **Applies when:** {applicability}

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| {decision} | {rationale} | {outcome} |
```

**Create `.planning/knowledge/{slug}-antipatterns.md`:**

```markdown
# Anti-patterns: {Campaign Name}

> Extracted: {ISO date}
> Campaign: {path to campaign file}

## Failed Patterns

### {N}. {Anti-pattern Name}
- **What was done:** {description}
- **Failure mode:** {what went wrong}
- **Evidence:** {source}
- **How to avoid:** {avoidance}
```

If `.planning/knowledge/` does not exist, create it.

### Step 5: APPEND QUALITY RULES

For each high- or medium-confidence quality rule candidate:

1. Read `.claude/harness.json` (create it if missing with `{}`)
2. Check if `qualityRules.custom` array exists; initialize to `[]` if not
3. For each candidate rule:
   a. Check if a rule with the same `pattern` already exists in the array
   b. If it already exists: skip it (do not duplicate)
   c. If it's new: append:
      ```json
      {
        "name": "auto-{slug}-{N}",
        "pattern": "{regex}",
        "filePattern": "{file glob}",
        "message": "Learned from campaign {slug}: {message}"
      }
      ```
4. Write the updated harness.json back

If harness.json doesn't exist: create it with only the qualityRules section:
```json
{
  "qualityRules": {
    "custom": [
      { ... }
    ]
  }
}
```

Skip vague or low-confidence patterns entirely — a bad rule that fires on
innocent code is worse than no rule.

### Step 6: OUTPUT SUMMARY

```
=== /learn: {Campaign Slug} ===

Sources read:
  Campaign:   {file path}
  Postmortem: {file path, or "not found"}
  Audit entries: {N} matched

Extracted:
  Successful patterns: {N}
  Anti-patterns:       {N}
  Key decisions:       {N}
  Quality rule candidates: {N total} ({M} added, {K} skipped — already exist or low confidence)

Knowledge files written:
  .planning/knowledge/{slug}-patterns.md
  .planning/knowledge/{slug}-antipatterns.md

Quality rules appended to .claude/harness.json: {M}
{  "name": "auto-{slug}-1", "pattern": "...", ... }   ← one line per rule added

Next: review .planning/knowledge/ and promote useful rules to your project's
      CLAUDE.md or coding-style rules for permanent enforcement.
```

## Fringe Case Handling

**No completed campaigns:**
Output the "no completed campaigns" message and stop. Do not attempt to
read nonexistent files.

**Campaign file has no Decision Log section:**
Extract decisions from phase descriptions instead. Note in the output:
"Decision Log not found — decisions inferred from phase descriptions."

**harness.json doesn't exist:**
Create it with just the qualityRules section. Do not invent other harness
configuration fields.

**Pattern already exists in qualityRules:**
Skip the duplicate silently. Count it in "skipped — already exist".

**Postmortem doesn't exist:**
Run without it. Note "Postmortem not found — proceeding without it" in the
summary output. Do not fail.

**Telemetry file is very large:**
Only read the last 200 lines. This is sufficient for pattern extraction
without large read costs.

**Campaign has zero patterns (very short or trivial campaign):**
Write the knowledge files with empty sections and a note:
"No extractable patterns found — campaign may have been too brief."
Do not skip file creation.

## Quality Gates

- Never invent patterns not supported by evidence in the source files
- Never write a quality rule with confidence < medium
- Never duplicate an existing quality rule (check before appending)
- Knowledge files must be written even if quality rules section is empty
- Summary output must include counts for all four extraction categories

## Exit Protocol

/learn does not produce a full HANDOFF block (it is a utility, not a campaign).
It outputs the summary block in Step 6 and then waits for the next command.
