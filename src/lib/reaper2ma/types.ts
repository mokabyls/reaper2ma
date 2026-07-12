export type ExportMode = "cues-and-timecode" | "cues-only";
export type ImportMode = "markers-only" | "regions-and-markers";

export type ReaperMarkerRow = {
    "#": string;
    Name: string;
    Start: string;
    End?: string;
    Length?: string;
    Color: string;
};

export type ReaperRegionRow = ReaperMarkerRow & {
    End: string;
    Length: string;
};

export type MarkerTag = {
    key: string;
    value: string | null;
};

export type RegionActionTag = {
    kind: "ON" | "OFF";
    regionId: string;
};

export type BumpActionTag = {
    kind: "Temp" | "Flash";
    phase: "start" | "release";
    releaseDelayMs?: number;
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

export type AppearanceReference = {
    appearanceName: string;
    appearanceNumber: number;
    appearanceColor: string;
};

export type ConvertedMarker = {
    displayName: string;
    execToken: string;
    tags: MarkerTag[];
    isGlobal?: boolean;
    bumpAction?: BumpActionTag;
    regionActions?: RegionActionTag[];
    regionLayerName?: string;
    start: string;
    color: string;
    regionTargetId?: string;
    regionId?: string;
    regionLabel?: string;
    bpm?: number;
    bpmText?: string;
    cueFade?: string;
    cueTiming?: CueTimingTag[];
};

export type SequenceCue = {
    cueNumber: number;
    name: string;
    appearanceName?: string;
    appearanceNumber?: number;
    appearanceColor?: string;
    commands?: string[];
    cueFade?: string;
    cueTiming?: CueTimingTag[];
};

export type SequenceTrigger = {
    timestamp: string;
    execToken: string;
    cueNumber: number;
    cueName: string;
    regionActions?: RegionActionTag[];
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
    appearanceColor: string;
    sequenceNumber: number;
};

export type RegionSequence = {
    regionId: string;
    displayName: string;
    regionLabel: string;
    start: string;
    end: string;
    color: string;
    cues: SequenceCue[];
    events: SequenceTrigger[];
    appearanceName?: string;
    appearanceNumber?: number;
    appearanceColor?: string;
    sequenceNumber: number;
};

export type RegionLayerSequence = {
    regionId: string;
    regionLabel: string;
    layerName: string;
    displayName: string;
    start: string;
    end: string;
    color: string;
    cues: SequenceCue[];
    events: SequenceTrigger[];
    sequenceNumber: number;
};

export type BumpSequence = {
    color: string;
    displayName: string;
    cues: SequenceCue[];
    events: SequenceTrigger[];
    releaseDurationSeconds: string;
    releaseWarnings?: string[];
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
    releaseDurationSeconds: string;
    sequenceNumber: number;
};

export type ConversionSettings = {
    importMode?: ImportMode;
    sequenceNumber: number;
    appearanceStartNumber: number;
    sequenceNamePrefix: string;
    timecodeNumber: number;
    pageNumber: number;
    pageSlotStart: number;
    bumpPageSlotStart: number;
    cueStartNumber: number;
    regionEndPreRollMs: number;
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
    importMode: ImportMode;
    outputBaseName: string;
    validationWarnings: string[];
    regionSequences: RegionSequence[];
    regionLayerSequences: RegionLayerSequence[];
    uniqueCues: ConvertedMarker[];
    repeatedSequences: RepeatedSequence[];
    bumpSequences: BumpSequence[];
    bpmSequence?: BpmSequence;
    macroXml: string;
};
