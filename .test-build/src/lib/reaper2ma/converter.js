import { createAppearanceNameFromReaperColor, convertReaperColorToGrandmaAppearanceColor } from "./colors.js";
import { validateReaperCsvRows } from "./csv-validation.js";
import { assignMarkersToRegions, buildRegionSequences, parseRegions } from "./region-services.js";
import { buildOutputFileName, normalizeOutputBaseName } from "./filename.js";
import { createBpmSequence, groupBumpSequences, groupRepeatedSequences, normalizeMarkerRows, parseReaperMarkerCsv, isRegionRow, splitMarkerRows, } from "./markers.js";
import { applySequenceNamePrefix } from "./sequence-services.js";
import { generateMacroXML } from "./xml.js";
export function convertReaperMarkersToArtifacts(normalizedMarkers, sourceFileName, settings) {
    return convertMarkersAndRegionsToArtifacts(normalizedMarkers, [], sourceFileName, settings, []);
}
export function convertReaperCsvToArtifacts(dataString, sourceFileName, settings) {
    const { headers, rows } = parseReaperMarkerCsv(dataString);
    const validationWarnings = validateReaperCsvRows(headers, rows);
    const regionRows = settings.importMode === "regions-and-markers" ? rows.filter(isRegionRow) : [];
    const markerRows = rows.filter((row) => !isRegionRow(row));
    const normalizedMarkers = normalizeMarkerRows(markerRows);
    return convertMarkersAndRegionsToArtifacts(normalizedMarkers, regionRows, sourceFileName, settings, validationWarnings);
}
export function createConversionOutputFiles(artifacts) {
    return [
        {
            name: buildOutputFileName(artifacts.outputBaseName, "macro"),
            content: artifacts.macroXml,
        },
    ];
}
function convertMarkersAndRegionsToArtifacts(normalizedMarkers, regionRows, sourceFileName, settings, validationWarnings) {
    const appearanceRegistry = createAppearanceRegistry(settings.appearanceStartNumber);
    const outputBaseName = normalizeOutputBaseName(sourceFileName);
    if (settings.importMode === "regions-and-markers" && regionRows.length > 0) {
        return convertHybridArtifacts(normalizedMarkers, regionRows, outputBaseName, settings, appearanceRegistry, validationWarnings);
    }
    return convertMarkersOnlyArtifacts(normalizedMarkers, outputBaseName, settings, appearanceRegistry, validationWarnings);
}
function convertMarkersOnlyArtifacts(normalizedMarkers, outputBaseName, settings, appearanceRegistry, validationWarnings) {
    const { uniqueCues, repeatedMarkers, bumpMarkers } = splitMarkerRows(normalizedMarkers);
    const repeatedSequences = groupRepeatedSequences(repeatedMarkers, settings.prefix, settings.sequenceNumber, appearanceRegistry.nextAppearanceNumber(), appearanceRegistry.resolveAppearance);
    const repeatedSequenceNamesByColor = new Map(repeatedSequences.map((sequence) => [sequence.color, sequence.displayName]));
    const bumpSequences = groupBumpSequences(bumpMarkers, settings.sequenceNumber + repeatedSequences.length, settings.prefix, repeatedSequenceNamesByColor, appearanceRegistry.resolveAppearance);
    const bumpReleaseWarnings = collectBumpReleaseWarnings(bumpSequences);
    const regionLayerWarnings = collectRegionLayerWarnings(normalizedMarkers, []);
    const bpmSources = collectBpmMarkerSources(normalizedMarkers);
    const bpmSequence = createBpmSequence(bpmSources, settings.sequenceNumber, repeatedSequences.length + bumpSequences.length);
    const prefixed = prefixGeneratedSequences(settings.sequenceNamePrefix, [], [], repeatedSequences, bumpSequences, bpmSequence);
    const macroXml = generateMacroXML(settings, uniqueCues, prefixed.regionSequences, prefixed.regionLayerSequences, prefixed.repeatedSequences, prefixed.bumpSequences, prefixed.bpmSequence, outputBaseName);
    return {
        importMode: settings.importMode ?? "markers-only",
        outputBaseName,
        validationWarnings: [...validationWarnings, ...regionLayerWarnings, ...bumpReleaseWarnings],
        regionSequences: prefixed.regionSequences,
        regionLayerSequences: prefixed.regionLayerSequences,
        uniqueCues,
        repeatedSequences: prefixed.repeatedSequences,
        bumpSequences: prefixed.bumpSequences,
        bpmSequence: prefixed.bpmSequence,
        macroXml,
    };
}
function convertHybridArtifacts(normalizedMarkers, regionRows, outputBaseName, settings, appearanceRegistry, validationWarnings) {
    const regions = parseRegions(regionRows);
    const markersWithRegions = assignMarkersToRegions(normalizedMarkers, regions);
    const outsideRegionMarkers = markersWithRegions.filter((marker) => !marker.regionId);
    const { regionSequences, regionLayerSequences, nextSequenceNumber: nextSequenceAfterRegionsAndLayers, } = buildRegionSequences(markersWithRegions, regions, settings.sequenceNumber, appearanceRegistry.resolveAppearance, settings.regionEndPreRollMs, settings.regionLayerPreRollEnabled, settings.regionLayerPreRollMs);
    const { uniqueCues, repeatedMarkers, bumpMarkers } = splitMarkerRows(outsideRegionMarkers);
    const repeatedSequences = groupRepeatedSequences(repeatedMarkers, settings.prefix, nextSequenceAfterRegionsAndLayers, appearanceRegistry.nextAppearanceNumber(), appearanceRegistry.resolveAppearance);
    const repeatedSequenceNamesByColor = new Map(repeatedSequences.map((sequence) => [sequence.color, sequence.displayName]));
    const bumpSequences = groupBumpSequences(bumpMarkers, nextSequenceAfterRegionsAndLayers + repeatedSequences.length, settings.prefix, repeatedSequenceNamesByColor, appearanceRegistry.resolveAppearance);
    const bumpReleaseWarnings = collectBumpReleaseWarnings(bumpSequences);
    const regionLayerWarnings = collectRegionLayerWarnings(markersWithRegions, regionLayerSequences);
    const bpmSources = [...collectRegionBpmSources(regions), ...collectBpmMarkerSources(markersWithRegions)];
    const bpmSequence = createBpmSequence(bpmSources, settings.sequenceNumber, regionSequences.length + regionLayerSequences.length + repeatedSequences.length + bumpSequences.length);
    const prefixed = prefixGeneratedSequences(settings.sequenceNamePrefix, regionSequences, regionLayerSequences, repeatedSequences, bumpSequences, bpmSequence);
    const macroXml = generateMacroXML(settings, uniqueCues, prefixed.regionSequences, prefixed.regionLayerSequences, prefixed.repeatedSequences, prefixed.bumpSequences, prefixed.bpmSequence, outputBaseName);
    return {
        importMode: settings.importMode ?? "regions-and-markers",
        outputBaseName,
        validationWarnings: [...validationWarnings, ...regionLayerWarnings, ...bumpReleaseWarnings],
        regionSequences: prefixed.regionSequences,
        regionLayerSequences: prefixed.regionLayerSequences,
        uniqueCues,
        repeatedSequences: prefixed.repeatedSequences,
        bumpSequences: prefixed.bumpSequences,
        bpmSequence: prefixed.bpmSequence,
        macroXml,
    };
}
function collectBumpReleaseWarnings(bumpSequences) {
    return bumpSequences.flatMap((sequence) => sequence.releaseWarnings ?? []);
}
function collectBpmMarkerSources(markers) {
    return markers.flatMap((marker) => marker.bpm !== undefined && marker.bpmText !== undefined
        ? [
            {
                displayName: marker.displayName,
                start: marker.start,
                bpm: marker.bpm,
                bpmText: marker.bpmText,
            },
        ]
        : []);
}
function collectRegionBpmSources(regions) {
    return regions.flatMap((region) => region.bpm !== undefined && region.bpmText !== undefined
        ? [
            {
                displayName: region.regionLabel,
                start: region.start,
                bpm: region.bpm,
                bpmText: region.bpmText,
            },
        ]
        : []);
}
function collectRegionLayerWarnings(markers, regionLayerSequences) {
    const warnings = [];
    const layerNamesByRegionId = new Map();
    for (const sequence of regionLayerSequences) {
        const layerNames = layerNamesByRegionId.get(sequence.regionId) ?? new Set();
        layerNames.add(sequence.layerName);
        layerNamesByRegionId.set(sequence.regionId, layerNames);
    }
    for (const marker of markers) {
        if (marker.regionLayerName && !marker.regionId) {
            warnings.push(`Layer marker "${marker.displayName || "Cue"}" uses [LAYER=${marker.regionLayerName}] without a target region. It is handled as a normal marker.`);
        }
        for (const action of marker.regionLayerActions ?? []) {
            const actionTag = formatRegionLayerActionTag(action);
            if (!action.regionId) {
                warnings.push(`Layer off marker "${marker.displayName || "Cue"}" uses ${actionTag} without a target region. No layer Off event will be generated.`);
                continue;
            }
            const layerNames = layerNamesByRegionId.get(action.regionId) ?? new Set();
            if (action.scope === "layer" && !layerNames.has(action.layerName)) {
                warnings.push(`Layer off marker "${marker.displayName || "Cue"}" targets ${actionTag} for ${action.regionId}, but that layer sequence does not exist.`);
            }
            if (action.scope === "all" && layerNames.size === 0) {
                warnings.push(`Layer off marker "${marker.displayName || "Cue"}" targets [OFF_LAYERS] for ${action.regionId}, but that region has no layer sequences.`);
            }
        }
    }
    return warnings;
}
function formatRegionLayerActionTag(action) {
    return action.scope === "layer" ? `[OFF_LAYER=${action.layerName}]` : "[OFF_LAYERS]";
}
function prefixGeneratedSequences(sequenceNamePrefix, regionSequences, regionLayerSequences, repeatedSequences, bumpSequences, bpmSequence) {
    const prefix = sequenceNamePrefix.trim();
    if (!prefix) {
        return {
            regionSequences,
            regionLayerSequences,
            repeatedSequences,
            bumpSequences,
            bpmSequence,
        };
    }
    return {
        regionSequences: regionSequences.map((sequence) => ({
            ...sequence,
            displayName: applySequenceNamePrefix(sequence.displayName, prefix),
        })),
        regionLayerSequences: regionLayerSequences.map((sequence) => ({
            ...sequence,
            displayName: applySequenceNamePrefix(sequence.displayName, prefix),
        })),
        repeatedSequences: repeatedSequences.map((sequence) => ({
            ...sequence,
            displayName: applySequenceNamePrefix(sequence.displayName, prefix),
        })),
        bumpSequences: bumpSequences.map((sequence) => ({
            ...sequence,
            displayName: applySequenceNamePrefix(sequence.displayName, prefix),
        })),
        bpmSequence: bpmSequence
            ? {
                ...bpmSequence,
                displayName: applySequenceNamePrefix(bpmSequence.displayName, prefix),
            }
            : bpmSequence,
    };
}
function createAppearanceRegistry(startNumber) {
    const appearancesByColor = new Map();
    let nextAppearanceNumber = startNumber;
    return {
        resolveAppearance(color) {
            const trimmedColor = color.trim();
            if (!trimmedColor) {
                return undefined;
            }
            const existing = appearancesByColor.get(trimmedColor);
            if (existing) {
                return existing;
            }
            const appearanceColor = convertReaperColorToGrandmaAppearanceColor(trimmedColor);
            if (!appearanceColor) {
                return undefined;
            }
            const appearanceReference = {
                appearanceName: createAppearanceNameFromReaperColor(trimmedColor),
                appearanceNumber: nextAppearanceNumber++,
                appearanceColor,
            };
            appearancesByColor.set(trimmedColor, appearanceReference);
            return appearanceReference;
        },
        nextAppearanceNumber() {
            return nextAppearanceNumber;
        },
    };
}
//# sourceMappingURL=converter.js.map