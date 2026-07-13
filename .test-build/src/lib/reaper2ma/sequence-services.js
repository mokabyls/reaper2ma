import { createAppearanceNameFromReaperColor, createInheritedRegionBumpColor } from "./colors.js";
import { sanitizeMarkerName } from "./marker-parser.js";
const START_CUE_NAME = "Start";
const DEFAULT_BUMP_RELEASE_DURATION_SECONDS = "0.2";
const DEFAULT_BPM_RELEASE_DURATION_SECONDS = "0.5";
export function splitMarkerRows(markers) {
    const bumpMarkers = markers.filter((marker) => isBumpMarker(marker));
    const nonBumpMarkers = markers.filter((marker) => !isBumpMarker(marker));
    return {
        uniqueCues: nonBumpMarkers.filter((marker) => !marker.color),
        repeatedMarkers: nonBumpMarkers.filter((marker) => marker.color),
        bumpMarkers,
    };
}
export function groupRepeatedSequences(repeatedMarkers, prefix, sequenceNumber, appearanceStartNumber, resolveAppearance) {
    const repeatedSequences = [];
    const sequencesByColor = new Map();
    const usedSequenceNames = new Map();
    let nextAppearanceNumber = appearanceStartNumber;
    let nextSequenceNumber = sequenceNumber + 1;
    for (const marker of repeatedMarkers) {
        let existing = sequencesByColor.get(marker.color);
        if (existing) {
            const cueNumber = resolveSequenceCueNumber(existing, marker.displayName, marker.cueFade, marker.cueTiming);
            existing.sequence.events.push({
                timestamp: marker.start,
                execToken: marker.execToken,
                cueNumber,
                cueName: resolveCueName(existing.sequence.cues, cueNumber),
                ...(marker.regionActions?.length
                    ? {
                        regionActions: marker.regionActions,
                    }
                    : {}),
                ...(marker.regionLayerActions?.length
                    ? {
                        regionLayerActions: marker.regionLayerActions,
                    }
                    : {}),
                ...(marker.cueFade !== undefined
                    ? {
                        cueFade: marker.cueFade,
                    }
                    : {}),
                ...(marker.cueTiming !== undefined
                    ? {
                        cueTiming: marker.cueTiming,
                    }
                    : {}),
            });
            continue;
        }
        const appearanceReference = resolveAppearance?.(marker.color);
        const fallbackAppearanceReference = resolveAppearance === undefined
            ? {
                appearanceName: createAppearanceNameFromReaperColor(marker.color),
                appearanceNumber: nextAppearanceNumber++,
                appearanceColor: marker.color,
            }
            : undefined;
        const sequenceAppearanceReference = appearanceReference ?? fallbackAppearanceReference;
        const repeatedSequence = {
            color: marker.color,
            displayName: createUniqueSequenceName(`${prefix} - ${marker.displayName}`, usedSequenceNames),
            cues: [
                {
                    cueNumber: 1,
                    name: START_CUE_NAME,
                    ...(marker.cueFade !== undefined
                        ? {
                            cueFade: marker.cueFade,
                        }
                        : {}),
                    ...(marker.cueTiming !== undefined
                        ? {
                            cueTiming: marker.cueTiming,
                        }
                        : {}),
                },
            ],
            events: [
                {
                    timestamp: marker.start,
                    execToken: marker.execToken,
                    cueNumber: 1,
                    cueName: START_CUE_NAME,
                    ...(marker.regionActions?.length
                        ? {
                            regionActions: marker.regionActions,
                        }
                        : {}),
                    ...(marker.regionLayerActions?.length
                        ? {
                            regionLayerActions: marker.regionLayerActions,
                        }
                        : {}),
                    ...(marker.cueFade !== undefined
                        ? {
                            cueFade: marker.cueFade,
                        }
                        : {}),
                    ...(marker.cueTiming !== undefined
                        ? {
                            cueTiming: marker.cueTiming,
                        }
                        : {}),
                },
            ],
            ...(sequenceAppearanceReference
                ? {
                    appearanceName: sequenceAppearanceReference.appearanceName,
                    appearanceNumber: sequenceAppearanceReference.appearanceNumber,
                    appearanceColor: sequenceAppearanceReference.appearanceColor,
                }
                : {}),
            sequenceNumber: nextSequenceNumber++,
        };
        existing = {
            sequence: repeatedSequence,
            cueNumbersByName: new Map([
                [START_CUE_NAME, 1],
                [marker.displayName, 1],
            ]),
        };
        sequencesByColor.set(marker.color, existing);
        repeatedSequences.push(repeatedSequence);
    }
    return repeatedSequences;
}
export function groupBumpSequences(bumpMarkers, sequenceNumber, prefix, baseSequenceNamesByColor, resolveAppearance) {
    const bumpSequences = [];
    const sequencesByKey = new Map();
    const openStartsByColorAndKind = new Map();
    const explicitReleaseDurationsBySequence = new Map();
    const usedSequenceNames = new Map();
    let nextSequenceNumber = sequenceNumber + 1;
    for (const marker of bumpMarkers) {
        const bumpAction = marker.bumpAction ?? inferBumpActionFromExecToken(marker.execToken);
        const effectiveColor = resolveBumpMarkerColor(marker);
        const regionScope = resolveBumpRegionScope(marker);
        if (!bumpAction) {
            continue;
        }
        if (bumpAction.phase === "release") {
            const openStarts = openStartsByColorAndKind.get(createBumpStackKey(regionScope?.regionId, effectiveColor, bumpAction.kind));
            const openStart = openStarts?.pop();
            if (!openStart) {
                continue;
            }
            const releaseDurationSeconds = calculateReleaseDurationSeconds(openStart.timestamp, marker.start);
            if (releaseDurationSeconds !== undefined) {
                applyExplicitBumpReleaseDuration(openStart.sequence, releaseDurationSeconds, explicitReleaseDurationsBySequence);
            }
            continue;
        }
        const sequenceKey = `${regionScope?.regionId ?? ""}::${effectiveColor}::${marker.displayName}`;
        let existing = sequencesByKey.get(sequenceKey);
        if (!existing) {
            const baseSequenceName = regionScope ? createRegionBumpBaseSequenceName(regionScope) : (baseSequenceNamesByColor.get(effectiveColor) ?? prefix);
            const appearanceReference = effectiveColor ? resolveAppearance?.(effectiveColor) : undefined;
            const bumpSequence = {
                color: effectiveColor,
                displayName: createUniqueSequenceName(`${baseSequenceName} - BUMP - ${marker.displayName}`, usedSequenceNames),
                ...(regionScope
                    ? {
                        regionId: regionScope.regionId,
                        regionLabel: regionScope.regionLabel,
                    }
                    : {}),
                cues: [
                    {
                        cueNumber: 1,
                        name: START_CUE_NAME,
                        ...(appearanceReference
                            ? {
                                appearanceName: appearanceReference.appearanceName,
                                appearanceNumber: appearanceReference.appearanceNumber,
                                appearanceColor: appearanceReference.appearanceColor,
                            }
                            : {}),
                        ...(marker.cueFade !== undefined
                            ? {
                                cueFade: marker.cueFade,
                            }
                            : {}),
                        ...(marker.cueTiming !== undefined
                            ? {
                                cueTiming: marker.cueTiming,
                            }
                            : {}),
                    },
                ],
                events: [],
                releaseDurationSeconds: DEFAULT_BUMP_RELEASE_DURATION_SECONDS,
                ...(appearanceReference
                    ? {
                        appearanceName: appearanceReference.appearanceName,
                        appearanceNumber: appearanceReference.appearanceNumber,
                        appearanceColor: appearanceReference.appearanceColor,
                    }
                    : {}),
                sequenceNumber: nextSequenceNumber++,
            };
            existing = {
                sequence: bumpSequence,
                cueNumbersByName: new Map([[START_CUE_NAME, 1]]),
                kind: bumpAction.kind,
            };
            sequencesByKey.set(sequenceKey, existing);
            bumpSequences.push(bumpSequence);
        }
        pushBumpStartEvent(existing.sequence, marker, bumpAction.kind);
        if (bumpAction.releaseDelayMs !== undefined) {
            applyExplicitBumpReleaseDuration(existing.sequence, formatDurationSeconds(bumpAction.releaseDelayMs / 1000), explicitReleaseDurationsBySequence);
            continue;
        }
        const stackKey = createBumpStackKey(regionScope?.regionId, effectiveColor, bumpAction.kind);
        const openStarts = openStartsByColorAndKind.get(stackKey) ?? [];
        openStarts.push({
            sequence: existing.sequence,
            timestamp: marker.start,
            kind: bumpAction.kind,
        });
        openStartsByColorAndKind.set(stackKey, openStarts);
    }
    return bumpSequences;
}
export function createBpmSequence(bpmSources, sequenceNumber, repeatedSequenceCount) {
    if (bpmSources.length === 0) {
        return undefined;
    }
    return {
        displayName: "BPM",
        sequenceNumber: sequenceNumber + repeatedSequenceCount + 1,
        releaseDurationSeconds: DEFAULT_BPM_RELEASE_DURATION_SECONDS,
        events: bpmSources.map((source) => ({
            displayName: source.displayName,
            timestamp: source.start,
            bpm: source.bpm,
            bpmText: source.bpmText,
        })),
    };
}
export function applySequenceNamePrefix(name, prefix) {
    const trimmedPrefix = prefix.trim();
    if (!trimmedPrefix) {
        return name;
    }
    return `${trimmedPrefix} ${name}`;
}
function createUniqueSequenceName(name, usedSequenceNames) {
    const currentCount = usedSequenceNames.get(name) ?? 0;
    usedSequenceNames.set(name, currentCount + 1);
    if (currentCount === 0) {
        return name;
    }
    return `${name} ${currentCount + 1}`;
}
function resolveSequenceCueNumber(existing, cueName, cueFade, cueTiming) {
    const existingCueNumber = existing.cueNumbersByName.get(cueName);
    if (existingCueNumber) {
        return existingCueNumber;
    }
    const cueNumber = existing.sequence.cues.length + 1;
    existing.sequence.cues.push({
        cueNumber,
        name: cueName,
        ...(cueFade !== undefined
            ? {
                cueFade,
            }
            : {}),
        ...(cueTiming !== undefined
            ? {
                cueTiming,
            }
            : {}),
    });
    existing.cueNumbersByName.set(cueName, cueNumber);
    return cueNumber;
}
function resolveCueName(cues, cueNumber) {
    return cues.find((cue) => cue.cueNumber === cueNumber)?.name ?? START_CUE_NAME;
}
function isBumpMarker(marker) {
    return isBumpExecutionToken(marker.execToken) || isBumpReleaseExecutionToken(marker.execToken) || marker.bumpAction !== undefined;
}
function isBumpExecutionToken(execToken) {
    return execToken
        .split("|")
        .map((part) => part.trim().toLowerCase())
        .some((part) => part === "temp" || part === "flash");
}
function isBumpReleaseExecutionToken(execToken) {
    return execToken
        .split("|")
        .map((part) => part.trim().toLowerCase())
        .some((part) => part === "temprelease" || part === "flashrelease");
}
function resolveBumpMarkerColor(marker) {
    if (marker.color.trim()) {
        return marker.color;
    }
    return marker.regionContextColor ? (createInheritedRegionBumpColor(marker.regionContextColor) ?? "") : "";
}
function resolveBumpRegionScope(marker) {
    if (marker.isGlobal || !marker.regionContextId) {
        return undefined;
    }
    return {
        regionId: marker.regionContextId,
        regionLabel: marker.regionContextLabel ?? marker.regionContextId,
    };
}
function createRegionBumpBaseSequenceName(regionScope) {
    const regionLabel = sanitizeMarkerName(regionScope.regionLabel).trim();
    return regionLabel ? `${regionScope.regionId} - ${regionLabel}` : regionScope.regionId;
}
function createBumpStackKey(regionId, color, kind) {
    return `${regionId ?? ""}::${color}::${kind}`;
}
function pushBumpStartEvent(sequence, marker, kind) {
    sequence.events.push({
        timestamp: marker.start,
        execToken: kind,
        cueNumber: 1,
        cueName: START_CUE_NAME,
        ...(marker.regionActions?.length
            ? {
                regionActions: marker.regionActions,
            }
            : {}),
        ...(marker.regionLayerActions?.length
            ? {
                regionLayerActions: marker.regionLayerActions,
            }
            : {}),
        ...(marker.cueFade !== undefined
            ? {
                cueFade: marker.cueFade,
            }
            : {}),
        ...(marker.cueTiming !== undefined
            ? {
                cueTiming: marker.cueTiming,
            }
            : {}),
    });
}
function inferBumpActionFromExecToken(execToken) {
    const normalized = execToken.trim().toLowerCase();
    if (normalized === "temp" || normalized === "flash") {
        return {
            kind: normalized === "temp" ? "Temp" : "Flash",
            phase: "start",
        };
    }
    if (normalized === "temprelease" || normalized === "flashrelease") {
        return {
            kind: normalized === "temprelease" ? "Temp" : "Flash",
            phase: "release",
        };
    }
    return undefined;
}
function calculateReleaseDurationSeconds(startTimestamp, releaseTimestamp) {
    const start = Number.parseFloat(startTimestamp);
    const release = Number.parseFloat(releaseTimestamp);
    if (!Number.isFinite(start) || !Number.isFinite(release) || release < start) {
        return undefined;
    }
    return formatDurationSeconds(release - start);
}
function applyExplicitBumpReleaseDuration(sequence, releaseDurationSeconds, explicitReleaseDurationsBySequence) {
    const existingDuration = explicitReleaseDurationsBySequence.get(sequence);
    if (existingDuration === undefined) {
        explicitReleaseDurationsBySequence.set(sequence, releaseDurationSeconds);
        sequence.releaseDurationSeconds = releaseDurationSeconds;
        return;
    }
    if (existingDuration === releaseDurationSeconds) {
        return;
    }
    sequence.releaseWarnings = [
        ...(sequence.releaseWarnings ?? []),
        `Bump sequence "${sequence.displayName}" has multiple release durations (${existingDuration}s then ${releaseDurationSeconds}s). The first explicit duration (${existingDuration}s) is kept for the OffCue.`,
    ];
}
function formatDurationSeconds(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return DEFAULT_BUMP_RELEASE_DURATION_SECONDS;
    }
    return Number(seconds.toFixed(3)).toString();
}
//# sourceMappingURL=sequence-services.js.map