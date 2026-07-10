import { stripFileExtension } from "./filename.js";
import { XML_HEADER, generateGuid, xmlBuilder } from "./xml-common.js";
import type {
    ExampleMacroPresetContext,
    ExampleMacroPresetDefinition,
    ExampleMacroPresetGroup,
    ExampleMacroPresetOutputFile,
    ExampleMacroPresetSelection,
} from "./types.js";

const MACRO_XML_VERSION = "2.4.2.2";

function renderLine(line: string | ((context: ExampleMacroPresetContext) => string), context: ExampleMacroPresetContext): string {
    return typeof line === "function" ? line(context) : line;
}

function slugifyMacroName(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function createMacroXml(preset: ExampleMacroPresetDefinition, timecodeName: string): string {
    const context: ExampleMacroPresetContext = {
        timecodeName,
    };

    const obj = {
        ...XML_HEADER,
        GMA3: {
            "@_DataVersion": MACRO_XML_VERSION,
            Macro: {
                "@_Name": preset.xmlName,
                "@_Guid": generateGuid(),
                MacroLine: preset.lines.map((line) => ({
                    "@_Guid": generateGuid(),
                    "@_Command": renderLine(line, context),
                })),
            },
        },
    };

    return xmlBuilder.build(obj);
}

function createPreset(
    id: ExampleMacroPresetDefinition["id"],
    groupId: ExampleMacroPresetDefinition["groupId"],
    label: string,
    xmlName: string,
    lines: Array<string | ((context: ExampleMacroPresetContext) => string)>,
): ExampleMacroPresetDefinition {
    return {
        id,
        groupId,
        label,
        xmlName,
        fileBaseName: slugifyMacroName(label),
        lines,
    };
}

export const exampleMacroPresetGroups: ExampleMacroPresetGroup[] = [
    {
        id: "show-time",
        label: "Show time",
        description: "Standalone macros to switch the show-time state.",
        presets: [
            createPreset("show-time-manuel", "show-time", "show time manuel", "SHOW TIME MANUEL", [
                "(Passage en Manuel. Certain ?)",
                "(Passage en Manuel Confirmé. Vraiment Certain ?)",
                ({ timecodeName }) => `Off Timecode "${timecodeName}"`,
                ({ timecodeName }) => `Top Timecode "${timecodeName}"`,
                ({ timecodeName }) => `Set Timecode "${timecodeName}" "TCSlot" -2`,
                'Page 1',
                'On Sequence "Rescue POS"',
                'On Sequence "Erin" Cue 1',
                'On Sequence "StartShow 1"',
                'On Sequence "StartShow 2"',
                'On Sequence "StartShow 3"',
                'On Sequence "StartShow 4"',
                'On Sequence "StartShow 5"',
            ]),
            createPreset("show-time-auto-restore", "show-time", "show time auto restore", "SHOW TIME AUTO RESTORE", [
                "(Passage en Auto. Certain ?)",
                "(Passage en Auto Confirmé. Vraiment Certain ?)",
                ({ timecodeName }) => `Set Timecode "${timecodeName}" "TCSlot" 1`,
                ({ timecodeName }) => `Go+ Timecode "${timecodeName}"`,
            ]),
        ],
    },
    {
        id: "timecode-control",
        label: "Timecode control",
        description: "Macros to switch or rewind the timecode transport.",
        presets: [
            createPreset("timecode-switch-int", "timecode-control", "timecode switch int", "Timecode Switch INT", [
                "(Passage en TimeCode Manuel. Certain ?)",
                ({ timecodeName }) => `Set Timecode "${timecodeName}" "TCSlot" -2`,
            ]),
            createPreset("timecode-switch-ltc", "timecode-control", "timecode switch ltc", "Timecode Switch LTC", [
                "(Passage en TimeCode Auto. Certain ?)",
                ({ timecodeName }) => `Set Timecode "${timecodeName}" "TCSlot" 1`,
            ]),
            createPreset(
                "timecode-rewind-and-switch-int",
                "timecode-control",
                "timecode rewind and switch int",
                "Timecode Rewind and Switch INT",
                [
                    "(Rewind the current timecode and switch to INT)",
                    ({ timecodeName }) => `Off Timecode "${timecodeName}"`,
                    ({ timecodeName }) => `Top Timecode "${timecodeName}"`,
                    ({ timecodeName }) => `Set Timecode "${timecodeName}" "TCSlot" -2`,
                    ({ timecodeName }) => `Pause Timecode "${timecodeName}"`,
                ],
            ),
            createPreset(
                "timecode-rewind-tc-and-switch-ltc",
                "timecode-control",
                "timecode rewind tc and switch ltc",
                "Timecode Rewind TC and Switch LTC",
                [
                    "(Rewind the current timecode and switch to LTC)",
                    ({ timecodeName }) => `Off Timecode "${timecodeName}"`,
                    ({ timecodeName }) => `Top Timecode "${timecodeName}"`,
                    ({ timecodeName }) => `Set Timecode "${timecodeName}" "TCSlot" 1`,
                    ({ timecodeName }) => `Go+ Timecode "${timecodeName}"`,
                ],
            ),
        ],
    },
];

export function resolveExampleMacroTimecodeName(timecodeName: string, sourceFileName: string): string {
    const trimmedTimecodeName = timecodeName.trim();

    if (trimmedTimecodeName) {
        return trimmedTimecodeName;
    }

    return stripFileExtension(sourceFileName).trim();
}

export function createExampleMacroPresetOutputFiles(options: {
    sourceFileName: string;
    timecodeName: string;
    selection: ExampleMacroPresetSelection;
}): ExampleMacroPresetOutputFile[] {
    const selectedGroups = new Set<ExampleMacroPresetDefinition["groupId"]>();

    if (options.selection.showTime) {
        selectedGroups.add("show-time");
    }

    if (options.selection.timecodeControl) {
        selectedGroups.add("timecode-control");
    }

    const resolvedTimecodeName = resolveExampleMacroTimecodeName(options.timecodeName, options.sourceFileName);

    if (!resolvedTimecodeName || selectedGroups.size === 0) {
        return [];
    }

    return exampleMacroPresetGroups.flatMap((group) =>
        group.presets
            .filter((preset) => selectedGroups.has(preset.groupId))
            .map((preset) => ({
                presetId: preset.id,
                name: `${preset.fileBaseName}.xml`,
                content: createMacroXml(preset, resolvedTimecodeName),
            })),
    );
}
