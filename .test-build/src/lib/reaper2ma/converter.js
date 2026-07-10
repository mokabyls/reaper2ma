import { createAppearanceNameFromReaperColor, convertReaperColorToGrandmaAppearanceColor } from "./colors.js";
import { assignMarkersToRegions, buildRegionSequences, parseRegions } from "./region-services.js";
import { buildOutputFileName, normalizeOutputBaseName } from "./filename.js";
import { createBpmSequence, groupBumpSequences, groupRepeatedSequences, normalizeMarkerRows, parseReaperMarkerRows, isRegionRow, splitMarkerRows, } from "./markers.js";
import { generateMacroXML, generateTimecodeXML } from "./xml.js";
export function convertReaperMarkersToArtifacts(normalizedMarkers, sourceFileName, settings) {
    return convertMarkersAndRegionsToArtifacts(normalizedMarkers, [], sourceFileName, settings);
}
export function convertReaperCsvToArtifacts(dataString, sourceFileName, settings) {
    const rows = parseReaperMarkerRows(dataString);
    const regionRows = settings.importMode === "regions-and-markers" ? rows.filter(isRegionRow) : [];
    const markerRows = rows.filter((row) => !isRegionRow(row));
    const normalizedMarkers = normalizeMarkerRows(markerRows);
    return convertMarkersAndRegionsToArtifacts(normalizedMarkers, regionRows, sourceFileName, settings);
}
export function createConversionOutputFiles(artifacts) {
    const files = [
        {
            name: buildOutputFileName(artifacts.outputBaseName, "macro"),
            content: artifacts.macroXml,
        },
    ];
    if (artifacts.timecodeXml) {
        files.push({
            name: buildOutputFileName(artifacts.outputBaseName, "timecode"),
            content: artifacts.timecodeXml,
        });
    }
    return files;
}
function convertMarkersAndRegionsToArtifacts(normalizedMarkers, regionRows, sourceFileName, settings) {
    const appearanceRegistry = createAppearanceRegistry(settings.appearanceStartNumber);
    const outputBaseName = normalizeOutputBaseName(sourceFileName);
    if (settings.importMode === "regions-and-markers" && regionRows.length > 0) {
        return convertHybridArtifacts(normalizedMarkers, regionRows, outputBaseName, settings, appearanceRegistry);
    }
    return convertMarkersOnlyArtifacts(normalizedMarkers, outputBaseName, settings, appearanceRegistry);
}
function convertMarkersOnlyArtifacts(normalizedMarkers, outputBaseName, settings, appearanceRegistry) {
    const { uniqueCues, repeatedMarkers, bumpMarkers } = splitMarkerRows(normalizedMarkers);
    const repeatedSequences = groupRepeatedSequences(repeatedMarkers, settings.prefix, settings.sequenceNumber, appearanceRegistry.nextAppearanceNumber(), appearanceRegistry.resolveAppearance);
    const repeatedSequenceNamesByColor = new Map(repeatedSequences.map((sequence) => [sequence.color, sequence.displayName]));
    const bumpSequences = groupBumpSequences(bumpMarkers, settings.sequenceNumber + repeatedSequences.length, settings.prefix, repeatedSequenceNamesByColor);
    const bpmMarkers = normalizedMarkers.filter((marker) => marker.bpm !== undefined && marker.bpmText !== undefined);
    const bpmSequence = createBpmSequence(bpmMarkers, settings.sequenceNumber, repeatedSequences.length + bumpSequences.length);
    const macroXml = generateMacroXML(settings, uniqueCues, [], repeatedSequences, bumpSequences, bpmSequence, outputBaseName);
    const timecodeXml = settings.exportMode === "cues-and-timecode"
        ? generateTimecodeXML(settings, uniqueCues, [], repeatedSequences, bumpSequences, bpmSequence, outputBaseName)
        : undefined;
    return {
        importMode: settings.importMode ?? "markers-only",
        outputBaseName,
        regionSequences: [],
        uniqueCues,
        repeatedSequences,
        bumpSequences,
        bpmSequence,
        macroXml,
        timecodeXml,
    };
}
function convertHybridArtifacts(normalizedMarkers, regionRows, outputBaseName, settings, appearanceRegistry) {
    const regions = parseRegions(regionRows);
    const markersWithRegions = assignMarkersToRegions(normalizedMarkers, regions);
    const outsideRegionMarkers = markersWithRegions.filter((marker) => !marker.regionId);
    const { regionSequences, nextSequenceNumber: nextSequenceAfterRegions } = buildRegionSequences(markersWithRegions, regions, settings.sequenceNumber, appearanceRegistry.resolveAppearance);
    const { uniqueCues, repeatedMarkers, bumpMarkers } = splitMarkerRows(outsideRegionMarkers);
    const repeatedSequences = groupRepeatedSequences(repeatedMarkers, settings.prefix, nextSequenceAfterRegions, appearanceRegistry.nextAppearanceNumber(), appearanceRegistry.resolveAppearance);
    const repeatedSequenceNamesByColor = new Map(repeatedSequences.map((sequence) => [sequence.color, sequence.displayName]));
    const bumpSequences = groupBumpSequences(bumpMarkers, nextSequenceAfterRegions + repeatedSequences.length, settings.prefix, repeatedSequenceNamesByColor);
    const bpmMarkers = markersWithRegions.filter((marker) => marker.bpm !== undefined && marker.bpmText !== undefined);
    const bpmSequence = createBpmSequence(bpmMarkers, settings.sequenceNumber, regionSequences.length + repeatedSequences.length + bumpSequences.length);
    const macroXml = generateMacroXML(settings, uniqueCues, regionSequences, repeatedSequences, bumpSequences, bpmSequence, outputBaseName);
    const timecodeXml = settings.exportMode === "cues-and-timecode"
        ? generateTimecodeXML(settings, uniqueCues, regionSequences, repeatedSequences, bumpSequences, bpmSequence, outputBaseName)
        : undefined;
    return {
        importMode: settings.importMode ?? "regions-and-markers",
        outputBaseName,
        regionSequences,
        uniqueCues,
        repeatedSequences,
        bumpSequences,
        bpmSequence,
        macroXml,
        timecodeXml,
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
            const appearanceColor = convertReaperColorToGrandmaAppearanceColor(trimmedColor) ?? "";
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