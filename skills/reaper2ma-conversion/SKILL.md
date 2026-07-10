---
name: reaper2ma-conversion
description: Project-specific guidance for modifying, testing, or reviewing Reaper marker CSV parsing and grandMA3 macro command XML generation in reaper2ma. Use when working on CSV headers, marker colors, unique versus repeated cues, sequence and cue numbering, generated XML, command-driven timecode generation, conversion bugs, or GrandMA import behavior.
---

# Reaper2MA Conversion

## Overview

Use this skill to preserve the domain rules behind the converter. The important distinction is that uncolored Reaper markers become cues in one master sequence, colored markers become color-grouped repeated/effect sequences, and `Temp` / `Flash` markers become bump overlays. Marker parsing and macro command XML generation are now split into smaller services behind stable facades.

## First steps

1. Read `research.md`, especially the conversion, risks, and demo sections.
2. Inspect `src/lib/reaper2ma/*`; conversion logic now lives there, with the page component handling only UI.
3. Identify whether the change affects input parsing, grouping, macro command XML, command-driven timecode generation, or UI settings.
4. Preserve current behavior unless the user explicitly asks for a conversion semantics change.

## Current conversion rules

- Expect Reaper marker CSV headers: `#`, `Name`, `Start`, `Color`.
- Treat `Start` as seconds; do not convert beats, frames, or timecode formats unless adding explicit support.
- Sanitize marker names with the existing allowlist before using them in grandMA3 command strings.
- Suffix duplicate marker names after sanitization: first occurrence unsuffixed, later occurrences numbered.
- Treat empty `Color` as a normal cue in the base sequence.
- Treat non-empty `Color` as a repeated/effect marker.
- Group repeated/effect markers by exact color string in first-seen order.
- Name each repeated sequence from the first marker in that color group, prefixed as `{prefix} - {name}`.
- Allocate repeated sequence numbers from `sequenceNumber + 1`.
- In regions-and-markers mode, name generated region sequences from region ID plus sanitized region label, for example `R2 - Introduction - Sub Region`.
- Allow `[GLOBAL]` or `[MAIN]` markers to stay in the main sequence even when they fall inside a region.
- Route `Temp` and `Flash` execution tokens into bump overlay sequences, grouped by color and cue name.
- Parse leading or trailing `[]` blocks for `BPM`, `CueFade`, cue timing modifiers, and execution tokens. Cue timing families should stay isolated in their own providers.
- Parse bump release tags as `Release_...`, `TempRelease`, and `FlashRelease`, with a fallback release inserted just after the start when no release tag is present.
- Validate cue timing modifiers and emit them as grandMA3 `Set DataPool "{temp}" Sequence ... Cue ... Part 0.1 ...` commands.
- Create one grandMA3 appearance per distinct Reaper color, starting at the configured appearance ID.
- Convert appearance colors from decimal Reaper values, `0x...`, `#RRGGBB`, and six-digit hex values with A-F characters. Macro output uses grandMA background channels: `COLOR="1,1,1,0" BackR={0..255} BackG={0..255} BackB={0..255} BackAlpha=221`.
- Apply the configured `Speed Master` to every generated sequence.
- Always generate macro XML.
- In `cues-and-timecode` mode, generate timecode creation commands inside the macro XML. Do not emit a separate `GMA3.Timecode` XML file.

## XML constraints

- Keep the `GMA3` root. CSV conversion output is always macro XML using `DataVersion="1.4.0.2"`.
- Macro lines use `@_Command` and `@_Wait: "0.10"`.
- Build generated sequences in a deterministic temporary DataPool named `R2MA {filename}`.
- Use local temporary sequence numbers `1..N`, assign them to the configured page slots, then move them to the final sequence number range.
- Unique cue macro commands store a cue range in the local base sequence, label each cue, and then apply optional cue fade/timing commands.
- If the base sequence has no unique cues, skip base-sequence macro commands rather than emitting `Cue 1 thru 0`.
- Repeated sequence macro commands store a named local sequence, store cue ranges with `/Merge`, assign an appearance, and set OffCue `TRIGTYPE` to `Follow`.
- Bump macro commands follow the same pattern as repeated sequences but use the bump naming convention.
- Timecode commands use the CuePoints-style pattern: `Store DataPool "{temp}" Timecode 1`, `Assign DataPool "{temp}" Sequence {local} At {track}`, `Store Type "CmdSubTrack" 1`, `Set {event} "TIME" "{Start}"`, `Set {event} "TOKEN" "{execToken}"`, and `Assign DataPool "{temp}" Sequence {local} Cue {cueNumber} At Timecode 1.1.{track}.1.1.{event}`.
- `OFF_Rx` creates an `Off` event on the target region track without cue assignment. `ON_Rx` creates a `Goto|Go+` event assigned to cue 1 on the target region track.
- Do not generate a separate `GMA3.Timecode`, `RealtimeCmd`, `CueDestination`, `ValCueDestination`, grandMA internal numeric object/cue references, audio tracks, or fader subtracks from CSV-only input.
- Use `XMLBuilder` rather than manual string assembly unless there is a strong reason.

## Watchpoints

- Timecode duration is calculated from unique, region, repeated, bump, and BPM timestamps.
- Top-level macro GUID is hardcoded; changing this can affect import/update behavior.
- Filename normalization currently removes digits, spaces, uppercase extension artifacts, and non-ASCII characters.
- Sequence names are embedded in labels and command strings. Test grandMA3 import behavior before changing name formatting.

## Validation

Run:

```sh
pnpm check
pnpm build
```

For non-trivial conversion changes, prefer extracting logic into `$lib/conversion.ts` and adding fixture tests before refactoring deeply.
