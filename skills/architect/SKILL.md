---
name: architect
description: >-
  Given a PRD, produces an implementation architecture: file tree, component
  breakdown, data model, and a phased build plan with end conditions that
  Archon can execute directly. Multi-candidate evaluation for key decisions.
user-invocable: true
auto-trigger: false
effort: high
---

# /architect — Implementation Architecture from PRD

## Identity

/architect converts a PRD into a buildable plan. It decides HOW to implement
what the PRD describes. Its output is a campaign-ready architecture document
that Archon reads and executes.

## When to Use

- After /prd produces an approved PRD (greenfield or feature mode)
- When the user has a clear direction + existing codebase (no PRD needed)
- When /do routes a build request
- When the user has a spec and wants a build plan

## Inputs

One of:
1. A PRD file path (from /prd) — preferred, contains structured requirements
2. A user-provided spec or description + an existing codebase — sufficient
3. Neither — suggest /prd first, but don't hard-gate. If the user has a clear
   direction ("add auth to my app"), that + the existing code IS the input.

## Mode Detection

**Greenfield mode**: PRD exists with `Mode: greenfield`, or no existing source files.
Produces a complete architecture from scratch.

**Feature mode**: PRD exists with `Mode: feature`, OR the user describes a feature
and the project has existing source files. The architecture describes changes to
existing code, not a standalone system.

In feature mode:
- Read the existing file tree FIRST — understand the current architecture before planning changes
- Read key files (package.json, tsconfig, main entry points, existing patterns)
- The File Tree section shows ONLY new and modified files, not the entire project
- Phases include a Phase 0: "Baseline" that records current typecheck/test state
- Every phase's end conditions include "no new typecheck errors" and "existing tests pass"
- The Risk Register includes "regression in existing functionality" as a default risk

## Protocol

### Step 1: READ

**If PRD exists**, read it. Extract:
- Core features (the numbered list)
- Technical decisions (stack choices)
- End conditions (what "done" looks like)
- Out of scope (what NOT to build)
- Integration points (feature mode)

**If no PRD**, read the codebase instead:
- Scan the file tree for structure and conventions
- Read package.json / equivalent for dependencies and scripts
- Read the main entry point(s) to understand the architecture
- Use the user's description as the feature spec
- Infer end conditions from the description ("add auth" → "protected routes return 401 without token")

### Step 2: EVALUATE OPTIONS (for non-trivial decisions)

For any architectural decision where multiple valid approaches exist:

1. Generate 2-3 candidate approaches
2. For each candidate, assess:
   - Complexity to implement (how many files, how many concepts)
   - Risk (what could go wrong, what's the failure mode)
   - Maintainability (how easy to modify later)
   - LLM-friendliness (how well can an agent implement this without confusion)
3. Pick the winner. Document why in the architecture doc.

This is based on AlphaCodium's finding that multi-candidate evaluation
outperforms single-candidate refinement. Don't commit to the first idea.

Key decisions that warrant multi-candidate evaluation:
- State management approach
- API structure (REST vs tRPC vs GraphQL)
- Auth implementation pattern
- Database schema design
- Routing strategy

Simple decisions (file naming, folder structure, CSS approach) don't need this.
Use the PRD's stack choices and move on.

### Step 3: PRODUCE

Write to `.planning/architecture-{slug}.md`:

```markdown
# Architecture: {App Name}

> PRD: .planning/prd-{slug}.md
> Date: {ISO date}

## File Tree
{Greenfield: The complete file tree of the finished v1. Every file listed.
Feature mode: ONLY new and modified files. Prefix modified files with ~.
Example: ~ src/routes/index.ts (modified), + src/auth/middleware.ts (new)}

## Component Breakdown
{For each core feature from the PRD:}
### Feature: {name}
- Files: {list of files this feature touches}
- Dependencies: {what must exist before this can be built}
- Complexity: {low/medium/high}

## Data Model
{If the app has a database:}
### {Entity name}
- Fields: {name: type}
- Relationships: {how it connects to other entities}

{If no database: skip this section}

## Key Decisions
{Architecture decisions that were evaluated:}
### {Decision}: {What was chosen}
- **Chosen**: {approach} — because {reasoning}
- **Rejected**: {alternative} — because {why not}

## Build Phases
{Ordered phases that Archon will execute. Each phase has:}

### Phase 1: {name}
- **Goal**: {one sentence}
- **Files**: {files created or modified}
- **Dependencies**: {what must exist first, or "none"}
- **End Conditions**:
  - [ ] {machine-verifiable condition}
  - [ ] {machine-verifiable condition}

### Phase 2: {name}
...

## Phase Dependency Graph
{Which phases depend on which. Simple text format:}
Phase 1 → Phase 2 → Phase 3
                  → Phase 4 (parallel with 3)
Phase 3 + 4 → Phase 5

## Risk Register
{Top 3 things most likely to go wrong:}
1. {risk}: {mitigation}
2. {risk}: {mitigation}
3. {risk}: {mitigation}

## Deployment Strategy
{If the PRD specifies a deployment target. Skip if "deploy later" or static-only.}
- **Platform**: {from PRD Technical Decisions — see .planning/_templates/deploy/}
- **Method**: {deployment command}
- **Environment variables**: {list required env vars, reference .env.example}
- **Pre-deploy checks**: {typecheck, test, build all pass}

{The final build phase should be "Deploy" when a platform is specified:}
### Phase N (Final): Deploy
- **Goal**: Deploy the verified app to {platform}
- **Dependencies**: All previous phases complete and verified
- **End Conditions**:
  - [ ] App deployed successfully (no build errors)
  - [ ] Production URL accessible and returns expected content

{A failed deploy does NOT fail the campaign. The app works locally. Deploy is bonus.
If the user says "don't deploy" or "I'll deploy later", omit this phase entirely.}
```

### Step 4: CONNECT TO CAMPAIGN

Convert the architecture into a campaign-ready format:

1. Each build phase becomes a campaign phase
2. End conditions from the architecture become Phase End Conditions in the campaign
3. The dependency graph determines phase ordering
4. Parallel-safe phases get flagged for potential Fleet execution

Present the architecture summary to the user:
- File count and structure
- Number of phases
- Key decisions made and why
- Estimated complexity

Ask: "Ready to build? This will create an Archon campaign."

If approved: write the campaign file using the architecture as the direction.

### Step 5: HANDOFF

```
---HANDOFF---
- Architecture: {app name}
- Document: .planning/architecture-{slug}.md
- Phases: {count}
- Estimated complexity: {low/medium/high}
- Next: Archon campaign ready to execute
---
```

## What /architect Does NOT Do

- Build anything (produces the plan, not the code)
- Skip multi-candidate evaluation for key decisions
- Create phases without end conditions
- Ignore the PRD's "out of scope" section
- Produce a file tree without knowing what each file does

## Quality Gates

- Every phase has at least one machine-verifiable end condition
- Every key decision documents what was rejected and why
- File tree is complete (no "etc." or "..." placeholders)
- Phase dependencies are explicit (no implicit ordering)
- Risk register has at least 2 entries

## Fringe Cases

**No PRD exists**: Treat the user's description + the existing codebase as the spec. Read the file tree and package.json to infer context. Proceed without requiring a PRD — see "If no PRD" in Step 1.

**Project already has code**: Use feature mode. Read the existing architecture first. The file tree shows only new/modified files. Phase 0 must record the baseline typecheck and test state.

**Vague description**: If the user's description is too vague to produce verifiable end conditions, ask at most 2 clarifying questions before proceeding. Don't block on perfect clarity.

**If .planning/ does not exist**: Create it before writing the architecture document. If creation is not possible, present the architecture document inline and instruct the user to save it.

## Exit Protocol

```
---HANDOFF---
- Architecture: {app name}
- Document: .planning/architecture-{slug}.md
- Phases: {count}
- Estimated complexity: {low/medium/high}
- Next: Archon campaign ready to execute
---
```
