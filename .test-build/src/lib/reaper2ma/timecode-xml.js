import { createUniqueCuePlan } from "./cue-plan.js";
import { calculateTimecodeDuration, collectTimecodeTimestamps } from "./timecode-duration.js";
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
function createRegionActionDestination(regionId, kind) {
    return kind === "ON"
        ? `ShowData.DataPools.Default.Sequences.${regionId}.Cue 1`
        : `ShowData.DataPools.Default.Sequences.${regionId}`;
}
function createRegionActionExecToken(kind) {
    return kind === "ON" ? "Goto|Go+" : "Off";
}
function createEventsForMarker(marker, target, destination, isFirstEvent, primaryToken) {
    const events = [
        {
            "@_Name": marker.execToken,
            "@_Time": marker.timestamp,
            RealtimeCmd: createRealtimeExecutionCommand(primaryToken, target, destination, isFirstEvent),
        },
    ];
    const regionActions = [...(marker.regionActions ?? [])].sort((left, right) => (left.kind === right.kind ? 0 : left.kind === "OFF" ? -1 : 1));
    for (const action of regionActions) {
        events.push({
            "@_Name": `${action.kind}_${action.regionId}`,
            "@_Time": marker.timestamp,
            RealtimeCmd: createRealtimeExecutionCommand(createRegionActionExecToken(action.kind), `ShowData.DataPools.Default.Sequences.${action.regionId}`, createRegionActionDestination(action.regionId, action.kind), false),
        });
    }
    return events;
}
function createEventsForUniqueCues(sequenceNumber, uniqueCues) {
    const cuePlan = createUniqueCuePlan(uniqueCues);
    return cuePlan.flatMap((item, index) => createEventsForMarker({
        timestamp: item.start,
        execToken: item.execToken,
        regionActions: item.regionActions,
    }, `ShowData.DataPools.Default.Sequences.Sequence ${sequenceNumber}`, createSequenceCueDestination(`Sequence ${sequenceNumber}`, item.cueName), index === 0, item.execToken));
}
function createEventsForRepeatedSequence(sequenceName, events) {
    return events.flatMap((event, index) => createEventsForMarker({
        timestamp: event.timestamp,
        execToken: event.execToken,
        regionActions: event.regionActions,
    }, `ShowData.DataPools.Default.Sequences.${sequenceName}`, createSequenceCueDestination(sequenceName, event.cueName), index === 0, event.execToken));
}
function createEventsForRegionSequence(sequenceName, events) {
    return events.flatMap((event, index) => createEventsForMarker({
        timestamp: event.timestamp,
        execToken: event.execToken,
        regionActions: event.regionActions,
    }, `ShowData.DataPools.Default.Sequences.${sequenceName}`, createSequenceCueDestination(sequenceName, event.cueName), index === 0, event.execToken));
}
function createEventsForBumpSequence(sequenceName, events) {
    return events.flatMap((event, index) => createEventsForMarker({
        timestamp: event.timestamp,
        execToken: event.execToken,
        regionActions: event.regionActions,
    }, `ShowData.DataPools.Default.Sequences.${sequenceName}`, createSequenceCueDestination(sequenceName, event.cueName), index === 0, event.execToken));
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
function createRegionSequenceTrack(sequenceName, events) {
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
                CmdEvent: createEventsForRegionSequence(sequenceName, events),
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
export function generateTimecodeXML(settings, uniqueCues, regionSequences, repeatedSequences, bumpSequences, bpmSequence, filename) {
    const duration = calculateTimecodeDuration(collectTimecodeTimestamps(uniqueCues, regionSequences, repeatedSequences, bumpSequences, bpmSequence));
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
    ];
    if (regionSequences.length > 0) {
        trackGroups.push({
            "@_Play": "",
            "@_Rec": "",
            MarkerTrack: {
                "@_Name": "Region",
                "@_Guid": "00 00 00 00 B1 F5 25 5F 70 04 00 00 28 74 D0 4C",
            },
            Track: regionSequences.map((sequence) => createRegionSequenceTrack(sequence.displayName, sequence.events)),
        });
    }
    if (repeatedSequences.length > 0) {
        trackGroups.push({
            "@_Play": "",
            "@_Rec": "",
            MarkerTrack: {
                "@_Name": "Repeated",
                "@_Guid": generateGuid(),
            },
            Track: repeatedSequences.map((sequence) => createColorSequenceTrack(sequence.displayName, sequence.events)),
        });
    }
    if (bumpSequences.length > 0) {
        trackGroups.push({
            "@_Play": "",
            "@_Rec": "",
            MarkerTrack: {
                "@_Name": "Bump",
                "@_Guid": generateGuid(),
            },
            Track: bumpSequences.map((sequence) => createBumpSequenceTrack(sequence.displayName, sequence.events)),
        });
    }
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