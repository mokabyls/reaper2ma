import { createAppearanceNameFromReaperColor, convertReaperColorToGrandmaAppearanceColor } from "./colors.js";
import { validateReaperCsvRows } from "./csv-validation.js";
import { assignMarkersToRegions, buildRegionSequences, parseRegions } from "./region-services.js";
import type { AppearanceReference, ConversionArtifacts, ConversionSettings, ConvertedMarker, ReaperRegionRow } from "./types.js";
import { buildOutputFileName, normalizeOutputBaseName } from "./filename.js";
import {
    createBpmSequence,
    groupBumpSequences,
    groupRepeatedSequences,
    normalizeMarkerRows,
    parseReaperMarkerCsv,
    isRegionRow,
    splitMarkerRows,
} from "./markers.js";
import { applySequenceNamePrefix } from "./sequence-services.js";
import { generateMacroXML } from "./xml.js";

export function convertReaperMarkersToArtifacts(
    normalizedMarkers: ConvertedMarker[],
    sourceFileName: string,
    settings: ConversionSettings,
): ConversionArtifacts {
    return convertMarkersAndRegionsToArtifacts(normalizedMarkers, [], sourceFileName, settings, []);
}

export function convertReaperCsvToArtifacts(dataString: string, sourceFileName: string, settings: ConversionSettings): ConversionArtifacts {
    const { headers, rows } = parseReaperMarkerCsv(dataString);
    const validationWarnings = validateReaperCsvRows(headers, rows);
    const regionRows = settings.importMode === "regions-and-markers" ? rows.filter(isRegionRow) : [];
    const markerRows = rows.filter((row) => !isRegionRow(row));
    const normalizedMarkers = normalizeMarkerRows(markerRows);

    return convertMarkersAndRegionsToArtifacts(normalizedMarkers, regionRows, sourceFileName, settings, validationWarnings);
}

export function createConversionOutputFiles(artifacts: ConversionArtifacts) {
    return [
        {
            name: buildOutputFileName(artifacts.outputBaseName, "macro"),
            content: artifacts.macroXml,
        },
    ];
}

function convertMarkersAndRegionsToArtifacts(
    normalizedMarkers: ConvertedMarker[],
    regionRows: ReaperRegionRow[],
    sourceFileName: string,
    settings: ConversionSettings,
    validationWarnings: string[],
): ConversionArtifacts {
    const appearanceRegistry = createAppearanceRegistry(settings.appearanceStartNumber);
    const outputBaseName = normalizeOutputBaseName(sourceFileName);

    if (settings.importMode === "regions-and-markers" && regionRows.length > 0) {
        return convertHybridArtifacts(normalizedMarkers, regionRows, outputBaseName, settings, appearanceRegistry, validationWarnings);
    }

    return convertMarkersOnlyArtifacts(normalizedMarkers, outputBaseName, settings, appearanceRegistry, validationWarnings);
}

function convertMarkersOnlyArtifacts(
    normalizedMarkers: ConvertedMarker[],
    outputBaseName: string,
    settings: ConversionSettings,
    appearanceRegistry: ReturnType<typeof createAppearanceRegistry>,
    validationWarnings: string[],
): ConversionArtifacts {
    const { uniqueCues, repeatedMarkers, bumpMarkers } = splitMarkerRows(normalizedMarkers);
    const repeatedSequences = groupRepeatedSequences(
        repeatedMarkers,
        settings.prefix,
        settings.sequenceNumber,
        appearanceRegistry.nextAppearanceNumber(),
        appearanceRegistry.resolveAppearance,
    );
    const repeatedSequenceNamesByColor = new Map(repeatedSequences.map((sequence) => [sequence.color, sequence.displayName]));
    const bumpSequences = groupBumpSequences(
        bumpMarkers,
        settings.sequenceNumber + repeatedSequences.length,
        settings.prefix,
        repeatedSequenceNamesByColor,
    );
    const bumpReleaseWarnings = collectBumpReleaseWarnings(bumpSequences);
    const bpmMarkers = normalizedMarkers.filter((marker) => marker.bpm !== undefined && marker.bpmText !== undefined);
    const bpmSequence = createBpmSequence(bpmMarkers, settings.sequenceNumber, repeatedSequences.length + bumpSequences.length);
    const prefixed = prefixGeneratedSequences(settings.sequenceNamePrefix, [], [], repeatedSequences, bumpSequences, bpmSequence);
    const macroXml = generateMacroXML(
        settings,
        uniqueCues,
        prefixed.regionSequences,
        prefixed.regionLayerSequences,
        prefixed.repeatedSequences,
        prefixed.bumpSequences,
        prefixed.bpmSequence,
        outputBaseName,
    );

    return {
        importMode: settings.importMode ?? "markers-only",
        outputBaseName,
        validationWarnings: [...validationWarnings, ...bumpReleaseWarnings],
        regionSequences: prefixed.regionSequences,
        regionLayerSequences: prefixed.regionLayerSequences,
        uniqueCues,
        repeatedSequences: prefixed.repeatedSequences,
        bumpSequences: prefixed.bumpSequences,
        bpmSequence: prefixed.bpmSequence,
        macroXml,
    };
}

function convertHybridArtifacts(
    normalizedMarkers: ConvertedMarker[],
    regionRows: ReaperRegionRow[],
    outputBaseName: string,
    settings: ConversionSettings,
    appearanceRegistry: ReturnType<typeof createAppearanceRegistry>,
    validationWarnings: string[],
): ConversionArtifacts {
    const regions = parseRegions(regionRows);
    const markersWithRegions = assignMarkersToRegions(normalizedMarkers, regions);
    const outsideRegionMarkers = markersWithRegions.filter((marker) => !marker.regionId);
    const {
        regionSequences,
        regionLayerSequences,
        nextSequenceNumber: nextSequenceAfterRegionsAndLayers,
    } = buildRegionSequences(
        markersWithRegions,
        regions,
        settings.sequenceNumber,
        appearanceRegistry.resolveAppearance,
        settings.regionEndPreRollMs,
    );
    const { uniqueCues, repeatedMarkers, bumpMarkers } = splitMarkerRows(outsideRegionMarkers);
    const repeatedSequences = groupRepeatedSequences(
        repeatedMarkers,
        settings.prefix,
        nextSequenceAfterRegionsAndLayers,
        appearanceRegistry.nextAppearanceNumber(),
        appearanceRegistry.resolveAppearance,
    );
    const repeatedSequenceNamesByColor = new Map(repeatedSequences.map((sequence) => [sequence.color, sequence.displayName]));
    const bumpSequences = groupBumpSequences(
        bumpMarkers,
        nextSequenceAfterRegionsAndLayers + repeatedSequences.length,
        settings.prefix,
        repeatedSequenceNamesByColor,
    );
    const bumpReleaseWarnings = collectBumpReleaseWarnings(bumpSequences);
    const regionLayerWarnings = collectRegionLayerWarnings(markersWithRegions);
    const bpmMarkers = markersWithRegions.filter((marker) => marker.bpm !== undefined && marker.bpmText !== undefined);
    const bpmSequence = createBpmSequence(
        bpmMarkers,
        settings.sequenceNumber,
        regionSequences.length + regionLayerSequences.length + repeatedSequences.length + bumpSequences.length,
    );
    const prefixed = prefixGeneratedSequences(
        settings.sequenceNamePrefix,
        regionSequences,
        regionLayerSequences,
        repeatedSequences,
        bumpSequences,
        bpmSequence,
    );
    const macroXml = generateMacroXML(
        settings,
        uniqueCues,
        prefixed.regionSequences,
        prefixed.regionLayerSequences,
        prefixed.repeatedSequences,
        prefixed.bumpSequences,
        prefixed.bpmSequence,
        outputBaseName,
    );

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

function collectBumpReleaseWarnings(bumpSequences: ConversionArtifacts["bumpSequences"]): string[] {
    return bumpSequences.flatMap((sequence) => sequence.releaseWarnings ?? []);
}

function collectRegionLayerWarnings(markers: ConvertedMarker[]): string[] {
    return markers
        .filter((marker) => marker.regionLayerName && !marker.regionId)
        .map(
            (marker) =>
                `Layer marker "${marker.displayName || "Cue"}" uses [LAYER=${marker.regionLayerName}] without a target region. It is handled as a normal marker.`,
        );
}

function prefixGeneratedSequences(
    sequenceNamePrefix: string,
    regionSequences: ConversionArtifacts["regionSequences"],
    regionLayerSequences: ConversionArtifacts["regionLayerSequences"],
    repeatedSequences: ConversionArtifacts["repeatedSequences"],
    bumpSequences: ConversionArtifacts["bumpSequences"],
    bpmSequence: ConversionArtifacts["bpmSequence"],
): Pick<ConversionArtifacts, "regionSequences" | "regionLayerSequences" | "repeatedSequences" | "bumpSequences" | "bpmSequence"> {
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

function createAppearanceRegistry(startNumber: number) {
    const appearancesByColor = new Map<string, AppearanceReference>();
    let nextAppearanceNumber = startNumber;

    return {
        resolveAppearance(color: string): AppearanceReference | undefined {
            const trimmedColor = color.trim();

            if (!trimmedColor) {
                return undefined;
            }

            const existing = appearancesByColor.get(trimmedColor);

            if (existing) {
                return existing;
            }

            const appearanceColor = convertReaperColorToGrandmaAppearanceColor(trimmedColor) ?? "";
            const appearanceReference: AppearanceReference = {
                appearanceName: createAppearanceNameFromReaperColor(trimmedColor),
                appearanceNumber: nextAppearanceNumber++,
                appearanceColor,
            };

            appearancesByColor.set(trimmedColor, appearanceReference);

            return appearanceReference;
        },
        nextAppearanceNumber(): number {
            return nextAppearanceNumber;
        },
    };
}
