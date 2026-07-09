# Agent Instructions

## Project purpose

Reaper2MA is a SvelteKit static web app that converts Reaper marker CSV exports into grandMA3 macro and timecode XML files. It is intended for lighting/audio workflows where uncolored Reaper markers become a main grandMA3 cue stack and colored markers become repeated effect sequences.

Read `research.md` before making non-trivial changes. It documents the current conversion semantics, build/deploy setup, risks, and validation results.

## Project skills

Use these repo-local skills when the task matches:

- `skills/reaper2ma-conversion` - Use for CSV parsing, marker naming, unique/repeated cue grouping, sequence/cue numbering, and grandMA3 XML generation.
- `skills/reaper2ma-frontend` - Use for SvelteKit UI, styling, static adapter behavior, assets, and deployment changes.

These skills live in `skills/` because this workspace does not allow writing to a project `.codex/` directory.

## Commands

Use pnpm for this repository:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm dev
```

Run `pnpm check` after TypeScript/Svelte edits. Run `pnpm build` after changes that affect routing, SvelteKit config, static deployment, assets, or dependencies.

Do not rely on the current GitHub Actions workflow as proof of package-manager intent: it uses `yarn`, while the repo has `pnpm-lock.yaml` and README instructions use pnpm.

## Architecture notes

- Main code is in `src/routes/+page.svelte`.
- There is no backend. File parsing and XML generation happen in the browser.
- `src/routes/+layout.server.ts` prerenders the app.
- `svelte.config.js` uses `@sveltejs/adapter-static`.
- Production base path is `/reaper2ma`; development base path is empty.
- Build output is `build/` and must not be committed.

## Conversion invariants

Preserve these unless the user explicitly asks to change conversion semantics:

- CSV headers are expected to include `#`, `Name`, `Start`, and `Color`.
- Empty `Color` means a normal cue in the main sequence.
- Non-empty `Color` means a repeated/effect sequence.
- Repeated sequences are grouped by exact color string.
- The first marker name in a color group names that repeated sequence.
- Repeated sequence numbers start at `sequenceNumber + 1`.
- Main cue numbers start at `cueStartNumber`.
- `Start` is treated as seconds and passed through without time conversion.
- Macro XML is always downloaded.
- Timecode XML is downloaded only in `cues-and-timecode` mode.

Be careful with marker-name changes. Names are command-sensitive because they are embedded in grandMA3 command strings and object paths.

## Coding guidance

- Keep privacy local: do not introduce uploads or server-side processing unless requested.
- Prefer extracting conversion logic to `$lib` before adding larger behavior changes or tests.
- Add fixture-based tests before broad conversion refactors.
- Keep generated XML structure stable unless there is a grandMA3-specific reason to change it.
- Validate user-facing input paths with helpful UI state rather than only `console.error` or `alert`.
- Keep styles responsive and test mobile layout when changing the single-page UI.

## Known watchpoints

- The advanced cue start input currently reuses `id="drive-number"`.
- Timecode duration currently ignores repeated sequence timestamps.
- Top-level macro and timecode GUIDs are hardcoded.
- An all-colored CSV can produce an invalid main cue range.
- CI package manager is inconsistent with the pnpm lockfile.

## Validation expectations

At minimum, report the result of:

```sh
pnpm check
pnpm build
```

If dependencies are missing, run `pnpm install --frozen-lockfile` first. If network access is blocked, say that validation could not proceed and include the exact failure.
