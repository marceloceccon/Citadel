---
name: organize
description: >-
  Three-pass project health scan: architectural compliance (are source files in
  the right layers?), filesystem hygiene (loose files, misplaced assets, stale
  artifacts), and bloat detection (oversized files, binaries in git, compressible
  assets). Reports composite score. Also manages enforceable directory manifests
  and dynamic directory lifecycle.
user-invocable: true
auto-trigger: false
trigger_keywords:
  - organize
  - directory structure
  - folder structure
  - project structure
  - file organization
  - organize directories
  - organize files
  - cleanup directories
  - directory convention
  - where should this go
  - messy project
  - project health
  - bloat
last-updated: 2026-03-28
---

# /organize -- Project Organization Health

## Identity

You are a project health analyst. You run three passes on every scan:
architectural compliance, filesystem hygiene, and bloat detection. You report
all three scores and a composite so the user gets an honest picture of their
project's organization -- not just whether source files are in the right
folders, but whether the project as a whole is clean, lean, and well-maintained.
You never impose structure -- you discover it, propose it, and lock it only
when the user agrees.

## Orientation

**Use when:**
- User wants to know if their project is organized (the default scan answers this)
- Setting up a new project and want consistent directory conventions
- Existing project has grown messy and needs structure alignment
- User asks "where should this file go?" or "how is this project organized?"
- Running `/organize --cleanup` to prune expired dynamic directories
- Running `/organize --audit` to check current compliance

**Do NOT use when:**
- Refactoring code (use `/refactor` instead)
- Moving a single file (just move it directly)
- The project already has an organization manifest and the user hasn't asked to change it

**What this skill needs:**
- A project directory to scan (defaults to PROJECT_ROOT)
- User input on convention preference (if not already configured)

## Commands

| Command | Behavior |
|---|---|
| `/organize` | Full flow: scan, detect, recommend, configure |
| `/organize --audit` | Check current files against the manifest, report violations |
| `/organize --cleanup` | Run dynamic directory cleanup based on TTL policy |
| `/organize --show` | Display current organization manifest |
| `/organize --unlock` | Set `locked: false` so enforcement is advisory |
| `/organize --lock` | Set `locked: true` so enforcement blocks violations |

## Protocol

### Step 1: CHECK -- Read Existing Configuration

1. Read `.claude/harness.json` and check for an `organization` key
2. **If `organization` exists and user ran bare `/organize`:**
   - Display current convention, root count, placement rule count, dynamic dir count
   - Ask: "Your organization manifest is already configured. Want to **audit** current
     compliance, **adjust** the rules, or **reconfigure** from scratch?"
   - Route based on answer: audit -> Step 6, adjust -> Step 4, reconfigure -> Step 2
3. **If `organization` exists and user ran `--audit`:** Jump to Step 6
4. **If `organization` exists and user ran `--cleanup`:** Jump to Step 7
5. **If no `organization` key:** Continue to Step 2

### Step 2: SCAN -- Three-Pass Project Analysis

Every scan runs all three passes. This is not optional. A user running `/organize`
gets the full picture without having to know what to ask for.

**Do NOT use `find` or `Get-ChildItem`** anywhere in this skill -- these are
platform-specific. Use the **Glob tool** and **Bash** (`git ls-files`, `du`,
`wc`) for cross-platform compatibility.

---

#### Pass 1: Architectural Compliance

Map the project's directory tree and check whether source files follow a
consistent convention.

1. Use the **Glob tool** with pattern `**/` to discover directories. Filter out noise
   directories: `node_modules`, `.git`, `.planning`, `.citadel`,
   `.claude`, `dist`, `build`, `__pycache__`, `.next`, `target`, `.venv`, `venv`.
   Cap at 200 directories. If the project is too large, scan only the top 3 levels
   (`*/`, `*/*/`, `*/*/*/`).
2. Read `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, or equivalent to understand the stack
3. Read harness.json for `language` and `framework` fields
4. Count files per directory to find the "heavy" areas (where most code lives)
5. Check for existing convention signals:
   - `src/components/`, `src/hooks/`, `src/utils/` -> **layer-based**
   - `src/features/auth/`, `src/features/dashboard/` -> **feature-based**
   - `src/auth/components/`, `src/auth/hooks/` -> **hybrid** (features containing layers)
   - Flat `src/` with no subdirectories -> **flat**
   - Mixed signals -> **custom** (needs user input)
6. If an organization manifest exists, check each placement rule against current files.
   Count compliant vs. violating files.

Record findings:

```
Detected: {convention}
Confidence: {high|medium|low}
Roots: [{path, purpose, file_count}]
Signals: [{pattern, evidence, convention_match}]
Anomalies: [{path, issue}]  // dirs that don't fit the detected pattern
```

**Scoring:** `architecture_score = compliant_files / total_source_files * 100`.
If no manifest exists yet, score is based on how consistently the detected
convention is followed (files fitting the pattern vs. total files).

---

#### Pass 2: Filesystem Hygiene

Check for mess that has nothing to do with code architecture.

1. **Loose files in project root.** List every file in the project root. The
   following are expected root files -- everything else is a finding:
   - Config files: `package.json`, `tsconfig*.json`, `*.config.{js,ts,mjs,cjs}`,
     `.eslintrc*`, `.prettierrc*`, `babel.config.*`, `jest.config.*`,
     `vite.config.*`, `next.config.*`, `rollup.config.*`, `webpack.config.*`,
     `Cargo.toml`, `pyproject.toml`, `go.mod`, `Makefile`, `Dockerfile`,
     `docker-compose*.yml`, `.env*`, `.editorconfig`, `.gitignore`,
     `.gitattributes`, `.npmrc`, `.nvmrc`, `.node-version`, `.tool-versions`
   - Docs: `README*`, `LICENSE*`, `CHANGELOG*`, `CONTRIBUTING*`, `CLAUDE.md`,
     `QUICKSTART*`, `CODE_OF_CONDUCT*`, `SECURITY*`
   - CI/lock files: `*.lock`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`,
     `Gemfile.lock`, `.github/`, `.husky/`
   - Plugin/harness: `.claude/`, `.planning/`, `.citadel/`, `hooks/`, `hooks_src/`,
     `skills/`, `agents/`, `scripts/`
   - Any file listed in `.gitignore` (already excluded from concern)

   Everything else in root (especially images, PDFs, ZIPs, random scripts,
   stray source files) is a finding.

2. **Images and assets outside designated directories.** Glob for
   `**/*.{png,jpg,jpeg,gif,svg,ico,webp,mp4,mp3,wav,pdf}`. Check if they
   live under a recognized asset directory (`assets/`, `public/`, `static/`,
   `images/`, `img/`, `media/`, `docs/images/`, `src/assets/`). Files outside
   these paths are findings.

3. **Large files (>1 MB).** Use `git ls-files -z | xargs -0 stat` or equivalent
   to find tracked files over 1 MB. Report each with path and size. These are
   often forgotten build artifacts, uncompressed assets, or vendored binaries.

4. **Empty directories.** Glob for directories, check which contain zero files
   (excluding `.gitkeep`). Report as clutter.

5. **Stale files in active directories.** Use `git log --diff-filter=M --format=%at`
   on files in `src/` (or equivalent active source root). Files not modified in
   6+ months while their sibling files are active may be dead code or forgotten
   experiments. Report as "potentially stale" -- advisory, not a violation.

6. **Duplicate filenames.** Scan for files with identical names in different
   directories (e.g., `utils.ts` appearing in 3 places). Not always wrong, but
   worth flagging for awareness.

**Scoring:** Start at 100, deduct:
- -2 per loose non-standard file in project root
- -1 per misplaced asset file (image/media outside asset dirs)
- -3 per large file (>1 MB) tracked in git
- -1 per empty directory
- -0.5 per potentially stale file (capped at -10)
- -0.5 per duplicate filename (capped at -5)

Floor at 0. `hygiene_score = max(0, 100 - deductions)`.

---

#### Pass 3: Bloat Detection

Check whether the project is carrying unnecessary weight.

1. **Project size vs. source size.** Calculate:
   - Total tracked size: `git ls-files -z | xargs -0 stat` (sum sizes)
   - Source code size: same but filtered to code file extensions
     (`.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.rs`, `.go`, `.java`, `.css`,
     `.scss`, `.html`, `.md`)
   - Ratio: `source_bytes / total_bytes`. A healthy project is >60% source.
     Below 40% means non-source content dominates.

2. **Largest files ranked.** List the top 10 largest tracked files with sizes.
   This alone often reveals the problem.

3. **Binary files in git.** Glob for tracked files that are binary:
   `*.{png,jpg,jpeg,gif,ico,webp,mp4,mp3,wav,woff,woff2,ttf,eot,zip,tar,gz,
   jar,dll,so,dylib,exe,bin,dat,db,sqlite,pdf}`.
   For each, check if it could live in `.gitignore` (build output, generated
   asset) or should be in Git LFS. Report count and total size.

4. **Accidentally committed directories.** Check if any of these exist as
   tracked paths: `node_modules/`, `dist/`, `build/`, `.next/`, `target/`,
   `__pycache__/`, `.venv/`, `venv/`, `.cache/`, `.parcel-cache/`,
   `.turbo/`, `coverage/`. Any hit is a critical finding.

5. **Compressible assets.** For image files tracked in git, check for:
   - PNGs over 500 KB (likely uncompressed screenshots or exports)
   - SVGs over 100 KB (likely unoptimized exports from design tools)
   - Any video/audio file (should almost never be in a git repo)

**Scoring:** Start at 100, deduct:
- If source ratio <60%: -(60 - ratio) (e.g., 40% source = -20)
- -5 per accidentally committed build/dependency directory
- -2 per binary file in git that should be gitignored or in LFS
- -1 per compressible asset (PNG >500KB, SVG >100KB)
- -3 per video/audio file tracked in git

Floor at 0. `bloat_score = max(0, 100 - deductions)`.

---

#### Composite Score

After all three passes:

```
composite_score = round(
  architecture_score * 0.40 +
  hygiene_score * 0.35 +
  bloat_score * 0.25
)
```

Architecture is weighted highest because it affects developer velocity most.
Hygiene is close behind because it affects first impressions and onboarding.
Bloat is lowest because it's the easiest to fix.

**Always report all four numbers.** Never report just the architecture score.

```
=== Project Health: {project_name} ===

Architecture:  {score}%  -- source file placement, layer boundaries, test colocation
Hygiene:       {score}%  -- loose files, misplaced assets, stale artifacts, empty dirs
Bloat:         {score}%  -- project size ratio, binaries in git, compressible assets
-------------------------------
Overall:       {composite}%
```

Follow the scores with the most actionable findings from each pass. Group by
severity (critical first, advisory last). Cap at 10 findings per pass to avoid
overwhelming the user -- mention "and N more" if truncated.

### Step 3: RECOMMEND -- Present Options

Based on scan results, present the user with a tailored recommendation.

**If confidence is HIGH (strong existing convention):**

```
Your project follows a {convention}-based structure.

Detected roots:
  src/components/  -- React components (42 files)
  src/hooks/       -- Custom hooks (12 files)
  src/utils/       -- Utility functions (8 files)
  src/types/       -- Type definitions (6 files)

Anomalies:
  src/helpers/     -- Looks like it overlaps with utils/ (3 files)

Recommendation: Lock this convention so new files follow it.
Want me to [Accept], [Adjust], or [Show alternatives]?
```

**If confidence is MEDIUM (partial convention):**

```
Your project partially follows a {convention}-based structure, but I found
{N} directories that don't fit the pattern.

Here are the conventions I detected and alternatives that might work:

1. {detected} (current, {N}% match)
   - Pro: Matches most of what's already here
   - Con: {anomalies} directories would need reorganizing

2. {alternative} ({M}% match if reorganized)
   - Pro: {benefit}
   - Con: Requires moving {K} directories

3. Custom -- Define your own rules

Which would you prefer? [1/2/3]
```

**If confidence is LOW (no clear convention):**

```
Your project doesn't follow a clear directory convention yet. Here are
options that fit your stack ({language}/{framework}):

1. Feature-based -- Group by domain (auth/, dashboard/, settings/)
   Best for: Apps with distinct functional areas

2. Layer-based -- Group by technical role (components/, hooks/, utils/)
   Best for: Libraries, small-medium apps

3. Hybrid -- Features containing layers (auth/components/, auth/hooks/)
   Best for: Large apps that need both domain and technical organization

4. Flat -- Minimal directories, files at top level
   Best for: Small utilities, scripts, single-purpose projects

5. Custom -- Tell me your preferred structure

Which fits your workflow? [1/2/3/4/5]
```

Wait for user response before proceeding.

### Step 4: CONFIGURE -- Write the Organization Manifest

Based on the user's choice (or acceptance of recommendation), build the manifest.

**4a. Build the roots tree:**

For each detected root directory, create an entry:
```json
{
  "purpose": "short description of what belongs here",
  "children": { ... }  // recursive, only if subdirectories have distinct purposes
}
```

Only go 2-3 levels deep. Deeper structure is the domain of individual features.

**4b. Build placement rules:**

Placement rules tell the enforce hook where specific file types belong.
Derive these from the detected convention:

| Convention | Example Rules |
|---|---|
| Feature-based | `*.test.ts` -> colocated with source, `*.types.ts` -> colocated |
| Layer-based | `*.test.ts` -> `__tests__/` or `tests/`, `*.types.ts` -> `types/` |
| Hybrid | `*.test.ts` -> colocated within feature, `*.types.ts` -> `{feature}/types/` |
| Flat | No placement rules (everything at top level) |

For each rule:
```json
{
  "glob": "*.test.{ts,tsx}",
  "rule": "colocated",
  "target": null,
  "reason": "Tests live next to the code they test"
}
```

- `rule: "colocated"` -- file must be in the same directory as its source
- `rule: "sibling-dir"` -- file must be in `target` directory adjacent to source
- `rule: "root-dir"` -- file must be under `target` from project root
- `rule: "within-root"` -- file must be under one of the declared roots

Ask the user if they want to adjust any rules before writing.

**4c. Build dynamic directory entries:**

Scan for directories that are created dynamically by the harness or tools:

```json
[
  { "path": ".planning/screenshots/", "scope": "session", "cleanup": "empty-on-expire" },
  { "path": ".planning/fleet/outputs/", "scope": "campaign", "cleanup": "archive-then-delete" },
  { "path": ".planning/fleet/briefs/", "scope": "campaign", "cleanup": "archive-then-delete" },
  { "path": ".planning/coordination/claims/", "scope": "session", "cleanup": "empty-on-expire" },
  { "path": ".planning/coordination/instances/", "scope": "session", "cleanup": "empty-on-expire" }
]
```

Scopes:
- `session` -- contents expire when the session ends
- `campaign` -- contents expire when the associated campaign completes
- `task` -- contents expire when a specific task completes
- `permanent` -- never cleaned up automatically

Cleanup strategies:
- `empty-on-expire` -- delete contents but keep the directory
- `archive-then-delete` -- move to `.planning/archive/{date}/` then delete
- `delete` -- remove directory and contents entirely
- `ignore` -- mark as dynamic but never auto-clean

**4d. Set cleanup policy:**

Ask the user:
```
When dynamic directories expire, how should cleanup work?
1. Auto -- Clean up silently on session end
2. Prompt -- Show what would be cleaned and ask first
3. Manual -- Just report stale directories, don't touch them

[1/2/3] (default: 2)
```

**4e. Write to harness.json:**

Read the current harness.json, merge the `organization` key, write back.
Do NOT overwrite other keys. Use a read-modify-write pattern.

```json
{
  "organization": {
    "convention": "layer",
    "roots": { ... },
    "placement": [ ... ],
    "dynamic": [ ... ],
    "cleanupPolicy": "prompt",
    "locked": false
  }
}
```

Set `locked: false` initially. Tell the user they can run `/organize --lock`
once they're confident the rules are correct.

### Step 5: VERIFY -- Confirm the Manifest Works

1. Run a full three-pass audit (Step 6 logic) against the current codebase
2. Report all three scores plus composite
3. If composite is below 60%, warn the user:
   "Overall project health is {N}%. Here are the biggest issues to address."
4. If architecture score is above 80% but hygiene or bloat is below 60%, call it out:
   "Your code structure is solid ({arch}%), but hygiene ({hyg}%) and bloat
   ({bloat}%) are dragging down overall health. The fixes are mostly quick wins."
5. Tell the user about `--lock`, `--audit`, and `--cleanup` commands

### Step 6: AUDIT -- Full Three-Pass Health Check

Run all three passes from Step 2 (architecture, hygiene, bloat). This is the
same logic whether called from `--audit`, from Step 5 verification, or from
the initial `/organize` flow.

Output the composite score block first, then details:

```
=== Project Health: {project_name} ===

Architecture:  {score}%  -- source file placement, layer boundaries, test colocation
Hygiene:       {score}%  -- loose files, misplaced assets, stale artifacts, empty dirs
Bloat:         {score}%  -- project size ratio, binaries in git, compressible assets
-------------------------------
Overall:       {composite}%

--- Architecture ({N} violations) ---

  *.test.ts should be colocated:
    - tests/auth.test.ts -> should be src/auth/auth.test.ts

  *.types.ts should be in types/:
    - src/components/Button.types.ts -> should be types/Button.types.ts

--- Hygiene ({N} findings) ---

  Loose files in project root (not config/docs):
    - screenshot.png
    - old-notes.txt
    - data-export.csv

  Images outside asset directories:
    - src/components/logo.png -> should be src/assets/ or public/

  Large files (>1 MB):
    - docs/demo-recording.mp4 (12.3 MB)

  Empty directories:
    - src/deprecated/

--- Bloat ({N} findings) ---

  Source ratio: 45% (1.2 MB source / 2.7 MB total)

  Top 5 largest files:
    1. docs/demo-recording.mp4  (12.3 MB)
    2. public/hero-bg.png       (2.1 MB)
    ...

  Binary files that could be gitignored:
    - coverage/lcov.info (generated)
    - dist/bundle.js (build output)

--- Suggested Actions ---
  [List concrete fixes, grouped: quick wins first, larger reorganizations last]

Run quick fixes (move misplaced files, delete empty dirs)? [y/n]
```

If the user says yes, execute the safe fixes (moves, empty dir removal).
Never auto-delete files with content -- only move them or flag for manual review.

### Step 7: CLEANUP -- Prune Dynamic Directories

Read the `dynamic` entries from the organization manifest.

For each entry:

1. Check if the directory exists
2. Determine if it has expired based on scope:
   - `session`: check `.planning/telemetry/` for last session end timestamp.
     If the directory has files older than the last session start, they're stale.
   - `campaign`: check `.planning/campaigns/` for associated campaign status.
     If campaign is `completed` or `parked`, contents are stale.
   - `task`: check if the task ID in the directory name/metadata still exists.
   - `permanent`: skip
3. For expired entries, apply the cleanup strategy:
   - `empty-on-expire`: `rm` contents, keep directory
   - `archive-then-delete`: create `.planning/archive/{YYYY-MM-DD}/`, move contents there, then empty
   - `delete`: `rm -rf` the directory (recreate if it's in PLANNING_DIRS)
   - `ignore`: report but don't touch

**Respect cleanupPolicy:**

- `auto`: execute cleanup, report what was done
- `prompt`: list what would be cleaned, ask for confirmation before each category
- `manual`: list stale directories with sizes, do not modify anything

Output:

```
=== Cleanup Report ===

Scanned: {N} dynamic directories
Stale: {M} directories ({total_size})

{For each stale dir:}
  .planning/screenshots/ (session-scoped, 12 files, 4.2 MB)
    Strategy: empty-on-expire
    Action: {Cleaned | Would clean | Skipped}

  .planning/fleet/outputs/ (campaign-scoped, campaign "improve-citadel" completed)
    Strategy: archive-then-delete
    Action: {Archived to .planning/archive/2026-03-28/ | Would archive | Skipped}

Summary: {N} directories cleaned, {M} archived, {K} skipped
```

## Fringe Cases

- **No directories found:** Project is a single file or empty. Skip scan, suggest flat convention.
- **Monorepo detected** (multiple package.json files): Scan each package root separately.
  Ask if organization should be per-package or repo-wide.
- **User changes convention:** When switching from one convention to another, warn about the
  number of files that would need to move. Do NOT auto-move without explicit confirmation.
- **Conflict with existing rules:** If harness.json already has `protectedFiles` that conflict
  with placement rules, warn and ask which takes precedence.
- **Dynamic dir doesn't exist yet:** Keep the entry in the manifest. The enforce hook or
  init-project will create it when needed. Don't warn about missing dynamic dirs.
- **Archive directory grows large:** If `.planning/archive/` exceeds 50MB, warn the user
  and suggest manual pruning.

## Quality Gates

All of these must be true before the skill exits:

- [ ] All three passes ran (architecture, hygiene, bloat) -- never skip a pass
- [ ] All three scores plus composite were reported to the user
- [ ] Project directory tree was scanned (Step 2 completed or skipped with existing config)
- [ ] User was presented with options and made a choice (not auto-decided without input)
- [ ] Organization manifest written to harness.json under `organization` key
- [ ] Placement rules are specific (glob + rule + reason, no vague entries)
- [ ] Dynamic directory entries have valid scope and cleanup strategy
- [ ] User was told about `--lock`, `--audit`, and `--cleanup` commands
- [ ] No other harness.json keys were modified during the write

## Exit Protocol

```
---HANDOFF---
- Health: {composite}% (Architecture {arch}%, Hygiene {hyg}%, Bloat {bloat}%)
- Convention: {convention} applied to {project}
- {N} roots, {M} placement rules, {K} dynamic directories configured
- Top findings: {1-2 most impactful issues from hygiene/bloat passes}
- Enforcement: {"advisory (unlocked)" | "blocking (locked)"}
- Next: Run `/organize --lock` when confident, `/organize --audit` to recheck
---
```
