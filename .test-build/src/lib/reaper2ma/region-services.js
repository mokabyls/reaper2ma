import { sanitizeMarkerName } from "./marker-parser.js";
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
        const region = resolveContainingRegion(marker.start, regions);
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
export function buildRegionSequences(markers, regions, sequenceNumber, resolveAppearance) {
    const regionSequences = [];
    regions.forEach((region, index) => {
        const regionMarkers = markers
            .map((marker, index) => ({ marker, index }))
            .filter(({ marker }) => marker.regionId === region.regionId)
            .sort((left, right) => compareMarkerStart(left.marker.start, right.marker.start, left.index, right.index))
            .map(({ marker }) => marker);
        const sequenceAppearance = region.color ? resolveAppearance(region.color) : undefined;
        const cuePlan = createRegionCuePlan(regionMarkers, resolveAppearance);
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
        if (cues.length === 0) {
            cues.push({
                cueNumber: 1,
                name: "Cue 1",
            });
            events.push({
                timestamp: region.start,
                execToken: "Goto",
                cueNumber: 1,
                cueName: "Cue 1",
                regionActions: [],
            });
        }
        regionSequences.push({
            regionId: region.regionId,
            displayName: region.regionId,
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
function createRegionCuePlan(markers, resolveAppearance) {
    const seenNames = new Map();
    return markers.map((marker, index) => {
        const cueNumber = index + 1;
        const baseName = marker.displayName.trim().length > 0 ? sanitizeMarkerName(marker.displayName) : `Cue ${cueNumber}`;
        const count = (seenNames.get(baseName) ?? 0) + 1;
        seenNames.set(baseName, count);
        const cueName = count === 1 ? baseName : `${baseName} ${count}`;
        const appearanceReference = marker.color ? resolveAppearance(marker.color) : undefined;
        return {
            ...marker,
            timestamp: marker.start,
            cueNumber,
            name: cueName,
            appearanceReference,
        };
    });
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