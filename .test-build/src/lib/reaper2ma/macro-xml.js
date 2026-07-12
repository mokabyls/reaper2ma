import { createUniqueCuePlan } from "./cue-plan.js";
import { calculateTimecodeDuration, collectTimecodeTimestamps } from "./timecode-duration.js";
import { XML_HEADER, xmlBuilder } from "./xml-common.js";
import { applySequenceNamePrefix } from "./sequence-services.js";
const DEFAULT_WAIT = "0.10";
function createCommand(command, wait = DEFAULT_WAIT) {
    return {
        "@_Command": command,
        "@_Wait": wait,
    };
}
function quoteCommandValue(value) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function createTempDataPoolName(filename) {
    return `R2MA ${filename || "export"}`;
}
function createSpeedMasterCommand(tempDataPoolName, sequence, speedMaster) {
    return createCommand(`Set DataPool ${quoteCommandValue(tempDataPoolName)} Sequence ${sequence.localSequenceNumber} Property "SpeedMaster" #[Master ${speedMaster}]`);
}
function createCueLabelCommands(tempDataPoolName, sequence) {
    return sequence.cues.map((cue) => createCommand(`Label DataPool ${quoteCommandValue(tempDataPoolName)} Sequence ${sequence.localSequenceNumber} Cue ${cue.cueNumber} ${quoteCommandValue(cue.name)}`));
}
function createSequenceLabelCommand(tempDataPoolName, sequence) {
    return createCommand(`Label DataPool ${quoteCommandValue(tempDataPoolName)} Sequence ${sequence.localSequenceNumber} ${quoteCommandValue(sequence.displayName)}`);
}
function createSequenceAppearanceAssignmentCommands(tempDataPoolName, sequence) {
    if (!sequence.appearanceName) {
        return [];
    }
    return [
        createCommand(`Set DataPool ${quoteCommandValue(tempDataPoolName)} Sequence ${sequence.localSequenceNumber} APPEARANCE=${quoteCommandValue(sequence.appearanceName)}`),
    ];
}
function createCueAppearanceAssignmentCommands(tempDataPoolName, sequence) {
    return sequence.cues.flatMap((cue) => cue.appearanceName
        ? [
            createCommand(`Set DataPool ${quoteCommandValue(tempDataPoolName)} Sequence ${sequence.localSequenceNumber} Cue ${cue.cueNumber} APPEARANCE=${quoteCommandValue(cue.appearanceName)}`),
        ]
        : []);
}
function createCueFadeCommands(tempDataPoolName, sequence) {
    return sequence.cues.flatMap((cue) => cue.cueFade
        ? [
            createCommand(`Set DataPool ${quoteCommandValue(tempDataPoolName)} Sequence ${sequence.localSequenceNumber} Cue ${cue.cueNumber} CueFade ${cue.cueFade}`),
        ]
        : []);
}
function createCueTimingCommands(tempDataPoolName, sequence) {
    return sequence.cues.flatMap((cue) => {
        if (!cue.cueTiming || cue.cueTiming.length === 0) {
            return [];
        }
        const modifiers = formatCueTimingModifiers(cue.cueTiming);
        return [
            createCommand(`Set DataPool ${quoteCommandValue(tempDataPoolName)} Sequence ${sequence.localSequenceNumber} Cue ${cue.cueNumber} Part 0.1 ${modifiers}`),
        ];
    });
}
function createCueCommandCommands(tempDataPoolName, sequence) {
    return sequence.cues.flatMap((cue) => (cue.commands ?? []).map((command) => createCommand(`Set DataPool ${quoteCommandValue(tempDataPoolName)} Sequence ${sequence.localSequenceNumber} Cue ${cue.cueNumber} Property "Command" ${quoteCommandValue(command)}`)));
}
function formatCueTimingModifiers(cueTiming) {
    return cueTiming.map((tag) => `${tag.key} ${quoteCommandValue(tag.value)}`).join(" ");
}
function createSequenceSetupCommands(tempDataPoolName, settings, sequence) {
    const firstCueNumber = sequence.cues[0]?.cueNumber;
    const lastCueNumber = sequence.cues[sequence.cues.length - 1]?.cueNumber;
    const cueRange = createCueRange(firstCueNumber, lastCueNumber);
    if (cueRange === undefined) {
        return [];
    }
    return [
        createCommand(`Store DataPool ${quoteCommandValue(tempDataPoolName)} Sequence ${sequence.localSequenceNumber} ${quoteCommandValue(sequence.displayName)}`),
        createSequenceLabelCommand(tempDataPoolName, sequence),
        createCommand(`Store DataPool ${quoteCommandValue(tempDataPoolName)} Sequence ${sequence.localSequenceNumber} ${cueRange} /Merge`),
        createCommand(`Store DataPool ${quoteCommandValue(tempDataPoolName)} Sequence ${sequence.localSequenceNumber} ${cueRange} Part 0.1`),
        createSpeedMasterCommand(tempDataPoolName, sequence, settings.speedMaster),
        ...createSequenceAppearanceAssignmentCommands(tempDataPoolName, sequence),
        ...createCueLabelCommands(tempDataPoolName, sequence),
        ...createCueAppearanceAssignmentCommands(tempDataPoolName, sequence),
        ...createCueFadeCommands(tempDataPoolName, sequence),
        ...createCueTimingCommands(tempDataPoolName, sequence),
        ...createCueCommandCommands(tempDataPoolName, sequence),
        ...(sequence.hasOffCue
            ? [
                createCommand(`Set DataPool ${quoteCommandValue(tempDataPoolName)} Sequence ${sequence.localSequenceNumber} Cue "OffCue" Property "TRIGTYPE" "Follow"`),
            ]
            : []),
    ];
}
function createCueRange(firstCueNumber, lastCueNumber) {
    if (firstCueNumber === undefined || lastCueNumber === undefined) {
        return undefined;
    }
    if (firstCueNumber === lastCueNumber) {
        return `Cue ${firstCueNumber}`;
    }
    return `Cue ${firstCueNumber} Thru ${lastCueNumber}`;
}
function createGeneratedSequences(settings, uniqueCues, regionSequences, repeatedSequences, bumpSequences, bpmSequence) {
    const generatedSequences = [];
    const addSequence = (sequence) => {
        generatedSequences.push({
            localSequenceNumber: generatedSequences.length + 1,
            assignToExecutor: sequence.assignToExecutor ?? true,
            executorSlotGroup: sequence.executorSlotGroup ?? "main",
            ...sequence,
        });
    };
    if (uniqueCues.length > 0) {
        const cuePlan = createUniqueCuePlan(uniqueCues);
        const cues = cuePlan.map((cue, index) => ({
            cueNumber: settings.cueStartNumber + index,
            name: cue.cueName,
            ...(cue.cueFade !== undefined ? { cueFade: cue.cueFade } : {}),
            ...(cue.cueTiming !== undefined ? { cueTiming: cue.cueTiming } : {}),
        }));
        const events = cuePlan.map((cue, index) => ({
            timestamp: cue.start,
            execToken: cue.execToken,
            cueNumber: settings.cueStartNumber + index,
            cueName: cue.cueName,
            ...(cue.regionActions?.length ? { regionActions: cue.regionActions } : {}),
            ...(cue.cueFade !== undefined ? { cueFade: cue.cueFade } : {}),
            ...(cue.cueTiming !== undefined ? { cueTiming: cue.cueTiming } : {}),
        }));
        addSequence({
            finalSequenceNumber: settings.sequenceNumber,
            displayName: applySequenceNamePrefix(`Sequence ${settings.sequenceNumber}`, settings.sequenceNamePrefix),
            cues,
            events,
            hasOffCue: false,
        });
    }
    for (const sequence of regionSequences) {
        addSequence({
            finalSequenceNumber: sequence.sequenceNumber,
            displayName: sequence.displayName,
            cues: sequence.cues,
            events: sequence.events,
            hasOffCue: true,
            ...(sequence.appearanceName ? { appearanceName: sequence.appearanceName } : {}),
            ...(sequence.appearanceNumber !== undefined ? { appearanceNumber: sequence.appearanceNumber } : {}),
            ...(sequence.appearanceColor ? { appearanceColor: sequence.appearanceColor } : {}),
            regionId: sequence.regionId,
        });
    }
    for (const sequence of repeatedSequences) {
        addSequence({
            finalSequenceNumber: sequence.sequenceNumber,
            displayName: sequence.displayName,
            cues: sequence.cues,
            events: sequence.events,
            hasOffCue: true,
            appearanceName: sequence.appearanceName,
            appearanceNumber: sequence.appearanceNumber,
            appearanceColor: sequence.appearanceColor,
        });
    }
    for (const sequence of bumpSequences) {
        addSequence({
            finalSequenceNumber: sequence.sequenceNumber,
            displayName: sequence.displayName,
            cues: sequence.cues,
            events: sequence.events,
            hasOffCue: true,
            executorSlotGroup: "bump",
        });
    }
    if (bpmSequence) {
        addSequence({
            finalSequenceNumber: bpmSequence.sequenceNumber,
            displayName: bpmSequence.displayName,
            cues: bpmSequence.events.map((event, index) => ({
                cueNumber: index + 1,
                name: createBpmCueName(event.bpmText),
                commands: [`Master ${settings.speedMaster} At BPM ${event.bpmText}`],
            })),
            events: bpmSequence.events.flatMap((event, index) => {
                const cueNumber = index + 1;
                const cueName = createBpmCueName(event.bpmText);
                return [
                    {
                        timestamp: event.timestamp,
                        execToken: "Temp",
                        cueNumber,
                        cueName,
                    },
                    {
                        timestamp: offsetTimestampByMilliseconds(event.timestamp, 500),
                        execToken: "TempRelease",
                        cueNumber,
                        cueName,
                    },
                ];
            }),
            hasOffCue: false,
            assignToExecutor: false,
        });
    }
    return generatedSequences;
}
function collectAppearanceSetupCommands(sequences) {
    const appearancesByNumber = new Map();
    for (const sequence of sequences) {
        if (sequence.appearanceNumber !== undefined && sequence.appearanceName && sequence.appearanceColor) {
            appearancesByNumber.set(sequence.appearanceNumber, {
                appearanceName: sequence.appearanceName,
                appearanceColor: sequence.appearanceColor,
            });
        }
        for (const cue of sequence.cues) {
            if (cue.appearanceNumber !== undefined && cue.appearanceName && cue.appearanceColor) {
                appearancesByNumber.set(cue.appearanceNumber, {
                    appearanceName: cue.appearanceName,
                    appearanceColor: cue.appearanceColor,
                });
            }
        }
    }
    return [...appearancesByNumber.entries()].flatMap(([appearanceNumber, appearance]) => [
        createCommand(`Store Appearance ${appearanceNumber}`),
        createCommand(`Label Appearance ${appearanceNumber} ${quoteCommandValue(appearance.appearanceName)}`),
        createCommand(`Set Appearance ${appearanceNumber} ${appearance.appearanceColor}`),
    ]);
}
function createTimecodeCommands(settings, tempDataPoolName, filename, sequences, uniqueCues, regionSequences, repeatedSequences, bumpSequences, bpmSequence) {
    if (settings.exportMode !== "cues-and-timecode" || sequences.length === 0) {
        return [];
    }
    const duration = calculateTimecodeDuration(collectTimecodeTimestamps(uniqueCues, regionSequences, repeatedSequences, bumpSequences, bpmSequence));
    const eventsBySequence = collectTimecodeEventsBySequence(sequences);
    const commands = [
        createCommand("cd root"),
        createCommand(`Store DataPool ${quoteCommandValue(tempDataPoolName)} Timecode 1`),
        createCommand(`cd DataPool ${quoteCommandValue(tempDataPoolName)} Timecode 1`),
        createCommand(`Store 1 ${quoteCommandValue(filename)}`),
        createCommand("cd 1"),
        createCommand("cd root"),
        createCommand(`cd DataPool ${quoteCommandValue(tempDataPoolName)}`),
        createCommand('cd "Timecodes"'),
        createCommand('set 1 OFFSETTCSLOT="0"'),
        createCommand(`set 1 DURATION=${quoteCommandValue(duration)}`),
        createCommand('set 1 IGNOREFOLLOW="1"'),
    ];
    for (const [index, sequence] of sequences.entries()) {
        const trackIndex = index + 1;
        const events = eventsBySequence.get(sequence.localSequenceNumber) ?? [];
        commands.push(createCommand("cd root"), createCommand(`cd DataPool ${quoteCommandValue(tempDataPoolName)} Timecode 1`), createCommand("cd 1"));
        if (trackIndex > 1) {
            commands.push(createCommand(`Store ${trackIndex}`));
        }
        commands.push(createCommand(`Assign DataPool ${quoteCommandValue(tempDataPoolName)} Sequence ${sequence.localSequenceNumber} At ${trackIndex}`), createCommand(`cd ${trackIndex}`), createCommand("cd 1"), createCommand('Store Type "CmdSubTrack" 1'), createCommand("cd 1"), ...events.flatMap((event, eventIndex) => [
            createCommand(`Store ${eventIndex + 1}`),
            createCommand(`Set ${eventIndex + 1} "TIME" ${quoteCommandValue(event.timestamp)}`),
            createCommand(`Set ${eventIndex + 1} "TOKEN" ${quoteCommandValue(event.token)}`),
        ]), createCommand("cd root"), createCommand(`cd DataPool ${quoteCommandValue(tempDataPoolName)}`), ...events.flatMap((event, eventIndex) => event.cueNumber === undefined
            ? []
            : [
                createCommand(`Assign DataPool ${quoteCommandValue(tempDataPoolName)} Sequence ${sequence.localSequenceNumber} Cue ${event.cueNumber} At Timecode 1.1.${trackIndex}.1.1.${eventIndex + 1}`),
            ]));
    }
    return commands;
}
function collectTimecodeEventsBySequence(sequences) {
    const eventsBySequence = new Map(sequences.map((sequence) => [sequence.localSequenceNumber, []]));
    const regionSequencesById = new Map(sequences.filter((sequence) => sequence.regionId).map((sequence) => [sequence.regionId, sequence]));
    let sourceOrder = 0;
    for (const sequence of sequences) {
        const sequenceEvents = eventsBySequence.get(sequence.localSequenceNumber);
        if (!sequenceEvents) {
            continue;
        }
        for (const event of sequence.events) {
            sequenceEvents.push({
                timestamp: event.timestamp,
                token: event.execToken,
                cueNumber: event.cueNumber,
                priority: 1,
                sourceOrder: sourceOrder++,
            });
            for (const action of sortRegionActions(event.regionActions ?? [])) {
                const targetSequence = regionSequencesById.get(action.regionId);
                if (!targetSequence) {
                    continue;
                }
                eventsBySequence.get(targetSequence.localSequenceNumber)?.push({
                    timestamp: event.timestamp,
                    token: action.kind === "ON" ? "Go+" : "Off",
                    ...(action.kind === "ON" ? { cueNumber: 1 } : {}),
                    priority: action.kind === "OFF" ? 0 : 2,
                    sourceOrder: sourceOrder++,
                });
            }
        }
    }
    for (const events of eventsBySequence.values()) {
        events.sort(compareTimecodeMacroEvents);
    }
    return eventsBySequence;
}
function sortRegionActions(actions) {
    return [...actions].sort((left, right) => (left.kind === right.kind ? 0 : left.kind === "OFF" ? -1 : 1));
}
function compareTimecodeMacroEvents(left, right) {
    const leftTime = Number.parseFloat(left.timestamp);
    const rightTime = Number.parseFloat(right.timestamp);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return leftTime - rightTime;
    }
    if (left.priority !== right.priority) {
        return left.priority - right.priority;
    }
    return left.sourceOrder - right.sourceOrder;
}
function createPageAssignmentCommands(settings, tempDataPoolName, sequences) {
    const executorOffsets = {
        main: 0,
        bump: 0,
    };
    return sequences.flatMap((sequence) => {
        if (!sequence.assignToExecutor) {
            return [];
        }
        const slotStart = sequence.executorSlotGroup === "bump" ? settings.bumpPageSlotStart : settings.pageSlotStart;
        const slot = slotStart + executorOffsets[sequence.executorSlotGroup];
        executorOffsets[sequence.executorSlotGroup] += 1;
        return [
            createCommand(`Assign DataPool ${quoteCommandValue(tempDataPoolName)} Sequence ${sequence.localSequenceNumber} At Page ${settings.pageNumber}.${slot}`),
        ];
    });
}
function createBpmCueName(bpmText) {
    return `BPM ${bpmText}`;
}
function offsetTimestampByMilliseconds(timestamp, milliseconds) {
    const parsedTimestamp = Number.parseFloat(timestamp);
    if (!Number.isFinite(parsedTimestamp)) {
        return timestamp;
    }
    return (parsedTimestamp + milliseconds / 1000).toFixed(3);
}
export function generateMacroXML(settings, uniqueCues, regionSequences, repeatedSequences, bumpSequences, bpmSequence, filename) {
    const tempDataPoolName = createTempDataPoolName(filename);
    const sequences = createGeneratedSequences(settings, uniqueCues, regionSequences, repeatedSequences, bumpSequences, bpmSequence);
    const timecodeCommands = createTimecodeCommands(settings, tempDataPoolName, filename, sequences, uniqueCues, regionSequences, repeatedSequences, bumpSequences, bpmSequence);
    const firstFinalSequenceNumber = sequences[0]?.finalSequenceNumber;
    const obj = {
        ...XML_HEADER,
        GMA3: {
            "@_DataVersion": "1.4.0.2",
            Macro: {
                "@_Name": `Macro ${filename}`,
                "@_Guid": "00 00 00 00 A8 F8 B9 20 78 06 00 00 A5 46 09 AA",
                MacroLine: [
                    createCommand("cd root", "0.01"),
                    createCommand(`Delete DataPool ${quoteCommandValue(tempDataPoolName)} /NC`),
                    createCommand(`Store DataPool ${quoteCommandValue(tempDataPoolName)} /NC`),
                    ...collectAppearanceSetupCommands(sequences),
                    ...sequences.flatMap((sequence) => createSequenceSetupCommands(tempDataPoolName, settings, sequence)),
                    ...timecodeCommands,
                    createCommand("cd root", "0.01"),
                    ...createPageAssignmentCommands(settings, tempDataPoolName, sequences),
                    ...(settings.exportMode === "cues-and-timecode" && sequences.length > 0
                        ? [createCommand(`Label DataPool ${quoteCommandValue(tempDataPoolName)} Timecode 1 ${quoteCommandValue(filename)}`)]
                        : []),
                    createCommand(`Label Page ${settings.pageNumber} ${quoteCommandValue(filename)}`),
                    ...(firstFinalSequenceNumber !== undefined
                        ? [createCommand(`Move DataPool ${quoteCommandValue(tempDataPoolName)} Sequence 1 Thru At Sequence ${firstFinalSequenceNumber}`)]
                        : []),
                    ...(settings.exportMode === "cues-and-timecode" && sequences.length > 0
                        ? [createCommand(`Move DataPool ${quoteCommandValue(tempDataPoolName)} Timecode 1 Thru At Timecode ${settings.timecodeNumber}`)]
                        : []),
                    createCommand(`Delete DataPool ${quoteCommandValue(tempDataPoolName)} /NoConfirm`),
                ],
            },
        },
    };
    return xmlBuilder.build(obj);
}
//# sourceMappingURL=macro-xml.js.map