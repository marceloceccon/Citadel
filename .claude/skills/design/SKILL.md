---
name: design
description: >-
  Generates and maintains a design manifest for visual consistency. In existing
  projects, reads current styles and documents the design language. In new
  projects, asks a few questions and generates a starter manifest. The post-edit
  hook reads the manifest and flags deviations.
user-invocable: true
auto-trigger: false
effort: medium
---

# /design — Design Manifest Generator

## Identity

/design creates a design manifest that documents the visual language of a project.
The manifest is a living document that the post-edit hook reads to enforce consistency.
It's not a design system generator. It's a pattern extractor and enforcer.

## When to Use

- At the start of a new project (generate starter manifest from preferences)
- On an existing project that has no manifest (extract patterns from existing code)
- When visual inconsistency is noticed ("why do we have 4 different button styles?")
- When /do routes "design", "style guide", "visual consistency", "design manifest"

## Modes

### Extract Mode (existing project has styles)

Triggered when the project has CSS, Tailwind config, or component files.

1. Read `tailwind.config.*` (if exists) — extract custom colors, spacing, fonts, breakpoints
2. Read global CSS files (`globals.css`, `index.css`, `app.css`) — extract CSS variables, base styles
3. Scan 5-10 component files — extract repeated patterns:
   - Color values used 3+ times → documented as palette
   - Spacing values used 3+ times → documented as scale
   - Font sizes used → documented as type scale
   - Border radius values → documented as shape language
   - Shadow values → documented as elevation scale
   - Component patterns (card, button, input shapes)
4. Present findings to user: "Here's what I found in your codebase. Does this look right?"
5. Write the manifest after user confirms

### Generate Mode (new project or no existing styles)

Triggered when no CSS/Tailwind config exists or user says "new project."

Ask up to 4 questions:
1. "What's the overall feel? (minimal, playful, corporate, bold)" — or skip with a default
2. "Dark mode, light mode, or both?"
3. "Any brand colors? (hex values or 'no, pick for me')"
4. "Dense or spacious layout?"

Generate a starter manifest from the answers. Use sensible defaults for anything not specified.

## The Manifest

Write to `.planning/design-manifest.md`:

```markdown
# Design Manifest

> Generated: {date}
> Mode: {extracted | generated}
> Source: {tailwind.config.ts, globals.css, etc. | user preferences}

## Colors

### Primary Palette
- primary: {hex} — {usage: buttons, links, accents}
- primary-hover: {hex}
- primary-muted: {hex}

### Neutral Palette
- background: {hex}
- surface: {hex} — {cards, modals, elevated elements}
- border: {hex}
- text-primary: {hex}
- text-secondary: {hex}
- text-muted: {hex}

### Semantic
- success: {hex}
- warning: {hex}
- error: {hex}
- info: {hex}

## Typography

- font-family: {value}
- heading-font: {value, or "same as body"}
- Type scale: {xs, sm, base, lg, xl, 2xl, 3xl — with px/rem values}
- Line heights: {tight, normal, relaxed — with values}
- Font weights used: {list}

## Spacing

- Base unit: {4px / 0.25rem}
- Scale: {1, 2, 3, 4, 6, 8, 12, 16, 24 — in base units}
- Component padding: {standard value}
- Section gap: {standard value}
- Page margin: {standard value}

## Shape

- Border radius: {none, sm, md, lg, full — with values}
- Default radius: {which one is used most}
- Shadow scale: {sm, md, lg — with values}

## Layout

- Max content width: {value}
- Breakpoints: {sm, md, lg, xl — with values}
- Grid/flex preference: {which is used more}
- Spacing rhythm: {consistent gaps between sections}

## Component Patterns

{Only populated in extract mode or after the project has components}
- Button: {padding, radius, font-weight, transition}
- Card: {padding, radius, shadow, border}
- Input: {padding, radius, border-color, focus-ring}

## Anti-Patterns (things to flag)

- Colors not in the palette above
- Font sizes not in the type scale
- Spacing values not in the spacing scale
- Border radius values not matching the shape section
- Hardcoded colors instead of CSS variables or Tailwind classes
```

## Hook Integration

The post-edit hook (post-edit.js) checks for `.planning/design-manifest.md`.
If it exists:

1. When a CSS, TSX, JSX, or Tailwind file is edited:
2. Read the manifest's Anti-Patterns section and color palette
3. Scan the edited file for:
   - Hardcoded hex colors not in the palette (warn)
   - Font sizes not in the type scale (warn)
   - Spacing values that don't match the scale (warn, only for obviously wrong values)
   - Border radius values not in the shape section (warn)
4. Output: `[design] Found color #ff5733 not in design manifest palette. Defined colors: {list}`
5. Warnings only, not blocks. Same as dependency-aware linting.

Rules for the hook:
- If no manifest exists, skip entirely. Zero cost.
- Only scan the edited file, not the whole project.
- Read the manifest once per session (cache it).
- Don't flag Tailwind utility classes that map to the config (those ARE the manifest).
- Only flag raw values (hex colors, px values) that don't match.
- One warning per category per edit (not per occurrence).

## What /design Does NOT Do

- Generate a full design system (it's a manifest, not a component library)
- Override Tailwind config (it reads from it, not writes to it)
- Make design decisions for you (it documents YOUR decisions and enforces them)
- Block edits (warnings only, same as all Citadel hooks)
- Work without user confirmation (always presents findings before writing)
- Accumulate patterns automatically (that's Wave 5 — for now, manifests are explicit)

## Quality Gates

- Every manifest section has real values (not placeholders)
- Extract mode cites which files the values came from
- Generate mode defaults are sensible (not random)
- Anti-patterns section is populated based on the manifest values
