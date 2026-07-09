import type { BpmSequence, ConversionArtifacts, ConversionSettings, ConvertedMarker } from "./types.js";
import { buildOutputFileName, normalizeOutputBaseName } from "./filename.js";
import { groupRepeatedSequences, normalizeMarkerRows, parseReaperMarkerRows, splitMarkerRows } from "./markers.js";
import { generateMacroXML, generateTimecodeXML } from "./xml.js";

export function convertReaperCsvToArtifacts(dataString: string, sourceFileName: string, settings: ConversionSettings): ConversionArtifacts {
    const rows = parseReaperMarkerRows(dataString);
    const normalizedMarkers = normalizeMarkerRows(rows);
    const { uniqueCues, repeatedMarkers } = splitMarkerRows(normalizedMarkers);
    const repeatedSequences = groupRepeatedSequences(repeatedMarkers, settings.prefix, settings.sequenceNumber, settings.appearanceStartNumber);
    const bpmMarkers = normalizedMarkers.filter((marker) => marker.bpm !== undefined && marker.bpmText !== undefined);
    const bpmSequence = createBpmSequence(bpmMarkers, settings.sequenceNumber, repeatedSequences.length);
    const outputBaseName = normalizeOutputBaseName(sourceFileName);

    const macroXml = generateMacroXML(settings, uniqueCues, repeatedSequences, bpmSequence, outputBaseName);
    const timecodeXml =
        settings.exportMode === "cues-and-timecode"
            ? generateTimecodeXML(settings, uniqueCues, repeatedSequences, bpmSequence, outputBaseName)
            : undefined;

    return {
        outputBaseName,
        uniqueCues,
        repeatedSequences,
        bpmSequence,
        macroXml,
        timecodeXml,
    };
}

function createBpmSequence(
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

export function createConversionOutputFiles(artifacts: ConversionArtifacts) {
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
