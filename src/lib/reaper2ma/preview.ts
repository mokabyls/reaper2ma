import { buildOutputFileName } from "./filename.js";
import { calculateTimecodeDuration, collectTimecodeTimestamps } from "./timecode-duration.js";
import type { ConversionArtifacts } from "./types.js";

export type ConversionPreview = {
    importMode: string;
    sourceMarkerCount: number;
    regionCount: number;
    regionMarkerCount: number;
    uniqueCueCount: number;
    repeatedSequenceCount: number;
    bumpSequenceCount: number;
    bpmEventCount: number;
    appearanceCount: number;
    duration: string;
    generatedSequenceNames: string[];
    outputFileNames: string[];
    warnings: string[];
};

export function createConversionPreview(artifacts: ConversionArtifacts, sourceMarkerCount: number): ConversionPreview {
    const timestamps = collectTimecodeTimestamps(
        artifacts.uniqueCues,
        artifacts.regionSequences,
        artifacts.repeatedSequences,
        artifacts.bumpSequences,
        artifacts.bpmSequence,
    );
    const generatedSequenceNames = [
        ...artifacts.regionSequences.map((sequence) => sequence.displayName),
        ...artifacts.repeatedSequences.map((sequence) => sequence.displayName),
        ...artifacts.bumpSequences.map((sequence) => sequence.displayName),
        ...(artifacts.bpmSequence ? [artifacts.bpmSequence.displayName] : []),
    ];
    const appearanceCount = collectAppearanceNumbers(artifacts).size;
    const warnings: string[] = [];

    if (artifacts.uniqueCues.length === 0) {
        warnings.push("La séquence principale est vide: un CSV entièrement coloré peut produire un range invalide.");
    }

    if (artifacts.importMode === "regions-and-markers" && artifacts.regionSequences.length === 0) {
        warnings.push("Le mode régions a été sélectionné mais aucun region valide n'a été trouvé dans le CSV.");
    }

    if (sourceMarkerCount === 0) {
        warnings.push("Aucun marker n'a été trouvé dans le CSV.");
    }

    return {
        importMode: artifacts.importMode,
        sourceMarkerCount,
        regionCount: artifacts.regionSequences.length,
        regionMarkerCount: artifacts.regionSequences.reduce((total, sequence) => total + sequence.events.length, 0),
        uniqueCueCount: artifacts.uniqueCues.length,
        repeatedSequenceCount: artifacts.repeatedSequences.length,
        bumpSequenceCount: artifacts.bumpSequences.length,
        bpmEventCount: artifacts.bpmSequence?.events.length ?? 0,
        appearanceCount,
        duration: calculateTimecodeDuration(timestamps),
        generatedSequenceNames,
        outputFileNames: [
            buildOutputFileName(artifacts.outputBaseName, "macro"),
            ...(artifacts.timecodeXml ? [buildOutputFileName(artifacts.outputBaseName, "timecode")] : []),
        ],
        warnings,
    };
}

function collectAppearanceNumbers(artifacts: ConversionArtifacts): Set<number> {
    const appearanceNumbers = new Set<number>();

    for (const regionSequence of artifacts.regionSequences) {
        if (regionSequence.appearanceNumber !== undefined) {
            appearanceNumbers.add(regionSequence.appearanceNumber);
        }

        for (const cue of regionSequence.cues) {
            if (cue.appearanceNumber !== undefined) {
                appearanceNumbers.add(cue.appearanceNumber);
            }
        }
    }

    for (const repeatedSequence of artifacts.repeatedSequences) {
        if (repeatedSequence.appearanceNumber !== undefined) {
            appearanceNumbers.add(repeatedSequence.appearanceNumber);
        }
    }

    return appearanceNumbers;
}
