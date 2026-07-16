# Reaper2MA Research Report

## Executive summary

This repository is a compact SvelteKit static web app that converts Reaper marker CSV exports into grandMA3 macro XML import files. The app runs entirely in the browser: a user uploads a CSV, the code parses marker rows, splits them into a master cue sequence, optional region-based sequences, repeated color-based effect sequences, bump overlays, and an optional BPM sequence, then builds one grandMA3 macro XML file with `fast-xml-parser`. In `cues-and-timecode` mode, that macro creates the timecode, tracks, events, and cue assignments by grandMA commands instead of exporting a separate `GMA3.Timecode` XML object. Downloads are delivered as one timestamped ZIP archive that contains the main macro XML plus selected extra macro XML files.

The core product logic now lives in `src/lib/reaper2ma/*` rather than the page component. There is a conversion library, XML generation helpers, and automated fixture tests. After installing locked dependencies with `pnpm install --frozen-lockfile`, both `pnpm check` and `pnpm build` pass.

The most important project-specific details for future agents are:

- Reaper CSV rows are expected to have `#`, `Name`, and `Start` headers. `Color` is optional because REAPER omits it when no markers are colored.
- Missing or empty `Color` means a normal cue in the main sequence.
- Non-empty `Color` means an effect/repeated sequence; all rows sharing the same color become one grandMA3 sequence with one cue triggered multiple times.
- In hybrid mode, rows with `End` or `Length` define regions; every region sequence receives automatic `Region Start` and `Region End` cues, and markers inside the innermost containing region become cues between those boundaries.
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
- `pnpm generate:demo` - Compile the converter to `.cli-build/`, generate the macro XML from the demo regions+markers CSV, and write ignored output files to `demo/generated/`.
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
6. In markers-only mode, rows with missing or empty color become `uniqueCues`.
7. In markers-only mode, rows with non-empty color are grouped by exact color into `repeatedSequences`.
8. In hybrid mode, rows with `End` or `Length` define regions. Markers are attached to the most nested containing region.
9. In hybrid mode, markers inside regions become cues in a region sequence named from the region ID and label, for example `R2 - Introduction - Sub Region`. Each region sequence receives automatic `Region Start` and `Region End` cues at the region boundaries. `Region End` uses the configurable region-end pre-roll, defaulting to 750 ms before the actual region end; if a marker already sits in that final window, `Region End` is merged into the latest marker name instead of creating another cue, but the merged cue still fires at the configured pre-roll timestamp. If a marker sits on the exact same timestamp as a boundary cue, the names are merged, for example `Region Start + Marker Name`. Region color creates the sequence appearance and marker color creates the cue appearance.
10. A marker with a leading region target tag like `[R2]` is assigned to that region sequence even when it sits before the region start.
11. A marker tagged `[LAYER=FX]` in hybrid mode is routed into a region-scoped layer sequence instead of the main region sequence. It uses the containing region or an explicit target like `[R2][LAYER=Voix]`, and a layer marker without any region target falls back to normal marker routing with a warning. If the layer marker has no color and its target region has a readable color, the layer sequence, layer cues, `Layer Pre-Roll` cue, timeline track, and grandMA3 appearance use the region color lightened by 24%. Explicit marker colors still win and are not lightened.
12. `[OFF_LAYER=FX]` and `[OFF_LAYERS]` create derived timecode `Off` events on region layer tracks. They use the containing region or an explicit target like `[R2][OFF_LAYER=Voix]`; missing regions or missing layer names produce warnings. A manual layer Off suppresses the generated auto-off fallback for the resolved target layer tracks.
13. The `Create layer pre-roll` setting is enabled by default and adds a `Layer Pre-Roll` cue/event at the beginning of each region layer sequence, before the first layer cue.
14. The `Auto Off region layers` setting is enabled by default and emits one derived fallback `Off` event on each layer track that has not already received a manual layer Off. When a following region exists, that Off is delayed to one second after the following region start so the next sequence can take control first; otherwise it stays at the parent region end.
15. Markers tagged `[GLOBAL]` or `[MAIN]` stay in the main sequence even when they fall inside a region.
16. Markers with `Temp` or `Flash` execution tokens become bump overlays.
17. Bump markers can carry release metadata through `Release_...`, `TempRelease`, or `FlashRelease`; the generator uses it to configure a timed `OffCue`, defaulting to 0.2 seconds when no release is found.
18. In hybrid mode, a non-global bump marker with a containing or explicitly targeted region becomes region-scoped. Its bump sequence is named from the region, belongs to that region's timecode track group, and is grouped separately from bumps in other regions even when the marker name and color match. A `[GLOBAL]` bump remains in the global timecode group.
19. In hybrid mode, an uncolored bump marker with a containing or explicitly targeted region inherits the readable region color lightened by 42%. That effective color is used for bump grouping, grandMA3 appearances, and timeline colors. Explicit bump marker colors still win and are not lightened.
20. Markers and region rows carrying `BPM_...` tags become events in a dedicated BPM sequence. A region BPM event is placed at the region `Start`, and the BPM tag is removed from the generated region label.
21. Macro XML is always generated and included in the final ZIP archive.
22. In `cues-and-timecode` mode, the macro also creates the grandMA timecode, track groups, tracks, events, and cue assignments by command lines.
23. The Summary step is review-only and sends the user to Extras before download.
24. Optional example macro presets are included in the same ZIP when their `Show time` or `Timecode control` groups are checked, with a `Timecode Name` fallback to the imported CSV basename.
25. Optional REAPER transport macros are included in the same ZIP only when `Include REAPER transport macros` is checked.
26. User settings are persisted in browser `localStorage` under `reaper2ma:settings:v1`; CSV contents, generated artifacts, timeline cursor state, and filters are not persisted.

The default settings are:

- `sequenceNumber = 9001`
- `appearanceStartNumber = 9001`
- `timecodeNumber = 1`
- `pageNumber = 1`
- `pageSlotStart = 201`
- `bumpPageSlotStart = 101`
- `assignExecutors = true`
- `cueStartNumber = 1`
- `regionEndPreRollMs = 750`
- `autoOffRegionLayers = true`
- `regionLayerPreRollEnabled = true`
- `regionLayerPreRollMs = 750`
- `speedMasterNumber = 4`, resolved in the UI to `speedMaster = "3.4"`
- `prefix = "1"`, editable in the UI and used for repeated and bump sequence labels.
- `importMode = "markers-only"`
- `exportMode = "cues-and-timecode"`

The two export modes affect the main macro XML inside the timestamped ZIP:

- `cues-and-timecode` - ZIP contains `<filename>_macro.xml`; macro creates sequences, cues, appearances, optional page assignments, the timecode object, tracks, command events, and cue-to-event assignments.
- `cues-only` - ZIP contains `<filename>_macro.xml`; macro creates sequences, cues, appearances, and optional page assignments but omits timecode commands.

The ZIP filename is `<filename>_<YYYYMMDD-HHmmss>.zip`, uses uncompressed ZIP entries, and stores all XML files at the archive root.

## CSV input expectations

The parser expects a Reaper marker CSV with these required headers:

- `#`
- `Name`
- `Start`

The `Color` header is optional because REAPER omits it when no markers are colored; missing color values are treated as empty colors. The code validates the required headers and warns with English messages when required columns or second-based timestamps look wrong. `Start` values are treated as already-compatible grandMA3 seconds strings. `End` and `Length` are only used in hybrid mode to describe regions. There is no beat/timecode/frame conversion. The in-app instructions tell users to set REAPER's time unit to seconds before exporting.

File naming is intentionally aggressive:

- `.replace(".csv", "")` removes only a lowercase `.csv` substring before lowercasing.
- The result is lowercased.
- Every non-lowercase ASCII letter is removed.

This means spaces, digits, underscores, hyphens, accents, and uppercase `.CSV` extension artifacts are removed from generated output file basenames. For example, `Song 01.CSV` would become `songcsv`, not `song`.

## Marker name handling

Marker names are sanitized by `safeName()`:

- Allowed: ASCII letters/digits, Latin accented letters, spaces, hyphen, underscore, `#`, `%`, `/`, parentheses, brackets, `=`, `+`.
- Removed: quotes, angle brackets, most punctuation, emoji, and other special characters.

Duplicate marker names are counted globally after sanitization:

- The first occurrence keeps the base name.
- Later occurrences receive numeric suffixes in chronological order, for example `SD`, `SD 2`, `SD 3`.
- This applies before splitting unique and repeated markers, so duplicate behavior is shared across both categories.

This naming matters because generated grandMA3 commands embed names in labels and quoted command strings.

Bracket tags are parsed from leading or trailing `[]` blocks:

- Leading blocks can carry metadata like `BPM_129.5`, `CueFade_6/12`, `FadeFromX_0.5`, or `Temp`.
- In hybrid mode, a leading region ID tag like `[R2]` explicitly routes the marker into that region sequence before falling back to position-based assignment.
- In hybrid mode, `[LAYER=Name]` creates or reuses a layer sequence attached to the containing or explicitly targeted region. Layer cues are distinct per marker; their marker colors become cue appearances. If a layer marker is uncolored and the target region has a readable color, the layer uses a 24% lightened version of the region color for the sequence appearance, uncolored layer cues, `Layer Pre-Roll`, and timeline track.
- In hybrid mode, `[OFF_LAYER=Name]` emits a derived timecode `Off` event on that region layer track, and `[OFF_LAYERS]` emits one on every layer track for the containing or explicitly targeted region.
- Trailing blocks can override the execution token, for example `Intro [Go+]`.
- Supported execution tokens are `Go+`, `Go-`, `Goto`, `Load`, `On`, `Select`, `Top`, `Temp`, `TempRelease`, `Flash`, and `FlashRelease`.
- `Temp|Release_250` and `Flash|Release_120` create bump starts and set the generated sequence `OffCue` timing in milliseconds.
- `TempRelease` and `FlashRelease` close the most recent unmatched bump start of the same kind to derive the generated sequence `OffCue` timing.
- In hybrid mode, non-global bump markers keep their region context even though they route to bump overlays. If the context region has a readable color, the bump uses a 42% lightened version of the region color for grouping, grandMA3 appearance, and timeline color. Region-scoped bump grouping includes the region ID, so matching bump names/colors in two regions become two bump sequences. `[GLOBAL]` bump markers stay in the global timecode group.
- Cue timing tags are emitted on the generated macro line as `Set DataPool "{temp}" Sequence ... Cue ... Part 0.1 ...`.
- Cue timing families are handled by dedicated providers in the registry, so `FadeFromX` can be changed in isolation.
- `[PART]` markers do not create cues or timecode events. They add sequential Cue Parts to the chronologically previous cue in the same generated sequence; the marker time minus the parent cue time becomes the part `CueDelay`, and optional `CueFade` metadata applies to the part.
- Cue Part routing supports the main sequence, regions, region layers, repeated color sequences, and `[Temp|PART]` / `[Flash|PART]` bump sequences. Repeated or bump Cue Parts apply every time their reused parent cue is triggered.
- Generated parent cues receive `AllowDuplicates=Yes` before additional parts are stored. `Part 1` addresses the Cue Part, while `Part 1.1` addresses its first empty recipe line; the existing main recipe line remains `Part 0.1`.
- Cue Part markers with BPM, bump release, or ON/OFF action metadata are ignored with a validation warning. Orphaned Cue Part markers are also ignored instead of becoming normal cues.
- Compact region action tags are parsed from marker names as `ON_R2` and `OFF_R1`. `ON` maps to a `Goto|Go+` event assigned to cue 1 on the target region track. `OFF` maps to an `Off` event on the target region track without cue assignment. Tags keep using compact region IDs, but the command generator resolves them to the generated local region sequence. If both are present, `OFF` is emitted before `ON` for the same timestamp.
- Compact region action tags are parsed from marker names as `ON_R2` and `OFF_R1`. `ON` maps to a `Goto|Go+` event assigned to the target region's actual `Region Start` cue. `OFF` maps to an `Off` event on the target region track without cue assignment and suppresses that region's generated auto-off fallback. Tags keep using compact region IDs, but the command generator resolves them to the generated local region sequence. If both are present, `OFF` is emitted before `ON` for the same timestamp.
- Region layer action tags are separate from compact region actions. `[OFF_LAYER=FX]` and `[OFF_LAYERS]` do not change `OFF_Rx`; they create `Off` events only on matching layer tracks and never assign those events to a cue.

## Unique cue behavior

Rows with missing or empty `Color` are considered normal cues in the master sequence.

Macro commands for unique cues:

- Creates the base sequence in a temporary DataPool as a local sequence, then moves it to `Sequence {sequenceNumber}` at the end.
- Stores the cue range in the local sequence: `Store DataPool "{temp}" Sequence {local} Cue {cueStartNumber} Thru {lastCueNumber} /Merge`.
- Labels each cue in order: `Label DataPool "{temp}" Sequence {local} Cue {cueNumber} "{name}"`.
- If present, `CueFade` and cue timing tags are applied after the cue is labeled.
- Cue numbers start at `cueStartNumber`.
- A marker without a label gets a fallback cue name like `Cue 1`.

Timecode commands for unique cues:

- Creates one timecode track for the local base sequence.
- Adds one command event per unique cue with `Set {event} "TIME" "{Start}"` and `Set {event} "TOKEN" "{execToken}"`.
- Assigns each cue to its event with `Assign DataPool "{temp}" Sequence {local} Cue {cueNumber} At Timecode 1.1.{track}.1.1.{event}`.

If there are zero unique cues, the macro omits base-sequence store, speed, label, fade, and timing commands instead of creating an invalid range like `Cue 1 thru 0`.

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

Macro commands for repeated sequences:

- Creates each repeated sequence in the temporary DataPool with a local sequence number.
- Stores cue ranges in that local sequence with `/Merge`.
- Sets the OffCue trigger type to `Follow`.
- Assigns a grandMA3 appearance per distinct readable Reaper color.
- Applies `CueFade` and cue timing tags to the created cues when present.
- Region sequences use the same appearance flow when the region row has a color, and region cues can get their own cue-level appearance when the marker color differs from the region color.
- Region layers and bumps can also create dedicated appearances from inherited region colors. These derived colors are real `#RRGGBB` colors, get their own appearance IDs, and are distinct from the parent region appearance.
- Appearance color conversion supports decimal Reaper color values, `0x...`, `#RRGGBB`, and six-digit hex values that contain A-F characters such as `F2FF00`.

Timecode commands for repeated sequences:

- Adds one track per generated sequence.
- Each timestamp becomes a command event on that sequence's track.
- Each cue-triggering event is connected with `Assign DataPool "{temp}" Sequence {local} Cue {cueNumber} At Timecode 1.1.{track}.1.1.{event}`.

Risk: sequence names are still embedded in labels and command strings. Any naming changes should be tested against grandMA3 import behavior.

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

The generated root is `GMA3`. CSV conversion output is now always a macro XML wrapper using `DataVersion="1.4.0.2"`. It no longer emits a separate `GMA3.Timecode` object XML file.

The repository also includes standalone macro-library examples in `example/macro/*.xml`. Those files use `DataVersion="2.4.2.2"` and a simpler single-macro structure. Any new standalone macro-library generator should follow that macro-library convention while leaving the CSV conversion XML unchanged.

Macro specifics:

- Root object is `GMA3.Macro`.
- Macro name is `Macro {filename}`.
- Macro GUID is currently hardcoded.
- Every macro line waits `0.10`.
- The macro starts with `cd root`, deletes any existing temporary DataPool named `R2MA {filename}`, then stores a fresh one.
- Generated sequences are created as local `Sequence 1..N` inside the temporary DataPool.
- Every created sequence gets the configured Speed Master assignment.
- If the base sequence has no unique cues, base-sequence macro lines are skipped to avoid `Cue 1 thru 0`.
- In hybrid mode, region sequences are stored like regular sequences. They receive `Region Start` and `Region End` cues at the Reaper region boundaries. Marker cues get labeled, timed, and optionally assigned appearances. `Region End` timecode events use the configured pre-roll, defaulting to 750 ms before the region end when there is no marker in that final window. Boundary cues merge into matching markers instead of creating duplicate cues, for example `Region End + Marker Name`; merged `Region End` cues keep the shifted event timestamp.
- Region layer sequences are stored immediately after their parent region sequence, named like `R2 - Chorus - FX`, optionally assigned to normal page executors, and receive one cue per layer marker with optional cue appearance, `CueFade`, and cue timing modifiers. When enabled, each layer sequence starts with a `Layer Pre-Roll` cue/event before the first layer cue. Uncolored layer markers in readable colored regions inherit the 24% lightened region appearance; explicit marker colors override it. Manual and automatic Off behavior is emitted as derived timecode events on the layer tracks, not as extra layer cues.
- Repeated sequences get appearances created with `Store Appearance {id}`, `Label Appearance {id} "{name}"`, `Set Appearance {id} COLOR="1,1,1,0" BackR={0..255} BackG={0..255} BackB={0..255} BackAlpha=221`, then `Set DataPool "{temp}" Sequence {local} APPEARANCE="{name}"`.
- Cue-level appearances use `Set DataPool "{temp}" Sequence {local} Cue {cueNumber} APPEARANCE="{name}"`.
- BPM tags on markers or region names create a dedicated helper sequence whose cue command uses `Master {speedMaster} At BPM {bpm}`. Region BPM events fire at the region `Start`. This BPM sequence is not assigned to a page executor. Its cues are named from the BPM value, for example `BPM 129.5`, and its timecode events use `Go+` so the cue command executes; a timed `OffCue` handles the 0.5 second release.
- Main, region, region layer, and repeated sequences are assigned to `Page {pageNumber}.{pageSlotStart + index}` when executor assignment is enabled.
- Bump overlay sequences are assigned separately to `Page {pageNumber}.{bumpPageSlotStart + index}` when executor assignment is enabled, defaulting to the 100 executor row for button-style Temp/Flash playbacks. Non-global bump markers in regions are region-scoped, named from their region, and placed in that region's timecode track group. Uncolored bump markers in readable colored regions inherit the 42% lightened region color for grouping, sequence/cue appearance, and timeline preview.
- grandMA3 executor rows are documented as 101-190 for button-only executors, 201-290 for button+fader executors, and 301-490 for button+knob executor rows. Hardware surfaces can expose fewer executor columns than the software range.
- The macro finalizes with `Move DataPool "{temp}" Sequence 1 Thru At Sequence {firstFinalSequenceNumber}`, optional timecode move, `Set Timecode {timecodeNumber} Property "PlaybackAndRecord" "Manual Events"` so command events execute from cues, and `Delete DataPool "{temp}" /NoConfirm`.

Command-driven timecode specifics:

- In `cues-and-timecode` mode, the macro stores `DataPool "{temp}" Timecode 1`, creates timecode track groups, creates a track per generated sequence inside those groups, then moves the timecode to `Timecode {timecodeNumber}`.
- After moving the generated timecode to the configured destination, the macro sets `PlaybackAndRecord` to `Manual Events`; without this grandMA3 can create the command events but not execute the commands embedded in the cues.
- In markers-only mode, all tracks stay in one group named from the filename.
- In hybrid mode, global material uses a `Global` track group when needed, and each region gets a group named from the generated region sequence. The region group contains the main region track, its layer tracks, and its non-global region-scoped bump tracks.
- Track groups are created with commands like `Store DataPool "{temp}" Timecode 1.1` and named with `Label DataPool "{temp}" Timecode 1.1 "{groupName}"`.
- It uses the CuePoints-style command pattern inside each group: `Assign DataPool "{temp}" Sequence {local} At {track}`, `Store Type "CmdSubTrack" 1`, `Store {event}`, `Set {event} "TIME" "{Start}"`, and `Set {event} "TOKEN" "{execToken}"`.
- Cue-to-event connections use `Assign DataPool "{temp}" Sequence {local} Cue {cueNumber} At Timecode 1.{group}.{track}.1.1.{event}`.
- `OFF_Rx` creates an `Off` event on the target region track without cue assignment and suppresses the generated auto-off fallback for that region.
- `ON_Rx` creates a `Goto|Go+` event on the target region track assigned to the target region's actual `Region Start` cue.
- `[OFF_LAYER=Name]` creates an `Off` event on the matching region layer track without cue assignment. `[OFF_LAYERS]` creates one `Off` event per layer track for that region. Manual layer Off events suppress generated auto-off fallbacks for their resolved layer tracks.
- Main region tracks receive a derived automatic `Off` at the next region start plus one second only when no manual `OFF_Rx` targets that region. This lets the incoming sequence take over before the previous one cuts while keeping manual Off commands authoritative.
- Automatic layer Off events are enabled by default. They use the same next-region-start-plus-one-second handoff timestamp when a following region exists, otherwise the parent region end, and are emitted only for layer tracks without a manual Off.
- Event timestamps stay in the CSV's seconds string format. Duration is still calculated from the latest generated timestamp plus one second.
- The generator does not emit an audio track, fader subtracks, `RealtimeCmd`, `CueDestination`, `ValCueDestination`, or grandMA internal object/cue numeric IDs.

Current behavior: timecode duration is calculated from the latest timestamp across unique cues, region cues, region layer cues, repeated sequence triggers, bump overlays, BPM events, and virtual release tails, plus one second. A unit test now covers a hybrid CSV where the latest event is not a main-sequence cue.

Potential issue: the macro GUID is static, which may affect import/update behavior when multiple generated files are imported into the same grandMA3 environment. The timecode object is created by command and does not use a generated XML GUID.

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
- Settings grid for sequence number, editable prefix, import/export mode selects, timecode number, executor assignment toggle, page number, page slot start, and numeric Speed Master suffix.
- Import mode helper comparing `Markers only` and `Regions + markers`, including examples of flat marker cues versus region rows becoming generated sequences.
- Separate live executor preview showing main, region, region layer, and repeated sequence assignments from `Page {pageNumber}.{pageSlotStart}` plus bump assignments from `Page {pageNumber}.{bumpPageSlotStart}` when executor assignment is enabled. BPM helper sequences are intentionally omitted from this executor preview.
- Collapsible advanced section for cue start number, region-end pre-roll, layer pre-roll, and automatic region layer Off.
- Radio group for import mode and export mode.
- Marker syntax help opened from the import step.
- Converter settings are restored from browser local storage on page load and automatically saved when changed.
- Advanced settings include persisted `Region End pre-roll`, `Create layer pre-roll`, `Layer pre-roll`, and `Auto Off region layers` controls. Both pre-rolls default to 750 ms, and automatic layer Off is enabled by default.
- Summary sheet with dense sequence, executor, cue, appearance, and timecode columns.
- Footer with upstream source link and copyright.

Styling is embedded in `+page.svelte` and now uses a dark grandMA3-inspired console palette: black/grey panels, compact sheets, yellow selected borders, green ready states, and orange/red warning states. The layout is centered with `max-width: 1280px`, uses dense responsive grids on desktop, and collapses to single-column controls on mobile.

Notable UI details:

- Upload state shows processing status and a spinner.
- Completed uploads show a clear-file button.
- Drag/drop validates file extension or MIME type.
- File input is visually hidden.
- The upload area uses `role="button"` and `tabindex="0"`, but there is no explicit keyboard handler on the upload area itself. The surrounding label makes click behavior work for the input.

Issues to watch:

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
2. Add fixtures for small Reaper CSV examples and snapshot or structural tests for generated macro XML commands.
3. Fix CI to use pnpm and the checked-in lockfile.
4. Add explicit CSV header validation and helpful user-facing parse errors.
5. Keep regression coverage for timecode duration across unique, region, repeated, bump, and BPM events.
6. Decide whether the top-level macro GUID should be generated rather than static.
7. Add grandMA import validation coverage for command-driven timecode creation.
8. Improve filename normalization for uppercase `.CSV`, digits, spaces, and non-ASCII names if user-friendly output names matter.
9. Handle the all-colored-marker case explicitly instead of generating a potentially invalid unique cue store range.
10. Consider replacing `alert()` with an inline error state.

Lower-priority cleanup:

- Remove or explain the `testcontent` entry in `.gitignore`.
- Add `packageManager` and possibly `engines` to `package.json`.
- Consider replacing hand-written SVG icons in the page with a shared icon approach if the UI grows.
- Keep README, footer source link, and deployment repository names aligned if this fork becomes the canonical project.

## Agent conclusions

Future agents should treat this as a specialized conversion utility, not a generic file converter. Most code changes should preserve the current distinction between uncolored markers as master cues and colored markers as repeated/effect sequences. Any change touching marker names, sequence numbering, command destinations, GUIDs, or timecode duration should be validated with realistic Reaper CSV fixtures and, ideally, imported into grandMA3 or checked against known-good macro command XML.

The app is small enough to work in directly, but the conversion logic has enough domain specificity that tests should be introduced before broad refactors. The safest next structural move is to move the conversion functions into `$lib/conversion.ts`, keep the UI behavior unchanged, and add fixture-based tests around that module.
