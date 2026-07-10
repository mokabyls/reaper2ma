import type {
    BumpSequence,
    BumpActionTag,
    AppearanceReference,
    ConvertedMarker,
    CueTimingTag,
    RepeatedSequence,
    SequenceCue,
    BpmSequence,
} from "./types.js";
import { createAppearanceNameFromReaperColor } from "./colors.js";

const START_CUE_NAME = "Start";

export function splitMarkerRows(markers: ConvertedMarker[]): {
    uniqueCues: ConvertedMarker[];
    repeatedMarkers: ConvertedMarker[];
    bumpMarkers: ConvertedMarker[];
} {
    const bumpMarkers = markers.filter((marker) => isBumpMarker(marker));
    const nonBumpMarkers = markers.filter((marker) => !isBumpMarker(marker));

    return {
        uniqueCues: nonBumpMarkers.filter((marker) => !marker.color),
        repeatedMarkers: nonBumpMarkers.filter((marker) => marker.color),
        bumpMarkers,
    };
}

export function groupRepeatedSequences(
    repeatedMarkers: ConvertedMarker[],
    prefix: string,
    sequenceNumber: number,
    appearanceStartNumber: number,
    resolveAppearance?: (color: string) => AppearanceReference | undefined,
): RepeatedSequence[] {
    const repeatedSequences: RepeatedSequence[] = [];
    const sequencesByColor = new Map<
        string,
        {
            sequence: RepeatedSequence;
            cueNumbersByName: Map<string, number>;
        }
    >();
    const usedSequenceNames = new Map<string, number>();
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

        const repeatedSequence: RepeatedSequence = {
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
            appearanceName: createAppearanceNameFromReaperColor(marker.color),
            appearanceNumber: nextAppearanceNumber++,
            appearanceColor: marker.color,
            sequenceNumber: nextSequenceNumber++,
        };

        const appearanceReference = resolveAppearance?.(marker.color);

        if (appearanceReference) {
            repeatedSequence.appearanceName = appearanceReference.appearanceName;
            repeatedSequence.appearanceNumber = appearanceReference.appearanceNumber;
            repeatedSequence.appearanceColor = appearanceReference.appearanceColor;
        }

        existing = {
            sequence: repeatedSequence,
            cueNumbersByName: new Map<string, number>([
                [START_CUE_NAME, 1],
                [marker.displayName, 1],
            ]),
        };

        sequencesByColor.set(marker.color, existing);
        repeatedSequences.push(repeatedSequence);
    }

    return repeatedSequences;
}

export function groupBumpSequences(
    bumpMarkers: ConvertedMarker[],
    sequenceNumber: number,
    prefix: string,
    baseSequenceNamesByColor: Map<string, string>,
): BumpSequence[] {
    const bumpSequences: BumpSequence[] = [];
    const sequencesByKey = new Map<
        string,
        {
            sequence: BumpSequence;
            cueNumbersByName: Map<string, number>;
            kind: "Temp" | "Flash";
        }
    >();
    const openStartsByColorAndKind = new Map<string, Array<{ sequence: BumpSequence; timestamp: string; kind: "Temp" | "Flash" }>>();
    const usedSequenceNames = new Map<string, number>();
    let nextSequenceNumber = sequenceNumber + 1;

    for (const marker of bumpMarkers) {
        const bumpAction = marker.bumpAction ?? inferBumpActionFromExecToken(marker.execToken);

        if (!bumpAction) {
            continue;
        }

        if (bumpAction.phase === "release") {
            const openStarts = openStartsByColorAndKind.get(createBumpStackKey(marker.color, bumpAction.kind));
            const openStart = openStarts?.pop();

            if (!openStart) {
                continue;
            }

            pushBumpReleaseEvent(openStart.sequence, marker.start);
            continue;
        }

        const sequenceKey = `${marker.color}::${marker.displayName}`;
        let existing = sequencesByKey.get(sequenceKey);

        if (!existing) {
            const baseSequenceName = baseSequenceNamesByColor.get(marker.color) ?? prefix;
            const bumpSequence: BumpSequence = {
                color: marker.color,
                displayName: createUniqueSequenceName(`${baseSequenceName} - BUMP - ${marker.displayName}`, usedSequenceNames),
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
                events: [],
                sequenceNumber: nextSequenceNumber++,
            };

            existing = {
                sequence: bumpSequence,
                cueNumbersByName: new Map<string, number>([[START_CUE_NAME, 1]]),
                kind: bumpAction.kind,
            };

            sequencesByKey.set(sequenceKey, existing);
            bumpSequences.push(bumpSequence);
        }

        pushBumpStartEvent(existing.sequence, marker, bumpAction.kind);

        if (bumpAction.releaseDelayMs !== undefined) {
            pushBumpReleaseEvent(existing.sequence, offsetTimestampByMilliseconds(marker.start, bumpAction.releaseDelayMs));
            continue;
        }

        const stackKey = createBumpStackKey(marker.color, bumpAction.kind);
        const openStarts = openStartsByColorAndKind.get(stackKey) ?? [];
        openStarts.push({
            sequence: existing.sequence,
            timestamp: marker.start,
            kind: bumpAction.kind,
        });
        openStartsByColorAndKind.set(stackKey, openStarts);
    }

    for (const openStarts of openStartsByColorAndKind.values()) {
        for (const openStart of openStarts) {
            pushBumpReleaseEvent(openStart.sequence, offsetTimestampByMilliseconds(openStart.timestamp, DEFAULT_BUMP_RELEASE_EPSILON_MS));
        }
    }

    return bumpSequences;
}

export function createBpmSequence(
    bpmMarkers: ConvertedMarker[],
    sequenceNumber: number,
    repeatedSequenceCount: number,
): BpmSequence | undefined {
    if (bpmMarkers.length === 0) {
        return undefined;
    }

    return {
        displayName: "BPM",
        sequenceNumber: sequenceNumber + repeatedSequenceCount + 1,
        events: bpmMarkers.map((marker) => ({
            displayName: marker.displayName,
            timestamp: marker.start,
            bpm: marker.bpm as number,
            bpmText: marker.bpmText as string,
        })),
    };
}

export function applySequenceNamePrefix(name: string, prefix: string): string {
    const trimmedPrefix = prefix.trim();

    if (!trimmedPrefix) {
        return name;
    }

    return `${trimmedPrefix} ${name}`;
}

function createUniqueSequenceName(name: string, usedSequenceNames: Map<string, number>): string {
    const currentCount = usedSequenceNames.get(name) ?? 0;
    usedSequenceNames.set(name, currentCount + 1);

    if (currentCount === 0) {
        return name;
    }

    return `${name} ${currentCount + 1}`;
}

function resolveSequenceCueNumber(
    existing: {
        sequence: RepeatedSequence;
        cueNumbersByName: Map<string, number>;
    },
    cueName: string,
    cueFade?: string,
    cueTiming?: CueTimingTag[],
): number {
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

function resolveCueName(cues: SequenceCue[], cueNumber: number): string {
    return cues.find((cue) => cue.cueNumber === cueNumber)?.name ?? START_CUE_NAME;
}

function isBumpMarker(marker: ConvertedMarker): boolean {
    return isBumpExecutionToken(marker.execToken) || isBumpReleaseExecutionToken(marker.execToken) || marker.bumpAction !== undefined;
}

function isBumpExecutionToken(execToken: string): boolean {
    return execToken
        .split("|")
        .map((part) => part.trim().toLowerCase())
        .some((part) => part === "temp" || part === "flash");
}

function isBumpReleaseExecutionToken(execToken: string): boolean {
    return execToken
        .split("|")
        .map((part) => part.trim().toLowerCase())
        .some((part) => part === "temprelease" || part === "flashrelease");
}

const DEFAULT_BUMP_RELEASE_EPSILON_MS = 1;

function createBumpStackKey(color: string, kind: "Temp" | "Flash"): string {
    return `${color}::${kind}`;
}

function pushBumpStartEvent(sequence: BumpSequence, marker: ConvertedMarker, kind: "Temp" | "Flash"): void {
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

function pushBumpReleaseEvent(sequence: BumpSequence, timestamp: string): void {
    sequence.events.push({
        timestamp,
        execToken: "Off",
        cueNumber: 1,
        cueName: START_CUE_NAME,
    });
}

function inferBumpActionFromExecToken(execToken: string): BumpActionTag | undefined {
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

function offsetTimestampByMilliseconds(timestamp: string, milliseconds: number): string {
    const parsedTimestamp = Number.parseFloat(timestamp);

    if (!Number.isFinite(parsedTimestamp)) {
        return timestamp;
    }

    return (parsedTimestamp + milliseconds / 1000).toFixed(3);
}
