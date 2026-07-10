import { createUniqueCuePlan } from "./cue-plan.js";
import { XML_HEADER, xmlBuilder, generateGuid } from "./xml-common.js";
const markerTrackGuid = "00 00 00 00 B1 F5 25 5F 70 04 00 00 28 74 D0 4B";
const mainTrackGuid = "00 00 00 00 B7 10 04 13 3B 0B 00 00 38 E1 4F AA";
const mainTimeRangeGuid = "00 00 00 00 21 68 E5 6F 3C 0B 00 00 38 E1 4F AA";
const timecodeGuid = "00 00 00 00 3F 76 B7 04 32 0B 00 00 68 A1 4F AA";
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
export function generateTimecodeXML(settings, uniqueCues, repeatedSequences, bumpSequences, bpmSequence, filename) {
    const duration = createTimecodeDuration(uniqueCues, repeatedSequences, bumpSequences, bpmSequence);
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
                        CmdEvent: createEventsForUniqueCues(settings.sequenceNumber, createUniqueCuePlan(uniqueCues)),
                    },
                },
            },
        },
        {
            "@_Play": "",
            "@_Rec": "",
            MarkerTrack: {
                "@_Name": "Bump",
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
    return xmlBuilder.build(obj);
}
//# sourceMappingURL=timecode-xml.js.map