---
name: reaper2ma-frontend
description: Project-specific guidance for updating the reaper2ma SvelteKit static frontend. Use when editing Svelte components, upload UI, styling, accessibility, assets, static adapter settings, base path handling, build scripts, or GitHub Pages deployment.
---

# Reaper2MA Frontend

## Overview

Use this skill to change the SvelteKit app while preserving its static, browser-only behavior. The frontend is the product surface and currently also contains the conversion logic.

## First steps

1. Read `research.md` for architecture, validation, and known watchpoints.
2. Inspect `src/routes/+page.svelte`; it contains the page script, markup, and CSS.
3. Use `pnpm`, not yarn, for local work.
4. Keep the app deployable as static files under `/reaper2ma` in production.

## SvelteKit constraints

- `svelte.config.js` uses `@sveltejs/adapter-static`.
- Production `kit.paths.base` is `/reaper2ma`; development base is empty.
- `src/routes/+layout.server.ts` exports `prerender = true`.
- There are no server endpoints. Do not add server-side file handling unless explicitly requested.
- Keep file processing private and local in the browser.

## UI guidance

- Keep the first screen as the actual converter, not a marketing landing page.
- Preserve drag/drop and file input workflows when changing upload UI.
- Keep export mode behavior clear: `cues-and-timecode` enables drive import behavior; `cues-only` disables drive input.
- Maintain responsive behavior for the settings grid and instructions.
- Keep light/dark theme variables consistent if changing colors.
- Fix accessibility issues opportunistically when in the same area, especially duplicate IDs, labels, keyboard behavior, and inline error states.
- When adding syntax help, prefer short actionable sections over long prose and show concrete marker examples for `BPM`, `CueFade`, cue timing tags, `Temp` / `Flash`, and execution overrides.

## Build and deployment

- Local canonical commands are `pnpm check` and `pnpm build`.
- The existing GitHub Pages workflow uses yarn despite the pnpm lockfile. If editing CI, align it with pnpm and `pnpm install --frozen-lockfile`.
- Do not commit `node_modules`, `.svelte-kit`, or `build`.
- Be careful with asset paths because production runs under `/reaper2ma`.

## Watchpoints

- `src/routes/+page.svelte` is large; consider extracting components or conversion code only when it reduces risk.
- The advanced cue start input currently shares `id="drive-number"` with the drive input.
- `alert()` is used for invalid drops; inline state would fit the UI better.
- `fileInput.files = files` in drag/drop may be browser-sensitive.
- Random input `name={Math.random().toString()}` is unusual in a prerendered Svelte app; avoid expanding that pattern.
- The settings card already includes syntax help; keep it current when conversion semantics change.

## Validation

Run:

```sh
pnpm check
pnpm build
```

For visible UI changes, also run `pnpm dev` and inspect desktop and mobile widths in the browser when feasible.
