import { XMLBuilder } from "fast-xml-parser";

import type { BpmSequence, ConversionSettings, ConvertedMarker, RepeatedSequence } from "./types.js";

const XML_HEADER = {
    "?xml": {
        "@_version": "1.0",
        "@_encoding": "UTF-8",
    },
};

const builder = new XMLBuilder({
    attributeNamePrefix: "@_",
    ignoreAttributes: false,
    format: true,
    suppressEmptyNode: true,
    indentBy: "    ",
});

const macroGuid = "00 00 00 00 A8 F8 B9 20 78 06 00 00 A5 46 09 AA";
const timecodeGuid = "00 00 00 00 3F 76 B7 04 32 0B 00 00 68 A1 4F AA";
const markerTrackGuid = "00 00 00 00 B1 F5 25 5F 70 04 00 00 28 74 D0 4B";
const mainTrackGuid = "00 00 00 00 B7 10 04 13 3B 0B 00 00 38 E1 4F AA";
const mainTimeRangeGuid = "00 00 00 00 21 68 E5 6F 3C 0B 00 00 38 E1 4F AA";

function generateGuid(): string {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
        .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
        .join(" ");
}

function createRealtimeExecutionCommand(
    execToken: string,
    target: string,
    destination: string,
    isFirstEvent: boolean,
): Record<string, string> {
    return {
        "@_Type": "Key",
        "@_Source": "Original",
        "@_UserProfile": "0",
        "@_Status": "On",
        "@_IsRealtime": "1",
        "@_IsXFade": "0",
        "@_IgnoreFollow": "0",
        "@_IgnoreCommand": "0",
        "@_Assert": "0",
        "@_IgnoreNetwork": "0",
        "@_FromTriggerNode": "0",
        "@_IgnoreExecTime": "0",
        "@_IssuedByTimecode": "0",
        "@_FromLocalHardwareFader": "1",
        ...(isFirstEvent ? { "@_Object": target } : {}),
        "@_ExecToken": execToken,
        "@_ValCueDestination": destination,
    };
}

function createTimecodeDestination(sequenceName: string, cueNumber: number, useCuePart: boolean): string {
    return useCuePart ? `${sequenceName}.Cue ${cueNumber}.Part 1` : `${sequenceName}.Cue ${cueNumber}`;
}

function createEventsForCueSequence(sequenceNumber: number, uniqueCues: ConvertedMarker[]) {
    return uniqueCues.map((item, index) => ({
        "@_Name": item.execToken,
        "@_Time": item.start,
        RealtimeCmd: createRealtimeExecutionCommand(
            item.execToken,
            `ShowData.DataPools.Default.Sequences.Sequence ${sequenceNumber}`,
            `ShowData.DataPools.Default.Sequences.Sequence ${sequenceNumber}.${item.displayName}`,
            index === 0,
        ),
    }));
}

function createEventsForBpmSequence(sequenceNumber: number, bpmSequence: BpmSequence) {
    return bpmSequence.events.map((event, index) => ({
        "@_Name": event.displayName,
        "@_Time": event.timestamp,
        RealtimeCmd: createRealtimeExecutionCommand(
            "Goto",
            `ShowData.DataPools.Default.Sequences.Sequence ${sequenceNumber}`,
            createTimecodeDestination(`ShowData.DataPools.Default.Sequences.Sequence ${sequenceNumber}`, index + 1, true),
            index === 0,
        ),
    }));
}

function createEventsForRepeatedSequence(sequenceName: string, events: RepeatedSequence["events"]) {
    return events.map((event, index) => ({
        "@_Name": event.execToken,
        "@_Time": event.timestamp,
        RealtimeCmd: createRealtimeExecutionCommand(
            event.execToken,
            `ShowData.DataPools.Default.Sequences.${sequenceName}`,
            `ShowData.DataPools.Default.Sequences.${sequenceName}.Cue 1`,
            index === 0,
        ),
    }));
}

function createRepeatedSequenceTrack(sequenceName: string, events: RepeatedSequence["events"]) {
    return {
        "@_Guid": generateGuid(),
        "@_Target": `ShowData.DataPools.Default.Sequences.${sequenceName}`,
        "@_Play": "",
        "@_Rec": "",
        TimeRange: {
            "@_Guid": generateGuid(),
            "@_Play": "",
            "@_Rec": "",
            CmdSubTrack: {
                CmdEvent: createEventsForRepeatedSequence(sequenceName, events),
            },
        },
    };
}

function createBpmSequenceTrack(sequenceNumber: number, bpmSequence: BpmSequence) {
    return {
        "@_Guid": generateGuid(),
        "@_Target": `ShowData.DataPools.Default.Sequences.Sequence ${sequenceNumber}`,
        "@_Play": "",
        "@_Rec": "",
        TimeRange: {
            "@_Guid": generateGuid(),
            "@_Play": "",
            "@_Rec": "",
            CmdSubTrack: {
                CmdEvent: createEventsForBpmSequence(sequenceNumber, bpmSequence),
            },
        },
    };
}

function createSpeedMasterCommand(sequenceNumber: number, speedMaster: string): Record<string, string> {
    return {
        "@_Command": `Set Sequence ${sequenceNumber} Property "SpeedMaster" #[Master ${speedMaster}]`,
        "@_Wait": "0.10",
    };
}

function createBpmSequenceMacroLines(bpmSequence: BpmSequence, speedMaster: string) {
    return [
        {
            "@_Command": `Store Sequence ${bpmSequence.sequenceNumber} "${bpmSequence.displayName}"`,
            "@_Wait": "0.10",
        },
        createSpeedMasterCommand(bpmSequence.sequenceNumber, speedMaster),
        {
            "@_Command": `Store Sequence ${bpmSequence.sequenceNumber} Cue 1 thru ${bpmSequence.events.length}`,
            "@_Wait": "0.10",
        },
        ...bpmSequence.events.flatMap((event, index) => [
            {
                "@_Command": `Label Sequence ${bpmSequence.sequenceNumber} Cue ${index + 1} "${event.displayName}"`,
                "@_Wait": "0.10",
            },
            {
                "@_Command": `Set Sequence ${bpmSequence.sequenceNumber} Cue ${index + 1} CuePart 1 Property "CMD" "Master ${speedMaster} At BPM ${event.bpmText}"`,
                "@_Wait": "0.10",
            },
        ]),
    ];
}

function collectTimestampValues(collections: Array<Array<{ start?: string; timestamp?: string }>>): string[] {
    return collections.flatMap((collection) =>
        collection
            .map((item) => item.start ?? item.timestamp ?? "")
            .filter((value) => value !== ""),
    );
}

function createTimecodeDuration(uniqueCues: ConvertedMarker[], repeatedSequences: RepeatedSequence[], bpmSequence?: BpmSequence): string {
    const timestamps = collectTimestampValues([
        uniqueCues,
        repeatedSequences.flatMap((sequence) => sequence.events),
        bpmSequence?.events ?? [],
    ]);

    if (timestamps.length === 0) {
        return "0.00";
    }

    const maxTimestamp = timestamps.reduce((max, value) => {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
    }, 0);

    return (maxTimestamp + 1).toFixed(3);
}

export function generateMacroXML(
    settings: ConversionSettings,
    uniqueCues: ConvertedMarker[],
    repeatedSequences: RepeatedSequence[],
    bpmSequence: BpmSequence | undefined,
    filename: string,
): string {
    const obj = {
        ...XML_HEADER,
        GMA3: {
            "@_DataVersion": "1.4.0.2",
            Macro: {
                "@_Name": `Macro ${filename}`,
                "@_Guid": macroGuid,
                MacroLine: [
                    {
                        "@_Command": `Store Sequence ${settings.sequenceNumber} Cue ${settings.cueStartNumber} thru ${uniqueCues.length + settings.cueStartNumber - 1}`,
                        "@_Wait": "0.10",
                    },
                    createSpeedMasterCommand(settings.sequenceNumber, settings.speedMaster),
                    ...uniqueCues.map((item, index) => ({
                        "@_Command": `Label Sequence ${settings.sequenceNumber} Cue ${index + settings.cueStartNumber} "${item.displayName}"`,
                        "@_Wait": "0.10",
                    })),
                    ...repeatedSequences.flatMap((sequence) => [
                        {
                            "@_Command": `Store Sequence ${sequence.sequenceNumber} "${sequence.displayName}"`,
                            "@_Wait": "0.10",
                        },
                        createSpeedMasterCommand(sequence.sequenceNumber, settings.speedMaster),
                        {
                            "@_Command": `Store Cue 1 Sequence ${sequence.sequenceNumber} /Merge`,
                            "@_Wait": "0.10",
                        },
                        {
                            "@_Command": `Set Sequence ${sequence.sequenceNumber} Cue "OffCue" Property "TRIGTYPE" "Follow"`,
                            "@_Wait": "0.10",
                        },
                    ]),
                    ...(bpmSequence ? createBpmSequenceMacroLines(bpmSequence, settings.speedMaster) : []),
                    ...(settings.exportMode === "cues-and-timecode"
                        ? [
                              {
                                  "@_Command": `Drive ${settings.driveNumber}`,
                                  "@_Wait": "0.10",
                              },
                              {
                                  "@_Command": `import Timecode "${filename}_timecode"`,
                                  "@_Wait": "0.10",
                              },
                          ]
                        : []),
                ],
            },
        },
    };

    return builder.build(obj);
}

export function generateTimecodeXML(
    settings: ConversionSettings,
    uniqueCues: ConvertedMarker[],
    repeatedSequences: RepeatedSequence[],
    bpmSequence: BpmSequence | undefined,
    filename: string,
): string {
    const duration = createTimecodeDuration(uniqueCues, repeatedSequences, bpmSequence);

    const trackGroups = [
        {
            "@_Play": "",
            "@_Rec": "",
            MarkerTrack: {
                "@_Name": "Marker",
                "@_Guid": markerTrackGuid,
            },
            Track: {
                "@_Guid": mainTrackGuid,
                "@_Target": `ShowData.DataPools.Default.Sequences.Sequence ${settings.sequenceNumber}`,
                "@_Play": "",
                "@_Rec": "",
                TimeRange: {
                    "@_Guid": mainTimeRangeGuid,
                    "@_Play": "",
                    "@_Rec": "",
                    CmdSubTrack: {
                        CmdEvent: createEventsForCueSequence(settings.sequenceNumber, uniqueCues),
                    },
                },
            },
        },
        {
            "@_Play": "",
            "@_Rec": "",
            MarkerTrack: {
                "@_Name": "Marker",
                "@_Guid": "00 00 00 00 B1 F5 25 5F 70 04 00 00 28 74 D0 4C",
            },
            Track: repeatedSequences.map((sequence) => createRepeatedSequenceTrack(sequence.displayName, sequence.events)),
        },
    ];

    if (bpmSequence) {
        trackGroups.push({
            "@_Play": "",
            "@_Rec": "",
            MarkerTrack: {
                "@_Name": "BPM",
                "@_Guid": generateGuid(),
            },
            Track: createBpmSequenceTrack(bpmSequence.sequenceNumber, bpmSequence),
        });
    }

    const obj = {
        ...XML_HEADER,
        GMA3: {
            "@_DataVersion": "1.4.0.2",
            Timecode: {
                "@_Name": filename,
                "@_Guid": timecodeGuid,
                "@_Cursor": "00.00",
                "@_Duration": duration,
                "@_LoopCount": "0",
                "@_TCSlot": "-1",
                "@_SwitchOff": "Keep Playbacks",
                "@_Timedisplayformat": "<10d11h23m45>",
                "@_FrameReadout": "<Seconds>",
                TrackGroup: trackGroups,
            },
        },
    };

    return builder.build(obj);
}
