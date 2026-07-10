import { convertReaperColorToGrandmaAppearanceColor } from "./colors.js";
import { createUniqueCuePlan } from "./cue-plan.js";
import { XML_HEADER, xmlBuilder } from "./xml-common.js";
import type { BpmSequence, BumpSequence, ConversionSettings, ConvertedMarker, CueTimingTag, RepeatedSequence, SequenceCue } from "./types.js";

function createSpeedMasterCommand(sequenceNumber: number, speedMaster: string): Record<string, string> {
    return {
        "@_Command": `Set Sequence ${sequenceNumber} Property "SpeedMaster" #[Master ${speedMaster}]`,
        "@_Wait": "0.10",
    };
}

function createAppearanceCommands(sequence: RepeatedSequence): Record<string, string>[] {
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

function createCueLabelCommands(sequenceNumber: number, cues: SequenceCue[]): Record<string, string>[] {
    return cues.map((cue) => ({
        "@_Command": `Label Sequence ${sequenceNumber} Cue ${cue.cueNumber} "${cue.name}"`,
        "@_Wait": "0.10",
    }));
}

type CueFadeCommandSource = {
    cueFade?: string;
} & (
    | {
          name: string;
      }
    | {
          cueName: string;
      }
);

function createCueFadeCommands(sequenceNumber: number, cues: CueFadeCommandSource[]): Record<string, string>[] {
    return cues.flatMap((cue) =>
        cue.cueFade
            ? [
                  {
                      "@_Command": `Set Sequence ${sequenceNumber} Cue "${"name" in cue ? cue.name : cue.cueName}" CueFade ${cue.cueFade}`,
                      "@_Wait": "0.10",
                  },
              ]
            : [],
    );
}

type CueTimingCommandSource = {
    cueTiming?: CueTimingTag[];
} & (
    | {
          name: string;
      }
    | {
          cueName: string;
      }
);

function createCueTimingCommands(sequenceNumber: number, cues: CueTimingCommandSource[]): Record<string, string>[] {
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

function createColorSequenceMacroLines(sequence: RepeatedSequence, speedMaster: string): Record<string, string>[] {
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
        ...createCueTimingCommands(sequence.sequenceNumber, sequence.cues),
        {
            "@_Command": `Set Sequence ${sequence.sequenceNumber} Cue "OffCue" Property "TRIGTYPE" "Follow"`,
            "@_Wait": "0.10",
        },
    ];
}

function createBumpSequenceMacroLines(sequence: BumpSequence, speedMaster: string): Record<string, string>[] {
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

export function generateMacroXML(
    settings: ConversionSettings,
    uniqueCues: ConvertedMarker[],
    repeatedSequences: RepeatedSequence[],
    bumpSequences: BumpSequence[],
    bpmSequence: BpmSequence | undefined,
    filename: string,
): string {
    const uniqueCuePlan = createUniqueCuePlan(uniqueCues);
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
                    ...uniqueCuePlan.map((item, index) => ({
                        "@_Command": `Label Sequence ${settings.sequenceNumber} Cue ${index + settings.cueStartNumber} "${item.cueName}"`,
                        "@_Wait": "0.10",
                    })),
                    ...createCueFadeCommands(settings.sequenceNumber, uniqueCuePlan),
                    ...createCueTimingCommands(settings.sequenceNumber, uniqueCuePlan),
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
