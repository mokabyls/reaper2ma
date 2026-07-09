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
    cueFade?: string;
};

export type SequenceCue = {
    cueNumber: number;
    name: string;
    cueFade?: string;
};

export type SequenceTrigger = {
    timestamp: string;
    execToken: string;
    cueNumber: number;
    cueName: string;
    cueFade?: string;
};

export type RepeatedSequence = {
    color: string;
    displayName: string;
    cues: SequenceCue[];
    events: SequenceTrigger[];
    appearanceName: string;
    appearanceNumber: number;
    sequenceNumber: number;
};

export type BumpSequence = {
    color: string;
    displayName: string;
    cues: SequenceCue[];
    events: SequenceTrigger[];
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
    bumpSequences: BumpSequence[];
    bpmSequence?: BpmSequence;
    macroXml: string;
    timecodeXml?: string;
};
