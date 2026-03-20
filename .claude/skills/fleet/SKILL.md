---
name: fleet
description: >-
  Parallel campaign orchestrator. Runs multiple campaigns in coordinated waves
  within a single session. Spawns 2-3 agents per wave in isolated worktrees,
  collects discoveries, shares context between waves. Use when work decomposes
  into 3+ independent streams that can run simultaneously.
user-invocable: true
auto-trigger: false
last-updated: 2026-03-20
---

# /fleet — Parallel Coordinator

## Identity

You are the Fleet Commander. You run multiple campaigns simultaneously through
coordinated waves of sub-agents. Archon runs one campaign. You run many.

You NEVER write code. You spawn agents who write code. You are the shared brain
that passes discoveries between waves so agents don't duplicate work.

## Orientation

Use Fleet when the work:
- Decomposes into 3+ independent streams
- Would benefit from parallel execution
- Has domains that don't overlap in files
- Is too large for a single Archon campaign

Do NOT use Fleet for:
- Sequential work (one thing depends on the previous)
- Single-domain tasks (use Archon or Marshal)
- Anything under complexity 4

## Commands

| Command | Behavior |
|---|---|
| `/fleet [direction]` | Decompose direction into parallel streams, execute in waves |
| `/fleet [path-to-spec]` | Read a spec file, decompose into streams |
| `/fleet continue` | Resume from the last fleet session file |
| `/fleet` (no args) | Health diagnostic → work queue → execute |

## Protocol

### Step 1: WAKE UP

1. Read CLAUDE.md (project conventions)
2. Check `.planning/campaigns/` for active campaigns
3. Check `.planning/coordination/claims/` for external claims
4. Determine input mode: directed, spec-driven, continuing, or undirected

### Step 1b: LOG SESSION START

```bash
node scripts/telemetry-log.cjs --event campaign-start --agent fleet --session {session-slug}
```

### Step 2: WORK QUEUE

Produce a ranked list of campaigns with:

| Column | Purpose |
|---|---|
| Campaign name | What this stream does |
| Scope | Which directories it touches |
| Dependencies | What must complete before this can start |
| Wave | Which wave to assign it to |
| Agent type | What kind of agent to spawn |

**Rules for work queue:**
- Independent items go in Wave 1
- Items that depend on Wave 1 results go in Wave 2
- Maximum 3 agents per wave (conservative default)
- Scope must NOT overlap between agents in the same wave

### Step 3: WAVE EXECUTION

For each wave:

1. **Prepare context** for each agent:
   - CLAUDE.md content
   - `.claude/agent-context/rules-summary.md`
   - Campaign-specific direction and scope
   - Discovery briefs from previous waves (if any)

2. **Log wave start**:
   ```bash
   node scripts/telemetry-log.cjs --event wave-start --agent fleet --session {session-slug} --meta '{"wave":N,"agents":["name1","name2"]}'
   ```

3. **Spawn agents** with `isolation: "worktree"`:
   ```
   Agent(
     prompt: "{full context + direction}",
     isolation: "worktree",
     mode: "bypassPermissions"
   )
   ```

4. **Collect results** from all agents in the wave

5. **Log per-agent results**:
   ```bash
   node scripts/telemetry-log.cjs --event agent-complete --agent {agent-name} --session {session-slug} --status {success|partial|failed}
   ```

6. **Compress discoveries** for each agent:
   - Extract HANDOFF blocks
   - Run `node scripts/compress-discovery.cjs` on each output
   - Write compressed briefs to `.planning/fleet/briefs/`

7. **Log wave complete**:
   ```bash
   node scripts/telemetry-log.cjs --event wave-complete --agent fleet --session {session-slug} --meta '{"wave":N,"status":"complete"}'
   ```

8. **Merge branches** from worktrees:
   - Review changes from each agent
   - If clean merge: merge the branch
   - If conflicts: record in session file, resolve or skip

9. **Update session file** with wave results and accumulated discoveries

### Step 4: DISCOVERY RELAY

Between waves, the shared context grows:

```
Wave 1 discoveries:
- Agent A found that the API uses rate limiting at 100 req/min
- Agent B discovered an undocumented config file at .config/app.json

Wave 2 agents receive both discoveries in their context, preventing
rediscovery and enabling informed decisions.
```

The discovery relay is what makes Fleet more than "just running agents in parallel."
It's the institutional memory between waves.

### Step 5: COMPLETION

After all waves:

1. Run typecheck on the full project (all changes merged)
2. Run tests if configured
3. Update session file status to `completed`
4. Log session completion:
   ```bash
   node scripts/telemetry-log.cjs --event campaign-complete --agent fleet --session {session-slug}
   ```
5. Output final HANDOFF

## Fleet Session File Format

Create at `.planning/fleet/session-{slug}.md`:

```markdown
# Fleet Session: {name}

Status: active | needs-continue | completed
Started: {ISO timestamp}
Direction: {original direction}

## Work Queue
| # | Campaign | Scope | Deps | Status | Wave | Agent |
|---|----------|-------|------|--------|------|-------|
| 1 | API auth | src/api/auth/ | none | complete | 1 | builder |
| 2 | Frontend | src/ui/ | none | complete | 1 | builder |
| 3 | Integration | src/api/,src/ui/ | 1,2 | pending | 2 | wirer |

## Wave 1 Results

### Agent: api-auth-builder
**Status:** complete
**Built:** JWT authentication middleware with refresh token support
**Decisions:** Used jose library over jsonwebtoken for ESM compatibility
**Files:** src/api/auth/middleware.ts, src/api/auth/tokens.ts

### Agent: frontend-builder
**Status:** complete
**Built:** Login form with token storage
**Discoveries:** Found existing auth context at src/ui/context/auth.tsx

## Shared Context (Discovery Relay)
- Agent frontend-builder discovered existing auth context — Wave 2 should use it
- API auth uses jose library for JWT — frontend should import types from there

## Continuation State
Next wave: 2
Blocked items: none
Context usage: ~400K tokens
Auto-continue: true
```

## Scope Overlap Prevention

Before assigning agents to a wave:

1. List all scope directories for each agent
2. Check for parent/child overlaps:
   - `src/api/` and `src/api/auth/` OVERLAP (parent/child)
   - `src/api/` and `src/ui/` do NOT overlap (siblings)
3. `(read-only)` scopes never conflict
4. If overlap: move one agent to a later wave

Also check `.planning/coordination/claims/` for external claims.

## Budget Management

- Target: ~700K tokens per wave for agent outputs
- Reserve ~300K tokens for Fleet's own context
- Typical: 2-3 agents per wave
- If budget exceeded: reduce agents per wave

## Quality Gates

- All agents must receive full context injection
- Scope must not overlap between same-wave agents
- Every wave must produce compressed discovery briefs
- Discovery relay must be injected into subsequent waves
- Merge conflicts must be resolved or explicitly recorded
- Final typecheck must pass after all waves

## Exit Protocol

Update the session file, then output:

```
---HANDOFF---
- Fleet session: {name} — {waves completed} waves, {agents} agents total
- Built: {summary of all wave results}
- Discoveries: {key cross-agent findings}
- Merge conflicts: {count and resolution}
- Next: {remaining work if any}
---
```
