import { buildOutputFileName, normalizeOutputBaseName } from "./filename.js";
import { groupRepeatedSequences, normalizeMarkerRows, parseReaperMarkerRows, splitMarkerRows } from "./markers.js";
import { generateMacroXML, generateTimecodeXML } from "./xml.js";
export function convertReaperCsvToArtifacts(dataString, sourceFileName, settings) {
    const rows = parseReaperMarkerRows(dataString);
    const normalizedMarkers = normalizeMarkerRows(rows);
    const { uniqueCues, repeatedMarkers } = splitMarkerRows(normalizedMarkers);
    const repeatedSequences = groupRepeatedSequences(repeatedMarkers, settings.prefix, settings.sequenceNumber);
    const outputBaseName = normalizeOutputBaseName(sourceFileName);
    const macroXml = generateMacroXML(settings, uniqueCues, repeatedSequences, outputBaseName);
    const timecodeXml = settings.exportMode === "cues-and-timecode" ? generateTimecodeXML(settings, uniqueCues, repeatedSequences, outputBaseName) : undefined;
    return {
        outputBaseName,
        uniqueCues,
        repeatedSequences,
        macroXml,
        timecodeXml,
    };
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
//# sourceMappingURL=converter.js.map