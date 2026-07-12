import { sanitizeMarkerName } from "./marker-parser.js";
const REGION_START_CUE_NAME = "Region Start";
const REGION_END_CUE_NAME = "Region End";
const REGION_END_CUE_LEAD_MS = 100;
const REGION_END_CUE_MIN_GAP_MS = 1;
const NUMERIC_TIMESTAMP_PATTERN = /^-?\d+(?:\.\d+)?$/;
export function parseRegions(rows) {
    return rows
        .map((row, index) => {
        const startValue = Number.parseFloat(row.Start);
        const endValueFromEnd = Number.parseFloat(row.End);
        const endValueFromLength = Number.parseFloat(row.Start) + Number.parseFloat(row.Length);
        const endValue = Number.isFinite(endValueFromEnd) ? endValueFromEnd : endValueFromLength;
        if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) {
            return undefined;
        }
        return {
            regionId: `R${index + 1}`,
            regionLabel: row.Name.trim(),
            start: row.Start,
            end: Number.isFinite(endValueFromEnd) ? row.End : String(endValue),
            color: row.Color,
            order: index,
            startValue,
            endValue,
            lengthValue: endValue - startValue,
        };
    })
        .filter((region) => region !== undefined);
}
export function assignMarkersToRegions(markers, regions) {
    return markers.map((marker) => {
        if (marker.isGlobal || marker.bumpAction !== undefined) {
            return marker;
        }
        const region = resolveTargetRegion(marker.regionTargetId, regions) ?? resolveContainingRegion(marker.start, regions);
        if (!region) {
            return marker;
        }
        return {
            ...marker,
            regionId: region.regionId,
            regionLabel: region.regionLabel,
        };
    });
}
function resolveTargetRegion(regionTargetId, regions) {
    if (!regionTargetId) {
        return undefined;
    }
    return regions.find((region) => region.regionId === regionTargetId);
}
export function buildRegionSequences(markers, regions, sequenceNumber, resolveAppearance) {
    const regionSequences = [];
    regions.forEach((region, index) => {
        const regionMarkers = markers
            .map((marker, index) => ({ marker, index }))
            .filter(({ marker }) => marker.regionId === region.regionId)
            .sort((left, right) => compareMarkerStart(left.marker.start, right.marker.start, left.index, right.index))
            .map(({ marker }) => marker);
        const sequenceAppearance = region.color ? resolveAppearance(region.color) : undefined;
        const cuePlan = createRegionCuePlan(region, regionMarkers, resolveAppearance);
        const cues = cuePlan.map((cue) => ({
            cueNumber: cue.cueNumber,
            name: cue.name,
            ...(cue.appearanceReference
                ? {
                    appearanceName: cue.appearanceReference.appearanceName,
                    appearanceNumber: cue.appearanceReference.appearanceNumber,
                    appearanceColor: cue.appearanceReference.appearanceColor,
                }
                : {}),
            ...(cue.cueFade !== undefined
                ? {
                    cueFade: cue.cueFade,
                }
                : {}),
            ...(cue.cueTiming !== undefined
                ? {
                    cueTiming: cue.cueTiming,
                }
                : {}),
        }));
        const events = cuePlan.map((cue) => ({
            timestamp: cue.timestamp,
            execToken: cue.execToken,
            cueNumber: cue.cueNumber,
            cueName: cue.name,
            ...(cue.regionActions?.length
                ? {
                    regionActions: cue.regionActions,
                }
                : {}),
            ...(cue.cueFade !== undefined
                ? {
                    cueFade: cue.cueFade,
                }
                : {}),
            ...(cue.cueTiming !== undefined
                ? {
                    cueTiming: cue.cueTiming,
                }
                : {}),
        }));
        regionSequences.push({
            regionId: region.regionId,
            displayName: createRegionSequenceDisplayName(region),
            regionLabel: region.regionLabel,
            start: region.start,
            end: region.end,
            color: region.color,
            cues,
            events,
            ...(sequenceAppearance
                ? {
                    appearanceName: sequenceAppearance.appearanceName,
                    appearanceNumber: sequenceAppearance.appearanceNumber,
                    appearanceColor: sequenceAppearance.appearanceColor,
                }
                : {}),
            sequenceNumber: sequenceNumber + index + 1,
        });
    });
    return {
        regionSequences,
        nextSequenceNumber: sequenceNumber + regions.length,
    };
}
function createRegionSequenceDisplayName(region) {
    const regionLabel = sanitizeMarkerName(region.regionLabel).trim();
    return regionLabel ? `${region.regionId} - ${regionLabel}` : region.regionId;
}
function createRegionCuePlan(region, markers, resolveAppearance) {
    const seenNames = new Map();
    const markerSources = markers.map((marker, index) => ({
        kind: "marker",
        marker,
        timestamp: marker.start,
        sortPriority: 1,
        sourceOrder: index,
    }));
    const boundarySources = [
        {
            kind: "boundary",
            timestamp: region.start,
            eventTimestamp: region.start,
            displayName: REGION_START_CUE_NAME,
            sortPriority: 0,
            sourceOrder: -1,
        },
        {
            kind: "boundary",
            timestamp: region.end,
            eventTimestamp: createRegionEndCueTimestamp(region),
            displayName: REGION_END_CUE_NAME,
            sortPriority: 2,
            sourceOrder: markers.length,
        },
    ];
    const sources = mergeBoundarySourcesIntoMatchingMarkers(boundarySources, markerSources).sort(compareRegionCuePlanSources);
    return sources.map((source, index) => {
        const cueNumber = index + 1;
        const baseName = resolveRegionCueBaseName(source, cueNumber);
        const count = (seenNames.get(baseName) ?? 0) + 1;
        seenNames.set(baseName, count);
        const cueName = count === 1 ? baseName : `${baseName} ${count}`;
        if (source.kind === "boundary") {
            return {
                timestamp: source.eventTimestamp,
                execToken: "Go+",
                cueNumber,
                name: cueName,
            };
        }
        const appearanceReference = source.marker.color ? resolveAppearance(source.marker.color) : undefined;
        return {
            timestamp: source.boundaryEventTimestamp ?? source.marker.start,
            execToken: source.marker.execToken,
            cueNumber,
            name: cueName,
            ...(appearanceReference ? { appearanceReference } : {}),
            ...(source.marker.regionActions?.length
                ? {
                    regionActions: source.marker.regionActions,
                }
                : {}),
            ...(source.marker.cueFade !== undefined
                ? {
                    cueFade: source.marker.cueFade,
                }
                : {}),
            ...(source.marker.cueTiming !== undefined
                ? {
                    cueTiming: source.marker.cueTiming,
                }
                : {}),
        };
    });
}
function resolveRegionCueBaseName(source, cueNumber) {
    if (source.kind === "boundary") {
        return source.displayName;
    }
    const sanitizedName = sanitizeMarkerName(source.marker.displayName).trim();
    const markerName = sanitizedName || `Cue ${cueNumber}`;
    if (source.boundaryLabels?.length) {
        return [...source.boundaryLabels, markerName].join(" + ");
    }
    return markerName;
}
function mergeBoundarySourcesIntoMatchingMarkers(boundarySources, markerSources) {
    const remainingBoundarySources = [];
    for (const boundarySource of boundarySources) {
        if (boundarySource.kind !== "boundary") {
            continue;
        }
        const mergeTarget = findBoundaryMergeTarget(boundarySource, markerSources);
        if (!mergeTarget || mergeTarget.kind !== "marker") {
            remainingBoundarySources.push(boundarySource);
            continue;
        }
        mergeTarget.boundaryLabels = [...(mergeTarget.boundaryLabels ?? []), boundarySource.displayName];
        if (boundarySource.displayName !== REGION_END_CUE_NAME || areTimestampsEqual(mergeTarget.timestamp, boundarySource.timestamp)) {
            mergeTarget.boundaryEventTimestamp = boundarySource.eventTimestamp;
        }
        mergeTarget.sortPriority = boundarySource.sortPriority;
    }
    return [...remainingBoundarySources, ...markerSources];
}
function createRegionEndCueTimestamp(region) {
    const endValue = parseNumericTimestamp(region.end);
    const startValue = parseNumericTimestamp(region.start);
    if (endValue === undefined || (startValue !== undefined && endValue <= startValue)) {
        return region.end;
    }
    const leadSeconds = REGION_END_CUE_LEAD_MS / 1000;
    const minGapSeconds = REGION_END_CUE_MIN_GAP_MS / 1000;
    let eventTimestamp = endValue - leadSeconds;
    if (startValue !== undefined && eventTimestamp <= startValue && endValue - startValue > minGapSeconds) {
        eventTimestamp = endValue - minGapSeconds;
    }
    if (startValue !== undefined && eventTimestamp < startValue && endValue > startValue) {
        eventTimestamp = startValue;
    }
    return formatDerivedTimestamp(eventTimestamp);
}
function parseNumericTimestamp(timestamp) {
    const trimmedTimestamp = timestamp.trim();
    if (!NUMERIC_TIMESTAMP_PATTERN.test(trimmedTimestamp)) {
        return undefined;
    }
    const parsedTimestamp = Number.parseFloat(trimmedTimestamp);
    return Number.isFinite(parsedTimestamp) ? parsedTimestamp : undefined;
}
function formatDerivedTimestamp(timestamp) {
    return timestamp.toFixed(3);
}
function findBoundaryMergeTarget(boundarySource, markerSources) {
    if (boundarySource.kind !== "boundary") {
        return undefined;
    }
    const matchingMarkerSources = markerSources.filter((source) => source.kind === "marker" && areTimestampsEqual(source.timestamp, boundarySource.timestamp));
    if (matchingMarkerSources.length === 0) {
        return boundarySource.displayName === REGION_END_CUE_NAME ? findRegionEndWindowMergeTarget(boundarySource, markerSources) : undefined;
    }
    return boundarySource.displayName === REGION_END_CUE_NAME ? matchingMarkerSources.at(-1) : matchingMarkerSources[0];
}
function findRegionEndWindowMergeTarget(boundarySource, markerSources) {
    if (boundarySource.kind !== "boundary") {
        return undefined;
    }
    const endTimestamp = parseNumericTimestamp(boundarySource.timestamp);
    const shiftedEndTimestamp = parseNumericTimestamp(boundarySource.eventTimestamp);
    if (endTimestamp === undefined || shiftedEndTimestamp === undefined) {
        return undefined;
    }
    return markerSources
        .filter((source) => {
        if (source.kind !== "marker") {
            return false;
        }
        const markerTimestamp = parseNumericTimestamp(source.timestamp);
        return markerTimestamp !== undefined && markerTimestamp >= shiftedEndTimestamp && markerTimestamp < endTimestamp;
    })
        .at(-1);
}
function areTimestampsEqual(left, right) {
    const leftTime = Number.parseFloat(left);
    const rightTime = Number.parseFloat(right);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return leftTime === rightTime;
    }
    return left === right;
}
function compareRegionCuePlanSources(left, right) {
    const leftTime = Number.parseFloat(left.timestamp);
    const rightTime = Number.parseFloat(right.timestamp);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return leftTime - rightTime;
    }
    if (left.timestamp !== right.timestamp) {
        return left.timestamp.localeCompare(right.timestamp);
    }
    if (left.sortPriority !== right.sortPriority) {
        return left.sortPriority - right.sortPriority;
    }
    return left.sourceOrder - right.sourceOrder;
}
function resolveContainingRegion(start, regions) {
    const markerStart = Number.parseFloat(start);
    if (!Number.isFinite(markerStart)) {
        return undefined;
    }
    return regions
        .filter((region) => markerStart >= region.startValue && markerStart < region.endValue)
        .sort((left, right) => {
        if (left.lengthValue !== right.lengthValue) {
            return left.lengthValue - right.lengthValue;
        }
        return left.order - right.order;
    })[0];
}
function compareMarkerStart(leftStart, rightStart, leftIndex, rightIndex) {
    const leftValue = Number.parseFloat(leftStart);
    const rightValue = Number.parseFloat(rightStart);
    if (leftValue !== rightValue) {
        return leftValue - rightValue;
    }
    return leftIndex - rightIndex;
}
//# sourceMappingURL=region-services.js.map