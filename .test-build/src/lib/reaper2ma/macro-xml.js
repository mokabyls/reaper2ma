import { createUniqueCuePlan } from "./cue-plan.js";
import { XML_HEADER, xmlBuilder } from "./xml-common.js";
function createSpeedMasterCommand(sequenceNumber, speedMaster) {
    return {
        "@_Command": `Set Sequence ${sequenceNumber} Property "SpeedMaster" #[Master ${speedMaster}]`,
        "@_Wait": "0.10",
    };
}
function createCueLabelCommands(sequenceNumber, cues) {
    return cues.map((cue) => ({
        "@_Command": `Label Sequence ${sequenceNumber} Cue ${cue.cueNumber} "${cue.name}"`,
        "@_Wait": "0.10",
    }));
}
function createSequenceAppearanceAssignmentCommands(sequenceNumber, appearanceName, appearanceNumber, appearanceColor) {
    if (!appearanceName || appearanceNumber === undefined || !appearanceColor) {
        return [];
    }
    return [
        {
            "@_Command": `Assign Appearance "${appearanceName}" at Sequence ${sequenceNumber}`,
            "@_Wait": "0.10",
        },
    ];
}
function createCueAppearanceAssignmentCommands(sequenceNumber, cues) {
    return cues.flatMap((cue) => cue.appearanceName && cue.appearanceNumber !== undefined && cue.appearanceColor
        ? [
            {
                "@_Command": `Assign Appearance "${cue.appearanceName}" at Sequence ${sequenceNumber} Cue ${cue.cueNumber}`,
                "@_Wait": "0.10",
            },
        ]
        : []);
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
function createCueTimingCommands(sequenceNumber, cues) {
    return cues.flatMap((cue) => {
        if (!cue.cueTiming || cue.cueTiming.length === 0) {
            return [];
        }
        const cueName = "name" in cue ? cue.name : cue.cueName;
        const modifiers = cue.cueTiming.map((tag) => `${tag.key} "${tag.value}"`).join(" ");
        return [
            {
                "@_Command": `Set Sequence ${sequenceNumber} Cue "${cueName}" Part 0.1 ${modifiers}`,
                "@_Wait": "0.10",
            },
        ];
    });
}
function createColorSequenceMacroLines(sequence, speedMaster) {
    return [
        {
            "@_Command": `Store Sequence ${sequence.sequenceNumber} "${sequence.displayName}"`,
            "@_Wait": "0.10",
        },
        createSpeedMasterCommand(sequence.sequenceNumber, speedMaster),
        ...createSequenceAppearanceAssignmentCommands(sequence.sequenceNumber, sequence.appearanceName, sequence.appearanceNumber, sequence.appearanceColor),
        {
            "@_Command": `Store Sequence ${sequence.sequenceNumber} Cue 1 Thru ${sequence.cues.length}`,
            "@_Wait": "0.10",
        },
        {
            "@_Command": `Store Sequence ${sequence.sequenceNumber} Cue 1 Thru ${sequence.cues.length} Part 0.1`,
            "@_Wait": "0.10",
        },
        ...createCueLabelCommands(sequence.sequenceNumber, sequence.cues),
        ...createCueAppearanceAssignmentCommands(sequence.sequenceNumber, sequence.cues),
        ...createCueFadeCommands(sequence.sequenceNumber, sequence.cues),
        ...createCueTimingCommands(sequence.sequenceNumber, sequence.cues),
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
        ...createCueTimingCommands(sequence.sequenceNumber, sequence.cues),
        {
            "@_Command": `Set Sequence ${sequence.sequenceNumber} Cue "OffCue" Property "TRIGTYPE" "Follow"`,
            "@_Wait": "0.10",
        },
    ];
}
function createRegionSequenceMacroLines(sequence, speedMaster) {
    return [
        {
            "@_Command": `Store Sequence ${sequence.sequenceNumber} "${sequence.displayName}"`,
            "@_Wait": "0.10",
        },
        createSpeedMasterCommand(sequence.sequenceNumber, speedMaster),
        ...createSequenceAppearanceAssignmentCommands(sequence.sequenceNumber, sequence.appearanceName, sequence.appearanceNumber, sequence.appearanceColor),
        {
            "@_Command": `Store Sequence ${sequence.sequenceNumber} Cue 1 Thru ${sequence.cues.length}`,
            "@_Wait": "0.10",
        },
        {
            "@_Command": `Store Sequence ${sequence.sequenceNumber} Cue 1 Thru ${sequence.cues.length} Part 0.1`,
            "@_Wait": "0.10",
        },
        ...createCueLabelCommands(sequence.sequenceNumber, sequence.cues),
        ...createCueAppearanceAssignmentCommands(sequence.sequenceNumber, sequence.cues),
        ...createCueFadeCommands(sequence.sequenceNumber, sequence.cues),
        ...createCueTimingCommands(sequence.sequenceNumber, sequence.cues),
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
export function generateMacroXML(settings, uniqueCues, regionSequences, repeatedSequences, bumpSequences, bpmSequence, filename) {
    const uniqueCuePlan = createUniqueCuePlan(uniqueCues);
    const appearanceSetupCommands = collectAppearanceSetupCommands(regionSequences, repeatedSequences);
    const obj = {
        ...XML_HEADER,
        GMA3: {
            "@_DataVersion": "1.4.0.2",
            Macro: {
                "@_Name": `Macro ${filename}`,
                "@_Guid": "00 00 00 00 A8 F8 B9 20 78 06 00 00 A5 46 09 AA",
                MacroLine: [
                    {
                        "@_Command": `Store Sequence ${settings.sequenceNumber} Cue ${settings.cueStartNumber} thru ${uniqueCues.length + settings.cueStartNumber - 1}`,
                        "@_Wait": "0.10",
                    },
                    createSpeedMasterCommand(settings.sequenceNumber, settings.speedMaster),
                    ...appearanceSetupCommands,
                    ...uniqueCuePlan.map((item, index) => ({
                        "@_Command": `Label Sequence ${settings.sequenceNumber} Cue ${index + settings.cueStartNumber} "${item.cueName}"`,
                        "@_Wait": "0.10",
                    })),
                    ...createCueFadeCommands(settings.sequenceNumber, uniqueCuePlan),
                    ...createCueTimingCommands(settings.sequenceNumber, uniqueCuePlan),
                    ...regionSequences.flatMap((sequence) => createRegionSequenceMacroLines(sequence, settings.speedMaster)),
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
    return xmlBuilder.build(obj);
}
function collectAppearanceSetupCommands(regionSequences, repeatedSequences) {
    const appearancesByNumber = new Map();
    for (const sequence of [...regionSequences, ...repeatedSequences]) {
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
        {
            "@_Command": `Store Appearance ${appearanceNumber}`,
            "@_Wait": "0.10",
        },
        {
            "@_Command": `Label Appearance ${appearanceNumber} "${appearance.appearanceName}"`,
            "@_Wait": "0.10",
        },
        {
            "@_Command": `Set Appearance ${appearanceNumber} "Color" "${appearance.appearanceColor}"`,
            "@_Wait": "0.10",
        },
    ]);
}
//# sourceMappingURL=macro-xml.js.map