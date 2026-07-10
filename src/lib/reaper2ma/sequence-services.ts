import type {
    BumpSequence,
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
    const bumpMarkers = markers.filter((marker) => isBumpExecutionToken(marker.execToken));
    const nonBumpMarkers = markers.filter((marker) => !isBumpExecutionToken(marker.execToken));

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
        }
    >();
    const usedSequenceNames = new Map<string, number>();
    let nextSequenceNumber = sequenceNumber + 1;

    for (const marker of bumpMarkers) {
        const sequenceKey = `${marker.color}::${marker.displayName}`;
        const existing = sequencesByKey.get(sequenceKey);

        if (existing) {
            existing.sequence.events.push({
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
            });
            continue;
        }

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
            sequenceNumber: nextSequenceNumber++,
        };

        sequencesByKey.set(sequenceKey, {
            sequence: bumpSequence,
            cueNumbersByName: new Map<string, number>([[START_CUE_NAME, 1]]),
        });
        bumpSequences.push(bumpSequence);
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

function createUniqueSequenceName(name: string, usedSequenceNames: Map<string, number>): string {
    const currentCount = usedSequenceNames.get(name) ?? 0;
    usedSequenceNames.set(name, currentCount + 1);

    if (currentCount === 0) {
        return name;
    }

    return `${name} ${currentCount + 1}`;
}

function isBumpExecutionToken(execToken: string): boolean {
    return execToken
        .split("|")
        .map((part) => part.trim().toLowerCase())
        .some((part) => part === "temp" || part === "flash");
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
