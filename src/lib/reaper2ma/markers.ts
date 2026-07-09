import * as csv from "@vanillaes/csv";

import type { ConvertedMarker, MarkerTag, ReaperMarkerRow, RepeatedSequence } from "./types.js";
import { createAppearanceNameFromReaperColor } from "./colors.js";

const SAFE_MARKER_NAME_PATTERN = /[^a-zA-Z0-9äöüÄÖÜß \-_#%\/\(\)\[\]=+]/g;
const EXECUTION_SUFFIX_PATTERN = /^(.*)\s\[(.+)\]\s*$/;
const CANONICAL_EXECUTION_TOKENS: Record<string, string> = {
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

export function sanitizeMarkerName(name: string): string {
    return name.replace(SAFE_MARKER_NAME_PATTERN, "");
}

type ParsedMarkerName = {
    displayName: string;
    execToken: string;
    tags: MarkerTag[];
    bpm?: number;
    bpmText?: string;
};

export function parseMarkerName(name: string): ParsedMarkerName {
    const trimmedName = name.trim();
    const { remainder, tags, execParts: headExecParts } = parseLeadingTagBlocks(trimmedName);
    const { displayName: rawDisplayName, execToken: suffixExecToken } = parseExecutionSuffix(remainder);
    const displayName = sanitizeMarkerName(rawDisplayName.trim());
    const bpmTag = tags.find((tag) => tag.key === "BPM" && tag.value !== null && isValidBpmValue(tag.value));
    const execToken = suffixExecToken ?? normalizeExecutionToken(headExecParts.join("|")) ?? "Goto";

    return {
        displayName,
        execToken,
        tags,
        ...(bpmTag
            ? {
                  bpm: Number.parseFloat(bpmTag.value as string),
                  bpmText: bpmTag.value as string,
              }
            : {}),
    };
}

export function parseMarkerExecution(name: string): {
    displayName: string;
    execToken: string;
} {
    const parsedMarker = parseMarkerName(name);

    return {
        displayName: parsedMarker.displayName,
        execToken: parsedMarker.execToken,
    };
}

function parseLeadingTagBlocks(name: string): {
    remainder: string;
    tags: MarkerTag[];
    execParts: string[];
} {
    const tags: MarkerTag[] = [];
    const execParts: string[] = [];
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

function parseMarkerBlock(block: string): {
    tags: MarkerTag[];
    execParts: string[];
} {
    const tags: MarkerTag[] = [];
    const execParts: string[] = [];

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

function parseMarkerTagToken(token: string): MarkerTag | null {
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

function parseExecutionSuffix(name: string): {
    displayName: string;
    execToken?: string;
} {
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

function normalizeExecutionToken(token: string): string | undefined {
    const parts = token.split("|").map((part) => canonicalizeExecutionToken(part));

    if (parts.length === 0) {
        return undefined;
    }

    if (parts.some((part) => !part)) {
        return undefined;
    }

    return parts.join("|");
}

function canonicalizeExecutionToken(token: string): string | undefined {
    const normalizedToken = token.trim().toLowerCase();

    if (!normalizedToken) {
        return undefined;
    }

    return CANONICAL_EXECUTION_TOKENS[normalizedToken];
}

function isValidBpmValue(value: string): boolean {
    return BPM_VALUE_PATTERN.test(value) && Number.parseFloat(value) > 0;
}

export function parseReaperMarkerRows(dataString: string): ReaperMarkerRow[] {
    const parsedLines = csv.parse(dataString) as string[][];
    const header = parsedLines[0] ?? [];

    return parsedLines.slice(1).map((row) => {
        const obj: Record<string, string> = {};

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

export function normalizeMarkerRows(rows: ReaperMarkerRow[]): ConvertedMarker[] {
    const seenNameCount: Record<string, number> = {};

    const sanitizedRows = rows.map((row) => {
        const marker = parseMarkerName(row.Name);
        seenNameCount[marker.displayName] = (seenNameCount[marker.displayName] || 0) + 1;

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
        };
    });

    const remainingNames = { ...seenNameCount };

    return sanitizedRows
        .slice()
        .reverse()
        .map((row) => {
            const remaining = remainingNames[row.displayName] ?? 0;

            if (remaining > 1) {
                remainingNames[row.displayName] = remaining - 1;
                return {
                    ...row,
                    displayName: `${row.displayName} ${remaining}`,
                };
            }

            return row;
        })
        .reverse();
}

export function splitMarkerRows(markers: ConvertedMarker[]): {
    uniqueCues: ConvertedMarker[];
    repeatedMarkers: ConvertedMarker[];
} {
    return {
        uniqueCues: markers.filter((marker) => !marker.color),
        repeatedMarkers: markers.filter((marker) => marker.color),
    };
}

export function groupRepeatedSequences(
    repeatedMarkers: ConvertedMarker[],
    prefix: string,
    sequenceNumber: number,
    appearanceStartNumber: number,
): RepeatedSequence[] {
    const repeatedSequences: RepeatedSequence[] = [];
    const sequencesByColor = new Map<string, RepeatedSequence>();
    let nextAppearanceNumber = appearanceStartNumber;
    let nextSequenceNumber = sequenceNumber + 1;

    for (const marker of repeatedMarkers) {
        const existing = sequencesByColor.get(marker.color);

        if (existing) {
            existing.events.push({
                timestamp: marker.start,
                execToken: marker.execToken,
            });
            continue;
        }

        const repeatedSequence: RepeatedSequence = {
            color: marker.color,
            displayName: `${prefix} - ${marker.displayName}`,
            events: [
                {
                    timestamp: marker.start,
                    execToken: marker.execToken,
                },
            ],
            appearanceName: createAppearanceNameFromReaperColor(marker.color),
            appearanceNumber: nextAppearanceNumber++,
            sequenceNumber: nextSequenceNumber++,
        };

        sequencesByColor.set(marker.color, repeatedSequence);
        repeatedSequences.push(repeatedSequence);
    }

    return repeatedSequences;
}
