import { XMLBuilder } from "fast-xml-parser";

import type { ConversionSettings, ConvertedMarker, RepeatedSequence } from "./types.js";

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

function createRealtimeGotoCommand(
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
        "@_ExecToken": "Goto",
        "@_ValCueDestination": destination,
    };
}

function createGotoEventsForCueSequence(sequenceNumber: number, uniqueCues: ConvertedMarker[]) {
    return uniqueCues.map((item, index) => ({
        "@_Name": "Goto",
        "@_Time": item.start,
        RealtimeCmd: createRealtimeGotoCommand(
            `ShowData.DataPools.Default.Sequences.Sequence ${sequenceNumber}`,
            `ShowData.DataPools.Default.Sequences.Sequence ${sequenceNumber}.${item.name}`,
            index === 0,
        ),
    }));
}

function createGotoEventsForRepeatedSequence(sequenceName: string, timestamps: string[]) {
    return timestamps.map((timestamp, index) => ({
        "@_Name": "Goto",
        "@_Time": timestamp,
        RealtimeCmd: createRealtimeGotoCommand(
            `ShowData.DataPools.Default.Sequences.${sequenceName}`,
            `ShowData.DataPools.Default.Sequences.${sequenceName}.Cue 1`,
            index === 0,
        ),
    }));
}

function createRepeatedSequenceTrack(sequenceName: string, timestamps: string[]) {
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
                CmdEvent: createGotoEventsForRepeatedSequence(sequenceName, timestamps),
            },
        },
    };
}

export function generateMacroXML(settings: ConversionSettings, uniqueCues: ConvertedMarker[], repeatedSequences: RepeatedSequence[], filename: string): string {
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
                    ...uniqueCues.map((item, index) => ({
                        "@_Command": `Label Sequence ${settings.sequenceNumber} Cue ${index + settings.cueStartNumber} "${item.name}"`,
                        "@_Wait": "0.10",
                    })),
                    ...repeatedSequences.flatMap((sequence) => [
                        {
                            "@_Command": `Store Sequence ${sequence.sequenceNumber} "${sequence.name}"`,
                            "@_Wait": "0.10",
                        },
                        {
                            "@_Command": `Store Cue 1 Sequence ${sequence.sequenceNumber} /Merge`,
                            "@_Wait": "0.10",
                        },
                        {
                            "@_Command": `Set Sequence ${sequence.sequenceNumber} Cue "OffCue" Property "TRIGTYPE" "Follow"`,
                            "@_Wait": "0.10",
                        },
                    ]),
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
    filename: string,
): string {
    const duration = uniqueCues.length > 0 ? (Number.parseFloat(uniqueCues[uniqueCues.length - 1].start) + 1).toFixed(3) : "0.00";

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
                TrackGroup: [
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
                                    CmdEvent: createGotoEventsForCueSequence(settings.sequenceNumber, uniqueCues),
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
                        Track: repeatedSequences.map((sequence) => createRepeatedSequenceTrack(sequence.name, sequence.timestamps)),
                    },
                ],
            },
        },
    };

    return builder.build(obj);
}
