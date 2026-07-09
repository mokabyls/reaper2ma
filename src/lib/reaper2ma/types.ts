export type ExportMode = "cues-and-timecode" | "cues-only";

export type ReaperMarkerRow = {
    "#": string;
    Name: string;
    Start: string;
    Color: string;
};

export type ConvertedMarker = {
    displayName: string;
    execToken: string;
    start: string;
    color: string;
};

export type RepeatedSequenceEvent = {
    timestamp: string;
    execToken: string;
};

export type RepeatedSequence = {
    color: string;
    displayName: string;
    events: RepeatedSequenceEvent[];
    sequenceNumber: number;
};

export type ConversionSettings = {
    sequenceNumber: number;
    driveNumber: number;
    cueStartNumber: number;
    speedMaster: string;
    prefix: string;
    exportMode: ExportMode;
};

export type ConversionArtifacts = {
    outputBaseName: string;
    uniqueCues: ConvertedMarker[];
    repeatedSequences: RepeatedSequence[];
    macroXml: string;
    timecodeXml?: string;
};
