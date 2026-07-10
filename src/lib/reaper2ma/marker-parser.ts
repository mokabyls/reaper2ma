import * as csv from "@vanillaes/csv";

import type { ConvertedMarker, MarkerTag, ReaperMarkerRow, RegionActionTag } from "./types.js";
import { createDefaultMarkerTagProviderRegistry } from "./providers/registry.js";

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

const markerTagProviderRegistry = createDefaultMarkerTagProviderRegistry();

type ParsedMarkerName = {
    displayName: string;
    execToken: string;
    tags: MarkerTag[];
    regionActions?: RegionActionTag[];
    cueTiming?: NonNullable<ConvertedMarker["cueTiming"]>;
    bpm?: number;
    bpmText?: string;
    cueFade?: string;
};

export function sanitizeMarkerName(name: string): string {
    return name.replace(SAFE_MARKER_NAME_PATTERN, "");
}

export function parseMarkerName(name: string): ParsedMarkerName {
    const trimmedName = name.trim();
    const { remainder, tags, execParts: headExecParts } = parseLeadingTagBlocks(trimmedName);
    const { displayName: rawDisplayName, execToken: suffixExecToken } = parseExecutionSuffix(remainder);
    const displayName = sanitizeMarkerName(rawDisplayName.trim());
    const regionActions = extractRegionActions(tags);
    const markerMetadata = markerTagProviderRegistry.enrich(tags.filter((tag) => !isRegionActionTag(tag)));
    const execToken = suffixExecToken ?? normalizeExecutionToken(headExecParts.join("|")) ?? "Goto";

    return {
        displayName,
        execToken,
        tags,
        ...(regionActions.length > 0
            ? {
                  regionActions,
              }
            : {}),
        ...(markerMetadata.cueTiming.length > 0
            ? {
                  cueTiming: markerMetadata.cueTiming,
              }
            : {}),
        ...(markerMetadata.bpm !== undefined
            ? {
                  bpm: markerMetadata.bpm,
                  bpmText: markerMetadata.bpmText,
              }
            : {}),
        ...(markerMetadata.cueFade !== undefined
            ? {
                  cueFade: markerMetadata.cueFade,
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
            End: obj.End ?? "",
            Length: obj.Length ?? "",
            Color: obj.Color ?? "",
        };
    });
}

export function normalizeMarkerRows(rows: ReaperMarkerRow[]): ConvertedMarker[] {
    return rows.map((row) => {
        const marker = parseMarkerName(row.Name);
        const markerTags = marker.tags.filter((tag) => !isRegionActionTag(tag));

        return {
            displayName: marker.displayName,
            execToken: marker.execToken,
            tags: markerTags,
            ...(marker.regionActions && marker.regionActions.length > 0
                ? {
                      regionActions: marker.regionActions,
                  }
                : {}),
            start: row.Start,
            color: row.Color,
            ...(marker.cueTiming !== undefined
                ? {
                      cueTiming: marker.cueTiming,
                  }
                : {}),
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

export function isRegionRow(row: ReaperMarkerRow): row is ReaperMarkerRow & { End: string; Length: string } {
    return Boolean(row.End?.trim()) || Boolean(row.Length?.trim());
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

function isRegionActionTag(tag: MarkerTag): boolean {
    const key = tag.key.trim().toUpperCase();

    return key === "ON" || key === "OFF";
}

function extractRegionActions(tags: MarkerTag[]): RegionActionTag[] {
    return tags.flatMap((tag) => {
        if (!isRegionActionTag(tag) || !tag.value) {
            return [];
        }

        const regionId = tag.value.trim().toUpperCase();

        if (!/^R\d+$/.test(regionId)) {
            return [];
        }

        return [
            {
                kind: tag.key.trim().toUpperCase() as "ON" | "OFF",
                regionId,
            },
        ];
    });
}
