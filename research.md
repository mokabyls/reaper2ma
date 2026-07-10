# Reaper2MA Research Report

## Executive summary

This repository is a compact SvelteKit static web app that converts Reaper marker CSV exports into grandMA3 XML import files. The app runs entirely in the browser: a user uploads a CSV, the code parses marker rows, splits them into a master cue sequence, optional region-based sequences, repeated color-based effect sequences, bump overlays, and an optional BPM sequence, then builds grandMA3 macro/timecode XML with `fast-xml-parser` and immediately downloads one or two XML files.

The core product logic now lives in `src/lib/reaper2ma/*` rather than the page component. There is a conversion library, XML generation helpers, and automated fixture tests. After installing locked dependencies with `pnpm install --frozen-lockfile`, both `pnpm check` and `pnpm build` pass.

The most important project-specific details for future agents are:

- Reaper CSV rows are expected to have `#`, `Name`, `Start`, and `Color` headers.
- Empty `Color` means a normal cue in the main sequence.
- Non-empty `Color` means an effect/repeated sequence; all rows sharing the same color become one grandMA3 sequence with one cue triggered multiple times.
- In hybrid mode, rows with `End` or `Length` define regions; markers inside the innermost containing region become cues in the region sequence.
- The exported `Start` value is used directly as seconds; the UI tells users to set Reaper's ruler time unit to seconds.
- The app is statically deployed under `/reaper2ma` outside development.
- CI currently uses `yarn`, while the repo contains a `pnpm-lock.yaml` and README instructions use `pnpm`.

## Repository map

Tracked source and configuration:

- `src/routes/+page.svelte` - Main Svelte component for the converter UI, upload flow, and page styling.
- `src/lib/reaper2ma/` - Conversion library split into marker parsing, provider registry, sequence grouping, and XML emitters.
- `src/lib/reaper2ma/macro-presets.ts` - Example grandMA3 macro preset registry and renderer, separate from the CSV conversion flow.
- `src/routes/+layout.svelte` - Sets the favicon and renders children.
- `src/routes/+layout.server.ts` - Exports `prerender = true`.
- `src/app.html` - HTML shell, viewport, theme colors, base global body styles.
- `src/app.d.ts` and `src/lib/index.ts` - Default SvelteKit placeholders.
- `src/lib/assets/favicon.svg` - Favicon asset.
- `static/robots.txt` - Allows crawling.
- `svelte.config.js` - SvelteKit static adapter and production base path.
- `vite.config.ts` - SvelteKit Vite plugin.
- `tsconfig.json` - Strict TypeScript configuration extending SvelteKit generated config.
- `package.json` - Scripts and dev dependencies.
- `pnpm-lock.yaml` and `pnpm-workspace.yaml` - pnpm lockfile and workspace package build settings.
- `.github/workflows/deploy.yml` - GitHub Pages deployment workflow.
- `demo/demo.RPP`, `demo/reaper.png`, `demo/ma.png` - Example Reaper project and screenshots.

Agent-facing files:

- `AGENTS.md` - Operating instructions for agents working in this repo.
- `skills/reaper2ma-conversion/SKILL.md` - Project skill for conversion logic changes.
- `skills/reaper2ma-frontend/SKILL.md` - Project skill for SvelteKit/static frontend changes.

## Runtime and tooling

The app is built with:

- Svelte 5 and SvelteKit 2.
- Vite 7.
- TypeScript 5 with `strict: true`.
- `@sveltejs/adapter-static` for static output.
- `@vanillaes/csv` for CSV parsing.
- `fast-xml-parser`'s `XMLBuilder` for writing XML.

Package manager expectations are mixed:

- `README.md` says to use `pnpm install` and `pnpm dev`.
- `pnpm-lock.yaml` is present and current.
- `pnpm-workspace.yaml` only configures `onlyBuiltDependencies: [esbuild]`.
- `.npmrc` sets `engine-strict=true`, but `package.json` does not define an `engines` field.
- GitHub Actions uses `yarn install` and `yarn build`, with no `yarn.lock` checked in. That is a reproducibility gap and possibly a CI reliability issue.

Available scripts:

- `pnpm dev` - Run Vite dev server.
- `pnpm build` - Build static production output to `build/`.
- `pnpm preview` - Preview the production build locally.
- `pnpm check` - Run `svelte-kit sync` and `svelte-check`.
- `pnpm check:watch` - Watch-mode Svelte checking.

## Build and deployment

`svelte.config.js` uses the static adapter:

- Development base path is empty.
- Production base path is `/reaper2ma`.
- Static output is written to `build/`.

`src/routes/+layout.server.ts` exports `prerender = true`, aligning with the static adapter. There are no server routes or dynamic endpoints. All file handling and conversion happens in the browser.

The GitHub Pages workflow:

- Runs on every push.
- Uses Node.js 22.
- Installs with `yarn install`.
- Builds with `yarn build`.
- Uploads `build/` as a Pages artifact.
- Deploys with `actions/deploy-pages@v4`.

If the workflow is edited, prefer aligning it with the repo's pnpm lockfile, for example by enabling pnpm through Corepack and using `pnpm install --frozen-lockfile`.

## Main application flow

The page has one primary workflow:

1. User selects or drops a `.csv` file.
2. Browser `FileReader` reads the file as text.
3. The original file name is normalized for output names.
4. CSV rows are parsed into objects by header.
5. Marker names are sanitized, duplicate names are suffixed, and optional bracket tags are parsed.
6. In markers-only mode, rows with empty color become `uniqueCues`.
7. In markers-only mode, rows with non-empty color are grouped by exact color into `repeatedSequences`.
8. In hybrid mode, rows with `End` or `Length` define regions. Markers are attached to the most nested containing region.
9. In hybrid mode, markers inside regions become cues in the region sequence. Region color creates the sequence appearance and marker color creates the cue appearance.
10. Markers with `Temp` or `Flash` execution tokens become bump overlays only when they are outside regions.
11. Markers carrying `BPM_...` tags become a dedicated BPM sequence.
12. Macro XML is always generated and downloaded.
13. Timecode XML is generated and downloaded only in `cues-and-timecode` mode.
14. Optional example macro presets can be exported separately from the same page, grouped by `Show time` and `Timecode control`, with a `Timecode Name` fallback to the imported CSV basename.

The default settings are:

- `sequenceNumber = 101`
- `driveNumber = 2`
- `cueStartNumber = 1`
- `prefix = "1"`
- `importMode = "markers-only"`
- `exportMode = "cues-and-timecode"`

The two export modes are:

- `cues-and-timecode` - Downloads `<filename>_macro.xml` and `<filename>_timecode.xml`; macro includes drive selection and timecode import commands.
- `cues-only` - Downloads only `<filename>_macro.xml`; macro omits drive/timecode import commands and the drive input is disabled in the UI.

## CSV input expectations

The parser expects a Reaper marker CSV with these headers:

- `#`
- `Name`
- `Start`
- `Color`

The code does not explicitly validate the header row. Missing headers will usually fail during processing and show a generic error. `Start` values are treated as already-compatible grandMA3 seconds strings. `End` and `Length` are only used in hybrid mode to describe regions. There is no beat/timecode/frame conversion. The in-app instructions tell users to set Reaper's time unit to seconds before exporting.

File naming is intentionally aggressive:

- `.replace(".csv", "")` removes only a lowercase `.csv` substring before lowercasing.
- The result is lowercased.
- Every non-lowercase ASCII letter is removed.

This means spaces, digits, underscores, hyphens, accents, and uppercase `.CSV` extension artifacts are removed from generated output file basenames. For example, `Song 01.CSV` would become `songcsv`, not `song`.

## Marker name handling

Marker names are sanitized by `safeName()`:

- Allowed: ASCII letters/digits, German umlauts and sharp-s, spaces, hyphen, underscore, `#`, `%`, `/`, parentheses, brackets, `=`, `+`.
- Removed: quotes, angle brackets, most punctuation, emoji, and other special characters.

Duplicate marker names are counted globally after sanitization:

- The first occurrence keeps the base name.
- Later occurrences receive numeric suffixes in chronological order, for example `SD`, `SD 2`, `SD 3`.
- This applies before splitting unique and repeated markers, so duplicate behavior is shared across both categories.

This naming matters because generated grandMA3 commands embed names in quoted command strings and timecode object paths.

Bracket tags are parsed from leading or trailing `[]` blocks:

- Leading blocks can carry metadata like `BPM_129.5`, `CueFade_6/12`, `FadeFromX_0.5`, or `Temp`.
- Trailing blocks can override the execution token, for example `Intro [Go+]`.
- Supported execution tokens are `Go+`, `Go-`, `Goto`, `Load`, `On`, `Select`, `Top`, `Temp`, and `Flash`.
- Cue timing tags are emitted on the generated macro line as `Set Sequence ... Cue "..." Part 0.1 ...`.
- Cue timing families are handled by dedicated providers in the registry, so `FadeFromX` can be changed in isolation.
- Compact region action tags are parsed from marker names as `ON_R2` and `OFF_R1`. `ON` maps to `Goto|Go+` on the target region sequence cue 1. `OFF` maps to `Off Sequence` on the target region sequence. If both are present, `OFF` is emitted before `ON`.

## Unique cue behavior

Rows with empty `Color` are considered normal cues in the master sequence.

Macro XML for unique cues:

- Stores cue range in the base sequence: `Store Sequence {sequenceNumber} Cue {cueStartNumber} thru {lastCueNumber}`.
- Labels each cue in order: `Label Sequence {sequenceNumber} Cue {cueNumber} "{name}"`.
- If present, `CueFade` and cue timing tags are applied after the cue is labeled.
- Cue numbers start at `cueStartNumber`.
- A marker without a label gets a fallback cue name like `Cue 1`.

Timecode XML for unique cues:

- Creates one track targeting `ShowData.DataPools.Default.Sequences.Sequence {sequenceNumber}`.
- Adds one `CmdEvent` per unique cue.
- Each event has `ExecToken="Goto"`.
- The destination is `ShowData.DataPools.Default.Sequences.Sequence {sequenceNumber}.{cueName}`.
- The first event also sets the `Object` attribute to the target sequence.

Risk: if there are zero unique cues, the macro store command becomes a range like `Cue 1 thru 0`. If all markers are colored, this may create invalid grandMA3 behavior.

## Repeated sequence behavior

Rows with non-empty `Color` become repeated/effect sequence triggers.

Grouping rules:

- Rows are grouped by exact `Color` string.
- Group order is first-seen order in the CSV.
- The first marker name for a color becomes the sequence name.
- The sequence name is prefixed as `{prefix} - {firstMarkerName}`.
- Repeated sequence numbers start at `sequenceNumber + 1` and increment by first-seen color group.
- Each repeated sequence has a cue stack with `Start` as cue 1 and later cue names created on demand per color group.
- If a cue name already exists in that repeated sequence, the cue is reused instead of duplicated.
- In hybrid mode, region sequences consume the sequence numbers immediately after the main sequence, before repeated, bump, and BPM sequences.

Macro XML for repeated sequences:

- Stores a sequence with a name: `Store Sequence {repeatedSequenceNumber} "{prefix} - {name}"`.
- Stores cue 1 in that sequence with `/Merge`.
- Sets the OffCue trigger type to `Follow`.
- Assigns a grandMA3 appearance per distinct Reaper color.
- Applies `CueFade` and cue timing tags to the created cues when present.
- Region sequences use the same appearance flow when the region row has a color, and region cues can get their own cue-level appearance when the marker color differs from the region color.

Timecode XML for repeated sequences:

- Creates a second track group.
- Adds one track per repeated sequence.
- Each track targets `ShowData.DataPools.Default.Sequences.{sequenceName}`.
- Each timestamp becomes a `Goto` event to `{sequenceName}.Cue 1`.
- The first timestamp event for each repeated sequence sets the `Object` attribute.
- Random GUID-like byte strings are generated for repeated sequence tracks and time ranges.

Risk: sequence target paths for repeated sequences use raw sequence names in the object path, for example `ShowData.DataPools.Default.Sequences.1 - SD`. That appears intentional in current code, but any naming changes should be tested against grandMA3 import behavior.

## grandMA3 XML generation

The XML builder is configured with:

- `attributeNamePrefix: "@_"`
- `ignoreAttributes: false`
- `format: true`
- `suppressEmptyNode: true`
- `indentBy: "    "`

All generated files start with:

```xml
<?xml version="1.0" encoding="UTF-8"?>
```

The generated root is `GMA3` with `DataVersion="1.4.0.2"` for the CSV conversion flow.

The repository also includes standalone macro-library examples in `example/macro/*.xml`. Those files use `DataVersion="2.4.2.2"` and a simpler single-macro structure. Any new standalone macro-library generator should follow that macro-library convention while leaving the CSV conversion XML unchanged.

Macro specifics:

- Root object is `GMA3.Macro`.
- Macro name is `Macro {filename}`.
- Macro GUID is currently hardcoded.
- Every macro line waits `0.10`.
- Every created sequence gets the configured Speed Master assignment.
- In hybrid mode, region sequences are stored like regular sequences and their marker cues get labeled, timed, and optionally assigned appearances.
- In `cues-and-timecode` mode, the macro runs `Drive {driveNumber}` and `import Timecode "{filename}_timecode"`.
- Repeated sequences get appearances created with `Store Appearance {id}`, `Label Appearance {id} "{name}"`, `Set Appearance {id} "Color" "r,g,b,a"`, then `Assign Appearance "{name}" at Sequence {sequenceNumber}`.
- Cue-level appearances use `Assign Appearance "{name}" at Sequence {sequenceNumber} Cue {cueNumber}`.
- BPM markers create a dedicated sequence whose cue command uses `Master {speedMaster} At BPM {bpm}`.

Timecode specifics:

- Root object is `GMA3.Timecode`.
- Timecode name is `{filename}`.
- Main timecode GUID is currently hardcoded.
- Cursor is `00.00`.
- LoopCount is `0`.
- TCSlot is `-1`.
- SwitchOff is `Keep Playbacks`.
- Timedisplayformat is `<10d11h23m45>`.
- FrameReadout is `<Seconds>`.
- Hybrid exports create a dedicated region track group ahead of the repeated and bump groups.
- BPM markers create a dedicated BPM track in the timecode export.
- Bump overlays get their own track group separate from music sequences.

Potential issue: timecode duration is based only on the last unique cue start plus one second. Repeated sequence timestamps are ignored. If the last event is a colored/repeated marker after the last uncolored marker, the generated timecode duration can be too short.

Potential issue: static macro/timecode GUIDs may cause collisions or overwrite/update behavior when multiple generated files are imported into the same grandMA3 environment. Repeated tracks use random GUIDs, but the top-level macro and timecode objects do not.

## Demo project findings

`demo/demo.RPP` is a Reaper project, not a CSV. It contains 16 markers and demonstrates the intended color semantics:

- Uncolored/default markers: `Intro`, `VER`, `REF`, `VER 2`, `Outro`, `Ending`.
- Colored snare-like markers: `SD` at several timestamps with color `19005190`.
- Colored bass-drum-like markers: `BD` at timestamps with color `25165952`.
- Colored crash-like markers: `Crash` and `Crahs` with color `33554431`.

The demo also shows:

- Project tempo: 120 BPM.
- Marker starts are stored as seconds in the `.RPP`.
- Repeated sequence names are based on the first marker of each color group, so the crash group would use `Crash`, and the later misspelling `Crahs` would only contribute a timestamp.

## UI and styling

The UI is a single page with:

- Header/title and subtitle.
- Upload/drop zone.
- Settings grid for sequence number, prefix, import mode, and drive number.
- Collapsible advanced section for cue start number.
- Radio group for import mode and export mode.
- Static instructions.
- Footer with upstream source link and copyright.

Styling is embedded in `+page.svelte` and uses CSS variables for light/dark themes. The layout is centered with `max-width: 800px`, responsive down to a single-column settings grid under 640px. Dark mode is based on `prefers-color-scheme`.

Notable UI details:

- Upload state shows processing status and a spinner.
- Completed uploads show a clear-file button.
- Drag/drop validates file extension or MIME type.
- File input is visually hidden.
- The upload area uses `role="button"` and `tabindex="0"`, but there is no explicit keyboard handler on the upload area itself. The surrounding label makes click behavior work for the input.

Issues to watch:

- Both the drive number input and cue start input use `id="drive-number"`, which creates duplicate IDs and mislabels the advanced cue start field.
- Drag/drop assigns `fileInput.files = files`, which works in some browsers but can be fragile because `FileList` assignment support varies historically.
- Error display is generic. Actual parse errors are only logged to `console.error`.
- `alert("Please select a CSV file")` is used for non-CSV drops.

## Privacy and security posture

The app is privacy-friendly by design:

- It does not upload files to a server.
- It does not define server endpoints.
- CSV parsing and XML generation happen locally in the browser.
- Downloads are produced with `Blob` and object URLs.

Security considerations:

- Marker names are sanitized before insertion into command strings.
- XML generation goes through `XMLBuilder`, which should handle XML attribute escaping.
- Because output is command XML for grandMA3, marker names and object paths should be treated as command-sensitive. Any expansion of allowed characters should be tested carefully.

## Current validation

Commands run during this research:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

Results:

- Initial `pnpm check` and `pnpm build` failed because `node_modules` was missing.
- Initial dependency install failed inside the network-restricted sandbox with DNS errors.
- Re-running install with network approval succeeded from the lockfile.
- `pnpm check` passed with 0 errors and 0 warnings.
- `pnpm build` passed and wrote static output to `build/`.

Generated/installed artifacts are ignored by git:

- `node_modules`
- `.svelte-kit`
- `build`

## Important risks and improvement opportunities

High-value maintenance improvements:

1. Extract CSV parsing and XML generation from `src/routes/+page.svelte` into a typed `$lib` module. This would make the conversion logic testable without browser/file APIs.
2. Add fixtures for small Reaper CSV examples and snapshot or structural tests for generated macro/timecode XML.
3. Fix CI to use pnpm and the checked-in lockfile.
4. Add explicit CSV header validation and helpful user-facing parse errors.
5. Compute timecode duration from the maximum timestamp across both unique cues and repeated sequence timestamps.
6. Decide whether top-level macro/timecode GUIDs should be generated rather than static.
7. Fix duplicate input IDs in the settings UI.
8. Improve filename normalization for uppercase `.CSV`, digits, spaces, and non-ASCII names if user-friendly output names matter.
9. Handle the all-colored-marker case explicitly instead of generating a potentially invalid unique cue store range.
10. Consider replacing `alert()` with an inline error state.

Lower-priority cleanup:

- Remove or explain the `testcontent` entry in `.gitignore`.
- Add `packageManager` and possibly `engines` to `package.json`.
- Consider replacing hand-written SVG icons in the page with a shared icon approach if the UI grows.
- Keep README, footer source link, and deployment repository names aligned if this fork becomes the canonical project.

## Agent conclusions

Future agents should treat this as a specialized conversion utility, not a generic file converter. Most code changes should preserve the current distinction between uncolored markers as master cues and colored markers as repeated/effect sequences. Any change touching marker names, sequence paths, cue destinations, GUIDs, or timecode duration should be validated with realistic Reaper CSV fixtures and, ideally, imported into grandMA3 or checked against known-good XML.

The app is small enough to work in directly, but the conversion logic has enough domain specificity that tests should be introduced before broad refactors. The safest next structural move is to move the conversion functions into `$lib/conversion.ts`, keep the UI behavior unchanged, and add fixture-based tests around that module.
