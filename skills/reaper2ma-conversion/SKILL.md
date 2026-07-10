---
name: reaper2ma-conversion
description: Project-specific guidance for modifying, testing, or reviewing Reaper marker CSV parsing and grandMA3 macro/timecode XML generation in reaper2ma. Use when working on CSV headers, marker colors, unique versus repeated cues, sequence and cue numbering, generated XML, conversion bugs, or GrandMA import behavior.
---

# Reaper2MA Conversion

## Overview

Use this skill to preserve the domain rules behind the converter. The important distinction is that uncolored Reaper markers become cues in one master sequence, colored markers become color-grouped repeated/effect sequences, and `Temp` / `Flash` markers become bump overlays. Marker parsing and XML generation are now split into smaller services behind stable facades.

## First steps

1. Read `research.md`, especially the conversion, risks, and demo sections.
2. Inspect `src/lib/reaper2ma/*`; conversion logic now lives there, with the page component handling only UI.
3. Identify whether the change affects input parsing, grouping, macro XML, timecode XML, or UI settings.
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
- Route `Temp` and `Flash` execution tokens into bump overlay sequences, grouped by color and cue name.
- Parse leading or trailing `[]` blocks for `BPM`, `CueFade`, cue timing modifiers, and execution tokens. Cue timing families should stay isolated in their own providers.
- Validate cue timing modifiers and emit them as grandMA3 `Set Sequence ... Cue ... Part 0.1 ...` commands.
- Create one grandMA3 appearance per distinct Reaper color, starting at the configured appearance ID.
- Apply the configured `Speed Master` to every generated sequence.
- Always generate macro XML.
- Generate timecode XML only in `cues-and-timecode` export mode.

## XML constraints

- Keep the `GMA3` root and `DataVersion="1.4.0.2"` unless updating intentionally for grandMA3 compatibility.
- Macro lines use `@_Command` and `@_Wait: "0.10"`.
- Unique cue macro commands store a cue range in the base sequence, label each cue, and then apply optional cue fade/timing commands.
- Repeated sequence macro commands store a named sequence, store cue 1 with `/Merge`, assign an appearance, and set OffCue `TRIGTYPE` to `Follow`.
- Bump macro commands follow the same pattern as repeated sequences but use the bump naming convention.
- Timecode events use `ExecToken="Goto"` for main cues and the parsed execution token for repeated/bump overlays.
- The first event in each target sequence sets `@_Object`; later events omit it.
- Use `XMLBuilder` rather than manual string assembly unless there is a strong reason.

## Watchpoints

- Timecode duration currently uses the last unique cue only; repeated sequence timestamps can exceed it.
- Top-level macro and timecode GUIDs are hardcoded; changing this can affect import/update behavior.
- All-colored CSV input can produce a base cue range like `Cue 1 thru 0`.
- Filename normalization currently removes digits, spaces, uppercase extension artifacts, and non-ASCII characters.
- Repeated sequence object paths include sequence names directly. Test grandMA3 import behavior before changing name formatting.

## Validation

Run:

```sh
pnpm check
pnpm build
```

For non-trivial conversion changes, prefer extracting logic into `$lib/conversion.ts` and adding fixture tests before refactoring deeply.
