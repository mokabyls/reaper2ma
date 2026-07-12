import * as csv from "@vanillaes/csv";
import { createDefaultMarkerTagProviderRegistry } from "./providers/registry.js";
const SAFE_MARKER_NAME_PATTERN = /[^a-zA-Z0-9À-ÖØ-öø-ÿĀ-ſ \-_#%\/\(\)\[\]=+]/g;
const EXECUTION_SUFFIX_PATTERN = /^(.*)\s\[(.+)\]\s*$/;
const CANONICAL_EXECUTION_TOKENS = {
    "go+": "Go+",
    "go-": "Go-",
    goto: "Goto",
    load: "Load",
    on: "On",
    select: "Select",
    top: "Top",
    bump: "Temp",
    temp: "Temp",
    flash: "Flash",
    bumprelease: "TempRelease",
    temprelease: "TempRelease",
    flashrelease: "FlashRelease",
};
const GLOBAL_SCOPE_TAGS = new Set(["GLOBAL", "MAIN"]);
const markerTagProviderRegistry = createDefaultMarkerTagProviderRegistry();
export function sanitizeMarkerName(name) {
    return name.normalize("NFC").replace(SAFE_MARKER_NAME_PATTERN, "");
}
export function parseMarkerName(name) {
    const trimmedName = name.trim();
    const { remainder, tags, execParts: headExecParts } = parseLeadingTagBlocks(trimmedName);
    const { displayName: rawDisplayName, execToken: suffixExecToken } = parseExecutionSuffix(remainder);
    const displayName = sanitizeMarkerName(rawDisplayName.trim());
    const regionActions = extractRegionActions(tags);
    const regionLayerActions = extractRegionLayerActions(tags);
    const regionTargetId = extractRegionTargetId(tags);
    const regionLayerName = extractRegionLayerName(tags);
    const markerMetadata = markerTagProviderRegistry.enrich(tags.filter((tag) => !isRegionActionTag(tag) && !isRegionTargetTag(tag) && !isRegionLayerActionTag(tag)));
    const isGlobal = tags.some(isGlobalScopeTag);
    const execToken = suffixExecToken ?? normalizeExecutionToken(headExecParts.join("|")) ?? "Go+";
    const bumpAction = parseBumpAction(execToken, tags);
    return {
        displayName,
        execToken,
        tags,
        ...(isGlobal ? { isGlobal } : {}),
        ...(bumpAction ? { bumpAction } : {}),
        ...(regionTargetId ? { regionTargetId } : {}),
        ...(regionLayerName ? { regionLayerName } : {}),
        ...(regionActions.length > 0
            ? {
                regionActions,
            }
            : {}),
        ...(regionLayerActions.length > 0
            ? {
                regionLayerActions,
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
export function parseMarkerExecution(name) {
    const parsedMarker = parseMarkerName(name);
    return {
        displayName: parsedMarker.displayName,
        execToken: parsedMarker.execToken,
    };
}
export function parseReaperMarkerCsv(dataString) {
    const parsedLines = csv.parse(dataString);
    const header = parsedLines[0] ?? [];
    const rows = parsedLines.slice(1).map((row) => {
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
            End: obj.End ?? "",
            Length: obj.Length ?? "",
            Color: obj.Color ?? "",
        };
    });
    return {
        headers: header,
        rows,
    };
}
export function parseReaperMarkerRows(dataString) {
    return parseReaperMarkerCsv(dataString).rows;
}
export function normalizeMarkerRows(rows) {
    return rows.map((row) => {
        const marker = parseMarkerName(row.Name);
        const markerTags = marker.tags.filter((tag) => !isRegionActionTag(tag) && !isRegionTargetTag(tag) && !isRegionLayerActionTag(tag));
        return {
            displayName: marker.displayName,
            execToken: marker.execToken,
            tags: markerTags,
            ...(marker.isGlobal ? { isGlobal: marker.isGlobal } : {}),
            ...(marker.bumpAction ? { bumpAction: marker.bumpAction } : {}),
            ...(marker.regionTargetId ? { regionTargetId: marker.regionTargetId } : {}),
            ...(marker.regionLayerName ? { regionLayerName: marker.regionLayerName } : {}),
            ...(marker.regionActions && marker.regionActions.length > 0
                ? {
                    regionActions: marker.regionActions,
                }
                : {}),
            ...(marker.regionLayerActions && marker.regionLayerActions.length > 0
                ? {
                    regionLayerActions: marker.regionLayerActions,
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
export function isRegionRow(row) {
    return Boolean(row.End?.trim()) || Boolean(row.Length?.trim());
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
    const upperToken = trimmedToken.toUpperCase();
    if (upperToken === "OFF_LAYERS") {
        return {
            key: "OFF_LAYERS",
            value: null,
        };
    }
    if (upperToken.startsWith("OFF_LAYER=")) {
        const value = trimmedToken.slice(trimmedToken.indexOf("=") + 1).trim();
        return {
            key: "OFF_LAYER",
            value: value.length > 0 ? value : null,
        };
    }
    const equalsIndex = trimmedToken.indexOf("=");
    const underscoreIndex = trimmedToken.indexOf("_");
    const separatorIndex = equalsIndex >= 0 && (underscoreIndex < 0 || equalsIndex < underscoreIndex) ? equalsIndex : underscoreIndex;
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
function isRegionActionTag(tag) {
    const key = tag.key.trim().toUpperCase();
    return key === "ON" || key === "OFF";
}
function isRegionLayerActionTag(tag) {
    const key = tag.key.trim().toUpperCase();
    return key === "OFF_LAYER" || key === "OFF_LAYERS";
}
function isRegionTargetTag(tag) {
    if (tag.value !== null) {
        return false;
    }
    return /^R\d+$/.test(tag.key.trim().toUpperCase());
}
function isGlobalScopeTag(tag) {
    if (tag.value !== null) {
        return false;
    }
    return GLOBAL_SCOPE_TAGS.has(tag.key.trim().toUpperCase());
}
function parseBumpAction(execToken, tags) {
    const normalizedExecToken = execToken.trim().toLowerCase();
    if (normalizedExecToken !== "temp" && normalizedExecToken !== "flash" && normalizedExecToken !== "temprelease" && normalizedExecToken !== "flashrelease") {
        return undefined;
    }
    if (normalizedExecToken === "temprelease" || normalizedExecToken === "flashrelease") {
        return {
            kind: normalizedExecToken === "temprelease" ? "Temp" : "Flash",
            phase: "release",
        };
    }
    const releaseDelayMs = parseReleaseDelayMs(tags);
    return {
        kind: normalizedExecToken === "temp" ? "Temp" : "Flash",
        phase: "start",
        ...(releaseDelayMs !== undefined ? { releaseDelayMs } : {}),
    };
}
function parseReleaseDelayMs(tags) {
    const releaseTag = tags.find((tag) => tag.key.trim().toUpperCase() === "RELEASE" && tag.value !== null);
    if (!releaseTag?.value) {
        return undefined;
    }
    const value = Number.parseFloat(releaseTag.value);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
}
function extractRegionActions(tags) {
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
                kind: tag.key.trim().toUpperCase(),
                regionId,
            },
        ];
    });
}
function extractRegionLayerActions(tags) {
    return tags.flatMap((tag) => {
        const key = tag.key.trim().toUpperCase();
        if (key === "OFF_LAYERS") {
            return [
                {
                    kind: "OFF",
                    scope: "all",
                },
            ];
        }
        if (key !== "OFF_LAYER" || !tag.value) {
            return [];
        }
        const layerName = sanitizeMarkerName(tag.value).trim();
        if (!layerName) {
            return [];
        }
        return [
            {
                kind: "OFF",
                scope: "layer",
                layerName,
            },
        ];
    });
}
function extractRegionTargetId(tags) {
    return tags.find(isRegionTargetTag)?.key.trim().toUpperCase();
}
function extractRegionLayerName(tags) {
    const layerTag = tags.find((tag) => tag.key.trim().toUpperCase() === "LAYER" && tag.value !== null);
    const layerName = sanitizeMarkerName(layerTag?.value ?? "").trim();
    return layerName || undefined;
}
//# sourceMappingURL=marker-parser.js.map