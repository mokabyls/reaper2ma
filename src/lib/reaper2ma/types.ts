export type ExportMode = "cues-and-timecode" | "cues-only";

export type ReaperMarkerRow = {
    "#": string;
    Name: string;
    Start: string;
    Color: string;
};

export type ConvertedMarker = {
    name: string;
    start: string;
    color: string;
};

export type RepeatedSequence = {
    color: string;
    name: string;
    timestamps: string[];
    sequenceNumber: number;
};

export type ConversionSettings = {
    sequenceNumber: number;
    driveNumber: number;
    cueStartNumber: number;
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
