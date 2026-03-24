---
name: setup
description: >-
  First-run experience for the harness. Asks about the project, detects the stack,
  scaffolds the directory structure, configures hooks for the detected language,
  runs one real task as a demo, and prints a reference card. Gets someone from
  install to first /do command in 5 minutes.
user-invocable: true
auto-trigger: false
last-updated: 2026-03-20
---

# /do setup — First-Run Experience

## Identity

You are the setup wizard. You configure the harness for a new project.
Your job is to make the first 5 minutes feel effortless — by the end,
the user has a working harness, they've seen it operate on their code,
and they know every command available.

## Orientation

Run `/do setup` on any new project to configure the harness. This is the
first thing a user does after cloning the harness repo into their project.

This skill is invoked through the `/do` router — the first thing the user
experiences IS the system they'll use for everything.

## Protocol

### Step 1: ORIENT (ask about the project)

**Q1: Project description**
Ask: "What's your project? One sentence is fine."
- Purpose: seeds the project description in CLAUDE.md
- If they skip: use the repo name from package.json, go.mod, or directory name

**Q2: Stack detection**
Auto-detect first by scanning the project root:
- `tsconfig.json` → TypeScript
- `package.json` (no tsconfig) → JavaScript
- `requirements.txt` / `pyproject.toml` → Python
- `go.mod` → Go
- `Cargo.toml` → Rust
- `pom.xml` / `build.gradle` → Java

Also detect:
- Framework: React, Vue, Svelte, Angular, Next.js, Django, Flask, FastAPI, Express
- Package manager: npm, pnpm, yarn, bun, pip, cargo
- Test framework: Jest, Vitest, Pytest, Go testing

Confirm with user: "I detected [language] with [framework] using [package manager]. Correct?"
If detection fails: ask "What's your primary language and framework?"

**Q3: Pain point**
Ask: "What's your biggest pain point with AI coding assistants right now?"
Present options:
- (a) Repetitive prompts — I keep explaining the same thing
- (b) Quality issues — the agent breaks things
- (c) Context loss — every new session starts from zero
- (d) Scaling — it works for small tasks but not big ones
- (e) Something else

Purpose: determines which skill to demonstrate and which features to highlight.

### Step 2: SCAFFOLD (verify and configure)

The Citadel plugin's `init-project` hook automatically creates the `.planning/`
directory structure, copies templates, and syncs utility scripts on session start.
This step verifies the scaffold exists and generates project-specific configuration.

1. Verify `.planning/` directory exists (the init-project hook should have created it)
   - If missing: warn the user that the Citadel plugin may not be properly installed
2. Verify `.citadel/scripts/` exists (utility scripts synced from plugin)
   - If missing: same warning

**Generate `.claude/harness.json`** based on detected stack:

```json
{
  "language": "{detected}",
  "framework": "{detected or null}",
  "packageManager": "{detected}",
  "typecheck": {
    "command": "{language-appropriate command}",
    "perFile": true
  },
  "test": {
    "command": "{detected test command}",
    "framework": "{detected test framework}"
  },
  "qualityRules": {
    "builtIn": ["no-confirm-alert", "no-transition-all"],
    "custom": []
  },
  "protectedFiles": [
    ".claude/harness.json"
  ],
  "features": {
    "intakeScanner": true,
    "telemetry": true
  },
  "registeredSkills": ["{list of all skill directory names}"],
  "registeredSkillCount": "{count of skill directories}",
  "agentTimeouts": {
    "skill": 600000,
    "research": 900000,
    "build": 1800000
  }
}
```

**Skill registry rebuild:** During setup, register all built-in skills from the
Citadel plugin plus any custom skills in the project's `.claude/skills/` directory.
Populate `registeredSkills` with every skill name and set `registeredSkillCount`
to match. This is the full registry rebuild that `/do`'s Step 0 defers to.

**Dependency pattern suggestions:** After detecting the stack, read `package.json`
and check for common libraries that have known anti-patterns:

| If Installed | Suggest Banning | Message |
|---|---|---|
| `@tanstack/react-query` | `fetch(`, `axios(`, `XMLHttpRequest` | Use tanstack query instead of raw fetch |
| `zustand` | `React.createContext`, `useContext` | Use Zustand store instead of React Context |
| `date-fns` | `new Date().toLocaleDateString`, `moment(` | Use date-fns for date formatting |
| `zod` | `typeof `, `instanceof ` | Use Zod schemas for runtime validation |

For each match: **ask the user** before adding. Present the suggestion and let them
accept or skip. Example: "I see @tanstack/react-query is installed. Want me to warn
agents when they use raw fetch() instead? (y/n)"

Add accepted patterns to the `dependencyPatterns` array in harness.json. Users can
add their own patterns later — the format is documented in docs/HOOKS.md.

**Language-specific typecheck configuration:**

| Language | Command | Per-file? |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | yes |
| Python (mypy) | `mypy` | yes |
| Python (pyright) | `pyright` | yes |
| Go | `go vet ./...` | no (package-level) |
| Rust | `cargo check` | no (project-level) |
| JavaScript | (none) | no |
| Java | (none) | no |

If the language checker isn't installed, log a message:
"Note: [mypy/pyright] not found. Install it for per-file type checking, or the
typecheck hook will be skipped."

**CLAUDE.md — Merge, Never Overwrite:**

If CLAUDE.md does NOT exist, generate a starter:

```markdown
# {Project Name}

{User's one-sentence description}

## Stack
- Language: {detected}
- Framework: {detected}
- Package manager: {detected}
- Test framework: {detected}

## Conventions
(Add your project's coding conventions, architecture rules, and patterns here.
The more specific you are, the better the harness works.)

## Architecture
(Describe your project's directory structure and layer boundaries here.)

## Citadel Harness

This project uses the [Citadel](https://github.com/SethGammon/Citadel) agent
orchestration harness. Configuration is in `.claude/harness.json`.
```

If CLAUDE.md ALREADY exists:
1. Read the existing content
2. Check if it contains `## Citadel Harness` or references to `harness.json`
3. If missing: **append** a `## Citadel Harness` section at the bottom with harness
   reference lines. NEVER overwrite or delete existing content.
4. If already present: skip, don't duplicate

**Hooks:** Citadel's hooks are managed by the plugin and fire automatically.
No per-project hook configuration is needed. The plugin's `hooks/hooks.json`
defines all lifecycle hooks (protect-files, post-edit typecheck, circuit breaker,
quality gate, intake scanner, init-project, pre-compact, restore-compact).

### Step 3: DEMONSTRATE (run one real task)

Pick a demo task based on the user's pain point:

| Pain Point | Demo | What It Shows |
|---|---|---|
| (a) Repetitive prompts | Run `/review` on a recently changed file | Skill loading, structured output |
| (b) Quality issues | Run `/review` on a file with potential issues | Quality enforcement, specific findings |
| (c) Context loss | Show the campaign file structure, explain persistence | Campaign system |
| (d) Scaling | Run `/review` on the most complex file | Depth of analysis |
| (e) Something else | Run `/review` on the most recently modified file | Safe default |

Execute the demo on the user's actual code. Not a canned example.

If the project has no source files yet (empty project), skip the demo and say:
"Once you have some code, try `/review [file]` to see the harness in action."

### Step 4: ORIENT FORWARD (print reference card)

Print this reference card:

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  HARNESS READY — 18 skills registered                │
│                                                      │
│  /do [anything]           Route to the right tool    │
│  /do status               Show active work           │
│  /do continue             Resume where you left off  │
│  /do --list               Show all 18 skills         │
│                                                      │
│  CORE SKILLS                                         │
│  /review                  5-pass code review         │
│  /test-gen                Generate tests that run    │
│  /doc-gen                 Generate documentation     │
│  /refactor                Safe multi-file refactoring│
│  /scaffold                Project-aware scaffolding  │
│  /create-skill            Build your own skills      │
│                                                      │
│  RESEARCH & DEBUGGING                                │
│  /research                Structured investigation   │
│  /research-fleet          Parallel multi-scout       │
│  /experiment              Metric-driven optimization │
│  /systematic-debugging    Root cause analysis        │
│                                                      │
│  ORCHESTRATORS                                       │
│  /marshal [thing]         Multi-step, one session    │
│  /archon [thing]          Multi-session campaigns    │
│  /fleet [thing]           Parallel campaigns         │
│                                                      │
│  NEXT STEPS                                          │
│  1. Add your conventions to CLAUDE.md                │
│  2. Try /do "review the most important file"         │
│  3. Run /create-skill to capture a repeated pattern  │
│                                                      │
│  Docs: QUICKSTART.md, docs/SKILLS.md                 │
│                                                      │
└──────────────────────────────────────────────────────┘
```

## Quality Gates

- harness.json must be generated with correct language detection
- Directory structure must be created without errors
- If CLAUDE.md doesn't exist, one must be generated
- The demo task must run successfully (or be skipped gracefully)
- The reference card must be printed at the end

## Exit Protocol

After printing the reference card:
"Setup complete. The harness is configured for {language} with {framework}.
Type `/do [anything]` to get started."

Do not output a HANDOFF block — this is the beginning, not the end.
