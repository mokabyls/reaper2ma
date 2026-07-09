import * as csv from "@vanillaes/csv";
import { createAppearanceNameFromReaperColor } from "./colors.js";
const SAFE_MARKER_NAME_PATTERN = /[^a-zA-Z0-9äöüÄÖÜß \-_#%\/\(\)\[\]=+]/g;
const EXECUTION_SUFFIX_PATTERN = /^(.*)\s\[(.+)\]\s*$/;
const CANONICAL_EXECUTION_TOKENS = {
    "go+": "Go+",
    "go-": "Go-",
    goto: "Goto",
    load: "Load",
    on: "On",
    select: "Select",
    top: "Top",
    temp: "Temp",
    flash: "Flash",
};
const BPM_VALUE_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const START_CUE_NAME = "Start";
export function sanitizeMarkerName(name) {
    return name.replace(SAFE_MARKER_NAME_PATTERN, "");
}
export function parseMarkerName(name) {
    const trimmedName = name.trim();
    const { remainder, tags, execParts: headExecParts } = parseLeadingTagBlocks(trimmedName);
    const { displayName: rawDisplayName, execToken: suffixExecToken } = parseExecutionSuffix(remainder);
    const displayName = sanitizeMarkerName(rawDisplayName.trim());
    const bpmTag = tags.find((tag) => tag.key === "BPM" && tag.value !== null && isValidBpmValue(tag.value));
    const cueFadeTag = tags.find((tag) => tag.key === "CUEFADE" && tag.value !== null && isValidCueFadeValue(tag.value));
    const execToken = suffixExecToken ?? normalizeExecutionToken(headExecParts.join("|")) ?? "Goto";
    return {
        displayName,
        execToken,
        tags,
        ...(bpmTag
            ? {
                bpm: Number.parseFloat(bpmTag.value),
                bpmText: bpmTag.value,
            }
            : {}),
        ...(cueFadeTag
            ? {
                cueFade: cueFadeTag.value,
            }
            : {}),
    };
}
export function parseMarkerExecution(name) {
    const parsedMarker = parseMarkerName(name);
    return {
        displayName: parsedMarker.displayName,
        execToken: parsedMarker.execToken,
    };
}
function parseLeadingTagBlocks(name) {
    const tags = [];
    const execParts = [];
    let remainder = name;
    while (remainder.startsWith("[")) {
        const closingBracketIndex = remainder.indexOf("]");
        if (closingBracketIndex < 0) {
            break;
        }
        const rawBlock = remainder.slice(1, closingBracketIndex).trim();
        if (rawBlock.length > 0) {
            const parsedBlock = parseMarkerBlock(rawBlock);
            tags.push(...parsedBlock.tags);
            execParts.push(...parsedBlock.execParts);
        }
        remainder = remainder.slice(closingBracketIndex + 1).trimStart();
    }
    return {
        remainder,
        tags,
        execParts,
    };
}
function parseMarkerBlock(block) {
    const tags = [];
    const execParts = [];
    for (const token of block.split("|")) {
        const parsedToken = token.trim();
        if (!parsedToken) {
            continue;
        }
        const execToken = canonicalizeExecutionToken(parsedToken);
        if (execToken) {
            execParts.push(execToken);
            continue;
        }
        const tag = parseMarkerTagToken(parsedToken);
        if (tag) {
            tags.push(tag);
        }
    }
    return {
        tags,
        execParts,
    };
}
function parseMarkerTagToken(token) {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
        return null;
    }
    const separatorIndex = trimmedToken.indexOf("_");
    if (separatorIndex < 0) {
        return {
            key: trimmedToken.toUpperCase(),
            value: null,
        };
    }
    const key = trimmedToken.slice(0, separatorIndex).trim().toUpperCase();
    const value = trimmedToken.slice(separatorIndex + 1).trim();
    if (!key) {
        return null;
    }
    return {
        key,
        value: value.length > 0 ? value : null,
    };
}
function parseExecutionSuffix(name) {
    const suffixMatch = name.trim().match(EXECUTION_SUFFIX_PATTERN);
    if (!suffixMatch) {
        return {
            displayName: name.trim(),
        };
    }
    const displayName = suffixMatch[1].trim();
    const execToken = normalizeExecutionToken(suffixMatch[2]);
    if (!execToken) {
        return {
            displayName,
        };
    }
    return {
        displayName,
        execToken,
    };
}
function normalizeExecutionToken(token) {
    const parts = token.split("|").map((part) => canonicalizeExecutionToken(part));
    if (parts.length === 0) {
        return undefined;
    }
    if (parts.some((part) => !part)) {
        return undefined;
    }
    return parts.join("|");
}
function canonicalizeExecutionToken(token) {
    const normalizedToken = token.trim().toLowerCase();
    if (!normalizedToken) {
        return undefined;
    }
    return CANONICAL_EXECUTION_TOKENS[normalizedToken];
}
function isValidBpmValue(value) {
    return BPM_VALUE_PATTERN.test(value) && Number.parseFloat(value) > 0;
}
function isValidCueFadeValue(value) {
    return value.trim().length > 0;
}
export function parseReaperMarkerRows(dataString) {
    const parsedLines = csv.parse(dataString);
    const header = parsedLines[0] ?? [];
    return parsedLines.slice(1).map((row) => {
        const obj = {};
        row.forEach((value, index) => {
            const key = header[index];
            if (key) {
                obj[key] = value;
            }
        });
        return {
            "#": obj["#"] ?? "",
            Name: obj.Name ?? "",
            Start: obj.Start ?? "",
            Color: obj.Color ?? "",
        };
    });
}
export function normalizeMarkerRows(rows) {
    return rows.map((row) => {
        const marker = parseMarkerName(row.Name);
        return {
            displayName: marker.displayName,
            execToken: marker.execToken,
            tags: marker.tags,
            start: row.Start,
            color: row.Color,
            ...(marker.bpm !== undefined
                ? {
                    bpm: marker.bpm,
                    bpmText: marker.bpmText,
                }
                : {}),
            ...(marker.cueFade !== undefined
                ? {
                    cueFade: marker.cueFade,
                }
                : {}),
        };
    });
}
export function splitMarkerRows(markers) {
    const bumpMarkers = markers.filter((marker) => isBumpExecutionToken(marker.execToken));
    const nonBumpMarkers = markers.filter((marker) => !isBumpExecutionToken(marker.execToken));
    return {
        uniqueCues: nonBumpMarkers.filter((marker) => !marker.color),
        repeatedMarkers: nonBumpMarkers.filter((marker) => marker.color),
        bumpMarkers,
    };
}
export function groupRepeatedSequences(repeatedMarkers, prefix, sequenceNumber, appearanceStartNumber) {
    const repeatedSequences = [];
    const sequencesByColor = new Map();
    const usedSequenceNames = new Map();
    let nextAppearanceNumber = appearanceStartNumber;
    let nextSequenceNumber = sequenceNumber + 1;
    for (const marker of repeatedMarkers) {
        let existing = sequencesByColor.get(marker.color);
        if (existing) {
            const cueNumber = resolveSequenceCueNumber(existing, marker.displayName, marker.cueFade);
            existing.sequence.events.push({
                timestamp: marker.start,
                execToken: marker.execToken,
                cueNumber,
                cueName: resolveCueName(existing.sequence.cues, cueNumber),
                ...(marker.cueFade !== undefined
                    ? {
                        cueFade: marker.cueFade,
                    }
                    : {}),
            });
            continue;
        }
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
                },
            ],
            events: [
                {
                    timestamp: marker.start,
                    execToken: marker.execToken,
                    cueNumber: 1,
                    cueName: START_CUE_NAME,
                    ...(marker.cueFade !== undefined
                        ? {
                            cueFade: marker.cueFade,
                        }
                        : {}),
                },
            ],
            appearanceName: createAppearanceNameFromReaperColor(marker.color),
            appearanceNumber: nextAppearanceNumber++,
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
export function groupBumpSequences(bumpMarkers, sequenceNumber, prefix, baseSequenceNamesByColor) {
    const bumpSequences = [];
    const sequencesByKey = new Map();
    const usedSequenceNames = new Map();
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
                ...(marker.cueFade !== undefined
                    ? {
                        cueFade: marker.cueFade,
                    }
                    : {}),
            });
            continue;
        }
        const baseSequenceName = baseSequenceNamesByColor.get(marker.color) ?? prefix;
        const bumpSequence = {
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
                },
            ],
            events: [
                {
                    timestamp: marker.start,
                    execToken: marker.execToken,
                    cueNumber: 1,
                    cueName: START_CUE_NAME,
                    ...(marker.cueFade !== undefined
                        ? {
                            cueFade: marker.cueFade,
                        }
                        : {}),
                },
            ],
            sequenceNumber: nextSequenceNumber++,
        };
        sequencesByKey.set(sequenceKey, {
            sequence: bumpSequence,
            cueNumbersByName: new Map([[START_CUE_NAME, 1]]),
        });
        bumpSequences.push(bumpSequence);
    }
    return bumpSequences;
}
function createUniqueSequenceName(name, usedSequenceNames) {
    const currentCount = usedSequenceNames.get(name) ?? 0;
    usedSequenceNames.set(name, currentCount + 1);
    if (currentCount === 0) {
        return name;
    }
    return `${name} ${currentCount + 1}`;
}
function isBumpExecutionToken(execToken) {
    return execToken
        .split("|")
        .map((part) => part.trim().toLowerCase())
        .some((part) => part === "temp" || part === "flash");
}
function resolveSequenceCueNumber(existing, cueName, cueFade) {
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
    });
    existing.cueNumbersByName.set(cueName, cueNumber);
    return cueNumber;
}
function resolveCueName(cues, cueNumber) {
    return cues.find((cue) => cue.cueNumber === cueNumber)?.name ?? START_CUE_NAME;
}
//# sourceMappingURL=markers.js.map