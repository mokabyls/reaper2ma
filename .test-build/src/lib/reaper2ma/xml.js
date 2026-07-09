import { XMLBuilder } from "fast-xml-parser";
import { convertReaperColorToGrandmaAppearanceColor } from "./colors.js";
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
function generateGuid() {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
        .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
        .join(" ");
}
function createRealtimeExecutionCommand(execToken, target, destination, isFirstEvent) {
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
function createTimecodeDestination(sequenceName, cueNumber, useCuePart) {
    return useCuePart ? `${sequenceName}.Cue ${cueNumber}.Part 1` : `${sequenceName}.Cue ${cueNumber}`;
}
function createSequenceCueDestination(sequenceName, cueName) {
    return `ShowData.DataPools.Default.Sequences.${sequenceName}.${cueName}`;
}
function createUniqueCuePlan(uniqueCues) {
    const seenNames = new Map();
    return uniqueCues.map((marker) => {
        const nextIndex = (seenNames.get(marker.displayName) ?? 0) + 1;
        seenNames.set(marker.displayName, nextIndex);
        return {
            ...marker,
            cueName: nextIndex === 1 ? marker.displayName : `${marker.displayName} ${nextIndex}`,
        };
    });
}
function createEventsForUniqueCues(sequenceNumber, uniqueCues) {
    const cuePlan = createUniqueCuePlan(uniqueCues);
    return cuePlan.map((item, index) => ({
        "@_Name": item.execToken,
        "@_Time": item.start,
        RealtimeCmd: createRealtimeExecutionCommand(item.execToken, `ShowData.DataPools.Default.Sequences.Sequence ${sequenceNumber}`, createSequenceCueDestination(`Sequence ${sequenceNumber}`, item.cueName), index === 0),
    }));
}
function createEventsForRepeatedSequence(sequenceName, events) {
    return events.map((event, index) => ({
        "@_Name": event.execToken,
        "@_Time": event.timestamp,
        RealtimeCmd: createRealtimeExecutionCommand(event.execToken, `ShowData.DataPools.Default.Sequences.${sequenceName}`, createSequenceCueDestination(sequenceName, event.cueName), index === 0),
    }));
}
function createEventsForBumpSequence(sequenceName, events) {
    return events.map((event, index) => ({
        "@_Name": event.execToken,
        "@_Time": event.timestamp,
        RealtimeCmd: createRealtimeExecutionCommand(event.execToken, `ShowData.DataPools.Default.Sequences.${sequenceName}`, createSequenceCueDestination(sequenceName, event.cueName), index === 0),
    }));
}
function createEventsForBpmSequence(sequenceNumber, bpmSequence) {
    return bpmSequence.events.map((event, index) => ({
        "@_Name": event.displayName,
        "@_Time": event.timestamp,
        RealtimeCmd: createRealtimeExecutionCommand("Goto", `ShowData.DataPools.Default.Sequences.Sequence ${sequenceNumber}`, createTimecodeDestination(`ShowData.DataPools.Default.Sequences.Sequence ${sequenceNumber}`, index + 1, true), index === 0),
    }));
}
function createColorSequenceTrack(sequenceName, events) {
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
function createBumpSequenceTrack(sequenceName, events) {
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
                CmdEvent: createEventsForBumpSequence(sequenceName, events),
            },
        },
    };
}
function createBpmSequenceTrack(sequenceNumber, bpmSequence) {
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
function createSpeedMasterCommand(sequenceNumber, speedMaster) {
    return {
        "@_Command": `Set Sequence ${sequenceNumber} Property "SpeedMaster" #[Master ${speedMaster}]`,
        "@_Wait": "0.10",
    };
}
function createAppearanceCommands(sequence) {
    const appearanceColor = convertReaperColorToGrandmaAppearanceColor(sequence.color);
    if (!appearanceColor) {
        return [];
    }
    return [
        {
            "@_Command": `Store Appearance ${sequence.appearanceNumber}`,
            "@_Wait": "0.10",
        },
        {
            "@_Command": `Label Appearance ${sequence.appearanceNumber} "${sequence.appearanceName}"`,
            "@_Wait": "0.10",
        },
        {
            "@_Command": `Set Appearance ${sequence.appearanceNumber} "Color" "${appearanceColor}"`,
            "@_Wait": "0.10",
        },
        {
            "@_Command": `Assign Appearance "${sequence.appearanceName}" at Sequence ${sequence.sequenceNumber}`,
            "@_Wait": "0.10",
        },
    ];
}
function createCueLabelCommands(sequenceNumber, cues) {
    return cues.map((cue) => ({
        "@_Command": `Label Sequence ${sequenceNumber} Cue ${cue.cueNumber} "${cue.name}"`,
        "@_Wait": "0.10",
    }));
}
function createCueFadeCommands(sequenceNumber, cues) {
    return cues.flatMap((cue) => cue.cueFade
        ? [
            {
                "@_Command": `Set Sequence ${sequenceNumber} Cue "${"name" in cue ? cue.name : cue.cueName}" CueFade ${cue.cueFade}`,
                "@_Wait": "0.10",
            },
        ]
        : []);
}
function createColorSequenceMacroLines(sequence, speedMaster) {
    return [
        {
            "@_Command": `Store Sequence ${sequence.sequenceNumber} "${sequence.displayName}"`,
            "@_Wait": "0.10",
        },
        createSpeedMasterCommand(sequence.sequenceNumber, speedMaster),
        ...createAppearanceCommands(sequence),
        {
            "@_Command": `Store Sequence ${sequence.sequenceNumber} Cue 1 Thru ${sequence.cues.length}`,
            "@_Wait": "0.10",
        },
        {
            "@_Command": `Store Sequence ${sequence.sequenceNumber} Cue 1 Thru ${sequence.cues.length} Part 0.1`,
            "@_Wait": "0.10",
        },
        ...createCueLabelCommands(sequence.sequenceNumber, sequence.cues),
        ...createCueFadeCommands(sequence.sequenceNumber, sequence.cues),
        {
            "@_Command": `Set Sequence ${sequence.sequenceNumber} Cue "OffCue" Property "TRIGTYPE" "Follow"`,
            "@_Wait": "0.10",
        },
    ];
}
function createBumpSequenceMacroLines(sequence, speedMaster) {
    return [
        {
            "@_Command": `Store Sequence ${sequence.sequenceNumber} "${sequence.displayName}"`,
            "@_Wait": "0.10",
        },
        createSpeedMasterCommand(sequence.sequenceNumber, speedMaster),
        {
            "@_Command": `Store Sequence ${sequence.sequenceNumber} Cue 1 Thru ${sequence.cues.length}`,
            "@_Wait": "0.10",
        },
        {
            "@_Command": `Store Sequence ${sequence.sequenceNumber} Cue 1 Thru ${sequence.cues.length} Part 0.1`,
            "@_Wait": "0.10",
        },
        ...createCueLabelCommands(sequence.sequenceNumber, sequence.cues),
        ...createCueFadeCommands(sequence.sequenceNumber, sequence.cues),
        {
            "@_Command": `Set Sequence ${sequence.sequenceNumber} Cue "OffCue" Property "TRIGTYPE" "Follow"`,
            "@_Wait": "0.10",
        },
    ];
}
function createBpmSequenceMacroLines(bpmSequence, speedMaster) {
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
function collectTimestampValues(collections) {
    return collections.flatMap((collection) => collection
        .map((item) => item.start ?? item.timestamp ?? "")
        .filter((value) => value !== ""));
}
function createTimecodeDuration(uniqueCues, repeatedSequences, bumpSequences, bpmSequence) {
    const timestamps = collectTimestampValues([
        uniqueCues,
        repeatedSequences.flatMap((sequence) => sequence.events),
        bumpSequences.flatMap((sequence) => sequence.events),
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
export function generateMacroXML(settings, uniqueCues, repeatedSequences, bumpSequences, bpmSequence, filename) {
    const uniqueCuePlan = createUniqueCuePlan(uniqueCues);
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
                    ...uniqueCuePlan.map((item, index) => ({
                        "@_Command": `Label Sequence ${settings.sequenceNumber} Cue ${index + settings.cueStartNumber} "${item.cueName}"`,
                        "@_Wait": "0.10",
                    })),
                    ...createCueFadeCommands(settings.sequenceNumber, uniqueCuePlan),
                    ...repeatedSequences.flatMap((sequence) => createColorSequenceMacroLines(sequence, settings.speedMaster)),
                    ...bumpSequences.flatMap((sequence) => createBumpSequenceMacroLines(sequence, settings.speedMaster)),
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
export function generateTimecodeXML(settings, uniqueCues, repeatedSequences, bumpSequences, bpmSequence, filename) {
    const duration = createTimecodeDuration(uniqueCues, repeatedSequences, bumpSequences, bpmSequence);
    const uniqueCuePlan = createUniqueCuePlan(uniqueCues);
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
                        CmdEvent: createEventsForUniqueCues(settings.sequenceNumber, uniqueCuePlan),
                    },
                },
            },
        },
        {
            "@_Play": "",
            "@_Rec": "",
            MarkerTrack: {
                "@_Name": "Color",
                "@_Guid": "00 00 00 00 B1 F5 25 5F 70 04 00 00 28 74 D0 4C",
            },
            Track: repeatedSequences.map((sequence) => createColorSequenceTrack(sequence.displayName, sequence.events)),
        },
        {
            "@_Play": "",
            "@_Rec": "",
            MarkerTrack: {
                "@_Name": "Bump",
                "@_Guid": generateGuid(),
            },
            Track: bumpSequences.map((sequence) => createBumpSequenceTrack(sequence.displayName, sequence.events)),
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
//# sourceMappingURL=xml.js.map