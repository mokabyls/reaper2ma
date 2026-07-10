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

export type CueTimingTagKey =
    | "FadeFromX"
    | "FadeFromY"
    | "FadeFromZ"
    | "FadeToX"
    | "FadeToY"
    | "FadeToZ"
    | "DelayFromX"
    | "DelayFromY"
    | "DelayFromZ"
    | "DelayToX"
    | "DelayToY"
    | "DelayToZ";

export type CueTimingTag = {
    key: CueTimingTagKey;
    value: string;
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
    cueTiming?: CueTimingTag[];
};

export type SequenceCue = {
    cueNumber: number;
    name: string;
    cueFade?: string;
    cueTiming?: CueTimingTag[];
};

export type SequenceTrigger = {
    timestamp: string;
    execToken: string;
    cueNumber: number;
    cueName: string;
    cueFade?: string;
    cueTiming?: CueTimingTag[];
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

export type ExampleMacroPresetGroupId = "show-time" | "timecode-control";

export type ExampleMacroPresetId =
    | "show-time-manuel"
    | "show-time-auto-restore"
    | "timecode-switch-int"
    | "timecode-switch-ltc"
    | "timecode-rewind-and-switch-int"
    | "timecode-rewind-tc-and-switch-ltc";

export type ExampleMacroPresetSelection = {
    showTime: boolean;
    timecodeControl: boolean;
};

export type ExampleMacroPresetContext = {
    timecodeName: string;
};

export type ExampleMacroPresetDefinition = {
    id: ExampleMacroPresetId;
    groupId: ExampleMacroPresetGroupId;
    label: string;
    xmlName: string;
    fileBaseName: string;
    lines: Array<string | ((context: ExampleMacroPresetContext) => string)>;
};

export type ExampleMacroPresetGroup = {
    id: ExampleMacroPresetGroupId;
    label: string;
    description: string;
    presets: ExampleMacroPresetDefinition[];
};

export type ExampleMacroPresetOutputFile = {
    name: string;
    content: string;
    presetId: ExampleMacroPresetId;
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
