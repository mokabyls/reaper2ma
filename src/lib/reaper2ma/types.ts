export type ExportMode = "cues-and-timecode" | "cues-only";

export type ReaperMarkerRow = {
    "#": string;
    Name: string;
    Start: string;
    Color: string;
};

export type MarkerTag = {
    key: string;
    value: string | null;
};

export type ConvertedMarker = {
    displayName: string;
    execToken: string;
    tags: MarkerTag[];
    start: string;
    color: string;
    bpm?: number;
    bpmText?: string;
};

export type RepeatedSequenceEvent = {
    timestamp: string;
    execToken: string;
};

export type RepeatedSequence = {
    color: string;
    displayName: string;
    events: RepeatedSequenceEvent[];
    appearanceName: string;
    appearanceNumber: number;
    sequenceNumber: number;
};

export type BpmSequenceEvent = {
    displayName: string;
    timestamp: string;
    bpm: number;
    bpmText: string;
};

export type BpmSequence = {
    displayName: string;
    events: BpmSequenceEvent[];
    sequenceNumber: number;
};

export type ConversionSettings = {
    sequenceNumber: number;
    appearanceStartNumber: number;
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
    bpmSequence?: BpmSequence;
    macroXml: string;
    timecodeXml?: string;
};
