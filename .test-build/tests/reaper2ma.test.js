import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { XMLParser } from "fast-xml-parser";
import { convertReaperCsvToArtifacts, createConversionOutputFiles } from "../src/lib/reaper2ma/converter.js";
import { convertReaperColorToGrandmaAppearanceColor } from "../src/lib/reaper2ma/colors.js";
import { buildOutputFileName, normalizeOutputBaseName } from "../src/lib/reaper2ma/filename.js";
import { createExampleMacroPresetOutputFiles, resolveExampleMacroTimecodeName } from "../src/lib/reaper2ma/macro-presets.js";
import { createConversionPreview } from "../src/lib/reaper2ma/preview.js";
import { createReaperTransportMacroOutputFile, generateReaperTransportMacros } from "../src/lib/reaper2ma/transport-macros.js";
import { bpmTagProvider } from "../src/lib/reaper2ma/providers/bpm.js";
import { cueFadeTagProvider } from "../src/lib/reaper2ma/providers/cue-fade.js";
import { createDefaultMarkerTagProviderRegistry } from "../src/lib/reaper2ma/providers/registry.js";
import { delayFromTagProvider } from "../src/lib/reaper2ma/providers/delay-from.js";
import { delayToTagProvider } from "../src/lib/reaper2ma/providers/delay-to.js";
import { fadeFromTagProvider } from "../src/lib/reaper2ma/providers/fade-from.js";
import { fadeToTagProvider } from "../src/lib/reaper2ma/providers/fade-to.js";
import { groupBumpSequences, groupRepeatedSequences, normalizeMarkerRows, parseMarkerExecution, parseMarkerName, parseReaperMarkerRows, sanitizeMarkerName, splitMarkerRows } from "../src/lib/reaper2ma/markers.js";
const baseSettings = {
    sequenceNumber: 101,
    appearanceStartNumber: 1,
    sequenceNamePrefix: "MA",
    timecodeNumber: 1,
    pageNumber: 1,
    pageSlotStart: 201,
    cueStartNumber: 1,
    speedMaster: "3.4",
    prefix: "1",
    exportMode: "cues-and-timecode",
};
const fixtureCsv = readFileSync(new URL("../../tests/fixtures/basic.csv", import.meta.url), "utf8");
const regionFixtureCsv = readFileSync(new URL("../../demo/test-billy-markers-without-mp3_regions_markers.csv", import.meta.url), "utf8");
const transportMacroFixture = readFileSync(new URL("../../tests/fixtures/reaper-transport-macros.default.xml", import.meta.url), "utf8");
const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: false,
    parseTagValue: false,
    parseAttributeValue: false,
});
function parseXml(xml) {
    return xmlParser.parse(xml);
}
function asArray(value) {
    if (value === undefined) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}
function getMacroCommands(xml) {
    const parsed = parseXml(xml);
    return asArray(parsed.GMA3.Macro.MacroLine).map((line) => line["@_Command"]);
}
describe("marker normalization", () => {
    it("preserves allowed marker characters and removes unsupported ones", () => {
        assert.equal(sanitizeMarkerName('Crash! "Main" / Intro'), "Crash Main / Intro");
        assert.equal(sanitizeMarkerName("Début Billy / Montée façade Œuvre Übergröße"), "Début Billy / Montée façade Œuvre Übergröße");
        assert.equal(sanitizeMarkerName("De\u0301but Billy"), "Début Billy");
    });
    it("extracts a final bracketed execution token when present", () => {
        assert.deepEqual(parseMarkerExecution("Intro [Temp|Flash]"), {
            displayName: "Intro",
            execToken: "Temp|Flash",
        });
        assert.deepEqual(parseMarkerExecution("Intro [Temp | Flash]"), {
            displayName: "Intro",
            execToken: "Temp|Flash",
        });
        assert.deepEqual(parseMarkerExecution("Intro [Boom]"), {
            displayName: "Intro",
            execToken: "Go+",
        });
    });
    it("parses leading metadata tags and trailing execution tokens together", () => {
        assert.deepEqual(parseMarkerName("[BPM_129.5|X_foo|Temp] Intro"), {
            displayName: "Intro",
            execToken: "Temp",
            tags: [
                { key: "BPM", value: "129.5" },
                { key: "X", value: "foo" },
            ],
            bpm: 129.5,
            bpmText: "129.5",
        });
        assert.deepEqual(parseMarkerName("[BPM_129.5|X_foo|Go+] Intro"), {
            displayName: "Intro",
            execToken: "Go+",
            tags: [
                { key: "BPM", value: "129.5" },
                { key: "X", value: "foo" },
            ],
            bpm: 129.5,
            bpmText: "129.5",
        });
        assert.deepEqual(parseMarkerName("[CueFade_6/12|X_foo|Temp] Intro"), {
            displayName: "Intro",
            execToken: "Temp",
            tags: [
                { key: "CUEFADE", value: "6/12" },
                { key: "X", value: "foo" },
            ],
            cueFade: "6/12",
        });
        assert.deepEqual(parseMarkerName("[TEMP] Intro"), {
            displayName: "Intro",
            execToken: "Temp",
            tags: [],
        });
        assert.deepEqual(parseMarkerName("[TEMP] Intro [Flash]"), {
            displayName: "Intro",
            execToken: "Flash",
            tags: [],
        });
        assert.deepEqual(parseMarkerName("[FadeFromX_0.5|FadeToX_1.2|DelayFromY_0.25|DelayToZ_2] Intro"), {
            displayName: "Intro",
            execToken: "Go+",
            tags: [
                { key: "FADEFROMX", value: "0.5" },
                { key: "FADETOX", value: "1.2" },
                { key: "DELAYFROMY", value: "0.25" },
                { key: "DELAYTOZ", value: "2" },
            ],
            cueTiming: [
                { key: "FadeFromX", value: "0.5" },
                { key: "FadeToX", value: "1.2" },
                { key: "DelayFromY", value: "0.25" },
                { key: "DelayToZ", value: "2" },
            ],
        });
        assert.deepEqual(parseMarkerName("[FadeFromA_0.5] Intro"), {
            displayName: "Intro",
            execToken: "Go+",
            tags: [{ key: "FADEFROMA", value: "0.5" }],
        });
        assert.deepEqual(parseMarkerName("[GLOBAL] Intro"), {
            displayName: "Intro",
            execToken: "Go+",
            tags: [{ key: "GLOBAL", value: null }],
            isGlobal: true,
        });
    });
    it("ignores invalid BPM metadata and keeps exporting", () => {
        const markers = normalizeMarkerRows([
            { "#": "1", Name: "[BPM_bad] Intro [Broken]", Start: "0", Color: "" },
        ]);
        assert.deepEqual(markers[0], {
            displayName: "Intro",
            execToken: "Go+",
            tags: [{ key: "BPM", value: "bad" }],
            start: "0",
            color: "",
        });
    });
    it("ignores empty cue fade metadata", () => {
        const marker = parseMarkerName("[CueFade_] Intro");
        assert.equal(marker.cueFade, undefined);
        assert.deepEqual(marker.tags, [{ key: "CUEFADE", value: null }]);
    });
    it("routes metadata through dedicated providers by family", () => {
        const registry = createDefaultMarkerTagProviderRegistry();
        assert.equal(fadeFromTagProvider.supports({ key: "FADEFROMX", value: "0.5" }), true);
        assert.equal(fadeFromTagProvider.supports({ key: "FADETOX", value: "0.5" }), false);
        assert.equal(fadeToTagProvider.supports({ key: "FADETOZ", value: "1.2" }), true);
        assert.equal(delayFromTagProvider.supports({ key: "DELAYFROMY", value: "0.25" }), true);
        assert.equal(delayToTagProvider.supports({ key: "DELAYTOZ", value: "2" }), true);
        assert.equal(cueFadeTagProvider.supports({ key: "CUEFADE", value: "6/12" }), true);
        assert.equal(bpmTagProvider.supports({ key: "BPM", value: "129.5" }), true);
        assert.deepEqual(registry.enrich([{ key: "FADEFROMX", value: "0.5" }]), {
            cueTiming: [{ key: "FadeFromX", value: "0.5" }],
        });
        assert.deepEqual(registry.enrich([{ key: "CUEFADE", value: "6/12" }]), {
            cueTiming: [],
            cueFade: "6/12",
        });
        assert.deepEqual(registry.enrich([{ key: "BPM", value: "129.5" }]), {
            cueTiming: [],
            bpm: 129.5,
            bpmText: "129.5",
        });
    });
    it("preserves sanitized marker names before sequence-local dedupe", () => {
        const markers = normalizeMarkerRows([
            { "#": "1", Name: "Intro!", Start: "0", Color: "" },
            { "#": "2", Name: "Intro!", Start: "1", Color: "" },
            { "#": "3", Name: "Crash", Start: "2", Color: "19005190" },
        ]);
        assert.deepEqual(markers.map((marker) => marker.displayName), ["Intro", "Intro", "Crash"]);
    });
    it("groups repeated markers by exact color and reuses cue names locally", () => {
        const repeatedSequences = groupRepeatedSequences([
            { displayName: "Intro", execToken: "Goto", tags: [], start: "2", color: "19005190" },
            { displayName: "Hit", execToken: "Load", tags: [], start: "3", color: "19005190" },
            { displayName: "Intro", execToken: "Goto", tags: [], start: "4", color: "33554431" },
        ], "1", 101, 1);
        assert.deepEqual(repeatedSequences.map((sequence) => ({
            color: sequence.color,
            displayName: sequence.displayName,
            cues: sequence.cues,
            appearanceName: sequence.appearanceName,
            appearanceNumber: sequence.appearanceNumber,
            appearanceColor: sequence.appearanceColor,
            sequenceNumber: sequence.sequenceNumber,
            events: sequence.events,
        })), [
            {
                color: "19005190",
                displayName: "1 - Intro",
                cues: [
                    { cueNumber: 1, name: "Start" },
                    { cueNumber: 2, name: "Hit" },
                ],
                appearanceName: "R2MA Color 19005190",
                appearanceNumber: 1,
                appearanceColor: "19005190",
                sequenceNumber: 102,
                events: [
                    { timestamp: "2", execToken: "Goto", cueNumber: 1, cueName: "Start" },
                    { timestamp: "3", execToken: "Load", cueNumber: 2, cueName: "Hit" },
                ],
            },
            {
                color: "33554431",
                displayName: "1 - Intro 2",
                cues: [{ cueNumber: 1, name: "Start" }],
                appearanceName: "R2MA Color 33554431",
                appearanceNumber: 2,
                appearanceColor: "33554431",
                sequenceNumber: 103,
                events: [{ timestamp: "4", execToken: "Goto", cueNumber: 1, cueName: "Start" }],
            },
        ]);
    });
    it("routes bump markers into their own overlay sequences", () => {
        const bumpSequences = groupBumpSequences([
            { displayName: "HIT", execToken: "Temp", tags: [], start: "5", color: "19005190" },
            { displayName: "HIT", execToken: "Flash", tags: [], start: "7", color: "19005190" },
            { displayName: "HIT", execToken: "Temp", tags: [], start: "9", color: "33554431" },
        ], 103, "1", new Map([
            ["19005190", "1 - Intro"],
            ["33554431", "1 - Verse"],
        ]));
        assert.deepEqual(bumpSequences.map((sequence) => ({
            color: sequence.color,
            displayName: sequence.displayName,
            cues: sequence.cues,
            sequenceNumber: sequence.sequenceNumber,
            events: sequence.events,
        })), [
            {
                color: "19005190",
                displayName: "1 - Intro - BUMP - HIT",
                cues: [{ cueNumber: 1, name: "Start" }],
                sequenceNumber: 104,
                events: [
                    { timestamp: "5", execToken: "Temp", cueNumber: 1, cueName: "Start" },
                    { timestamp: "7", execToken: "Flash", cueNumber: 1, cueName: "Start" },
                ],
            },
            {
                color: "33554431",
                displayName: "1 - Verse - BUMP - HIT",
                cues: [{ cueNumber: 1, name: "Start" }],
                sequenceNumber: 105,
                events: [{ timestamp: "9", execToken: "Temp", cueNumber: 1, cueName: "Start" }],
            },
        ]);
    });
    it("converts Reaper color values to grandMA3 appearance colors", () => {
        assert.equal(convertReaperColorToGrandmaAppearanceColor("19005190"), 'COLOR="1,1,1,0" BackR=33 BackG=255 BackB=6 BackAlpha=221');
        assert.equal(convertReaperColorToGrandmaAppearanceColor("33554431"), 'COLOR="1,1,1,0" BackR=255 BackG=255 BackB=255 BackAlpha=221');
        assert.equal(convertReaperColorToGrandmaAppearanceColor("F2FF00"), 'COLOR="1,1,1,0" BackR=242 BackG=255 BackB=0 BackAlpha=221');
        assert.equal(convertReaperColorToGrandmaAppearanceColor("#00BFFF"), 'COLOR="1,1,1,0" BackR=0 BackG=191 BackB=255 BackAlpha=221');
        assert.equal(convertReaperColorToGrandmaAppearanceColor(""), undefined);
    });
});
describe("conversion artifacts", () => {
    it("builds the expected XML artifacts from the fixture", () => {
        const artifacts = convertReaperCsvToArtifacts(fixtureCsv, "Song 01.CSV", baseSettings);
        const commands = getMacroCommands(artifacts.macroXml);
        assert.equal(artifacts.outputBaseName, "songcsv");
        assert.equal(artifacts.uniqueCues.length, 3);
        assert.equal(artifacts.repeatedSequences.length, 2);
        assert.equal(artifacts.bumpSequences.length, 0);
        assert.equal(artifacts.bpmSequence, undefined);
        assert.equal(commands.includes("Store Appearance 1"), true);
        assert.equal(commands.includes('Label Appearance 1 "R2MA Color 19005190"'), true);
        assert.equal(commands.includes('Set Appearance 1 COLOR="1,1,1,0" BackR=33 BackG=255 BackB=6 BackAlpha=221'), true);
        assert.equal(commands.includes('Store DataPool "R2MA songcsv" Sequence 1 "MA Sequence 101"'), true);
        assert.equal(commands.includes('Label DataPool "R2MA songcsv" Sequence 1 "MA Sequence 101"'), true);
        assert.equal(commands.includes('Set DataPool "R2MA songcsv" Sequence 2 APPEARANCE="R2MA Color 19005190"'), true);
        assert.equal(commands.includes("Store Appearance 2"), true);
        assert.equal(commands.includes('Label Appearance 2 "R2MA Color 33554431"'), true);
        assert.equal(commands.includes('Set DataPool "R2MA songcsv" Sequence 3 APPEARANCE="R2MA Color 33554431"'), true);
        assert.equal(commands.includes('Label DataPool "R2MA songcsv" Sequence 1 Cue 1 "Intro"'), true);
        assert.equal(commands.includes('Label DataPool "R2MA songcsv" Sequence 1 Cue 2 "Intro 2"'), true);
        assert.equal(commands.includes('Label DataPool "R2MA songcsv" Sequence 1 Cue 3 "Outro"'), true);
        assert.equal(commands.includes('Label DataPool "R2MA songcsv" Sequence 2 Cue 1 "Start"'), true);
        assert.equal(commands.includes('Label DataPool "R2MA songcsv" Sequence 3 Cue 1 "Start"'), true);
        assert.equal(commands.includes('Store DataPool "R2MA songcsv" Sequence 1 Cue 1 Thru 3 /Merge'), true);
        assert.equal(commands.includes('Set DataPool "R2MA songcsv" Sequence 1 Property "SpeedMaster" #[Master 3.4]'), true);
        assert.equal(commands.includes('Set DataPool "R2MA songcsv" Sequence 2 Property "SpeedMaster" #[Master 3.4]'), true);
        assert.equal(commands.includes('set 1 DURATION="6.000"'), true);
        const outputFiles = createConversionOutputFiles(artifacts);
        assert.deepEqual(outputFiles.map((file) => file.name), ["songcsv_macro.xml"]);
    });
    it("generates command-driven timecode inside the macro XML", () => {
        const artifacts = convertReaperCsvToArtifacts(fixtureCsv, "Song 01.CSV", baseSettings);
        const parsed = parseXml(artifacts.macroXml);
        const commands = getMacroCommands(artifacts.macroXml);
        assert.equal(parsed.GMA3["@_DataVersion"], "1.4.0.2");
        assert.equal(parsed.GMA3.Timecode, undefined);
        assert.equal(commands.includes('Delete DataPool "R2MA songcsv" /NC'), true);
        assert.equal(commands.includes('Store DataPool "R2MA songcsv" /NC'), true);
        assert.equal(commands.includes('Store DataPool "R2MA songcsv" Timecode 1'), true);
        assert.equal(commands.includes('Store Type "CmdSubTrack" 1'), true);
        assert.equal(commands.includes('Set 2 "TIME" "1"'), true);
        assert.equal(commands.includes('Set 2 "TOKEN" "Go+"'), true);
        assert.equal(commands.includes('Assign DataPool "R2MA songcsv" Sequence 1 Cue 2 At Timecode 1.1.1.1.1.2'), true);
        assert.equal(commands.includes('Assign DataPool "R2MA songcsv" Sequence 2 Cue 1 At Timecode 1.1.2.1.1.1'), true);
        assert.equal(commands.includes('Assign DataPool "R2MA songcsv" Sequence 1 At Page 1.201'), true);
        assert.equal(commands.includes('Move DataPool "R2MA songcsv" Sequence 1 Thru At Sequence 101'), true);
        assert.equal(commands.includes('Move DataPool "R2MA songcsv" Timecode 1 Thru At Timecode 1'), true);
        assert.equal(commands.includes('Delete DataPool "R2MA songcsv" /NoConfirm'), true);
        assert.equal(artifacts.macroXml.includes("GMA3.Timecode"), false);
        assert.equal(artifacts.macroXml.includes("RealtimeCmd"), false);
        assert.equal(artifacts.macroXml.includes("CueDestination"), false);
        assert.equal(artifacts.macroXml.includes("ValCueDestination"), false);
        assert.equal(artifacts.macroXml.includes("import Timecode"), false);
        assert.equal(artifacts.macroXml.includes("Drive"), false);
        assert.equal(artifacts.macroXml.includes("FaderSubTrack"), false);
        assert.equal(artifacts.macroXml.includes("ShowData.MediaPools.Sounds"), false);
    });
    it("keeps command time values in CSV seconds", () => {
        const csv = `#,Name,Start,Color
1,Intro,0,
2,Verse,110.167,
`;
        const artifacts = convertReaperCsvToArtifacts(csv, "long-time.csv", baseSettings);
        const commands = getMacroCommands(artifacts.macroXml);
        assert.equal(commands.includes('Set 2 "TIME" "110.167"'), true);
        assert.equal(commands.includes('set 1 DURATION="111.167"'), true);
    });
    it("builds a conversion preview from derived artifacts", () => {
        const artifacts = convertReaperCsvToArtifacts(fixtureCsv, "Song 01.CSV", baseSettings);
        const preview = createConversionPreview(artifacts, 6);
        assert.deepEqual(preview.outputFileNames, ["songcsv_macro.xml"]);
        assert.equal(preview.sourceMarkerCount, 6);
        assert.equal(preview.uniqueCueCount, 3);
        assert.equal(preview.repeatedSequenceCount, 2);
        assert.equal(preview.bumpSequenceCount, 0);
        assert.equal(preview.bpmEventCount, 0);
        assert.equal(preview.duration, "6.000");
        assert.deepEqual(preview.generatedSequenceNames, ["MA 1 - SD", "MA 1 - Crash"]);
        assert.equal(preview.warnings.length, 0);
    });
    it("builds hybrid region artifacts from the demo CSV fixture", () => {
        const artifacts = convertReaperCsvToArtifacts(regionFixtureCsv, "test-billy-markers-without-mp3_regions_markers.csv", {
            ...baseSettings,
            importMode: "regions-and-markers",
        });
        const commands = getMacroCommands(artifacts.macroXml);
        const tempDataPoolName = "R2MA testbillymarkerswithoutmpregionsmarkers";
        assert.equal(artifacts.regionSequences.length, 2);
        assert.deepEqual(artifacts.regionSequences.map((sequence) => ({
            regionId: sequence.regionId,
            displayName: sequence.displayName,
            sequenceNumber: sequence.sequenceNumber,
            cues: sequence.cues.map((cue) => cue.name),
        })), [
            { regionId: "R1", displayName: "MA R1 - Introduction", sequenceNumber: 102, cues: ["Introduction"] },
            {
                regionId: "R2",
                displayName: "MA R2 - Introduction - Sub Region",
                sequenceNumber: 103,
                cues: ["Début Billy", "Billy A Cet Age", "Blanc", "Intro Musique", "Montée", "Fin montée"],
            },
        ]);
        assert.equal(artifacts.repeatedSequences.length, 1);
        assert.equal(artifacts.repeatedSequences[0].displayName, "MA 1 - Harry Potter Deb");
        assert.equal(artifacts.bumpSequences.length, 0);
        assert.equal(artifacts.bpmSequence?.sequenceNumber, 105);
        assert.equal(commands.includes(`Store DataPool "${tempDataPoolName}" Sequence 1 "MA R1 - Introduction"`), true);
        assert.equal(commands.includes(`Label DataPool "${tempDataPoolName}" Sequence 1 "MA R1 - Introduction"`), true);
        assert.equal(commands.includes(`Store DataPool "${tempDataPoolName}" Sequence 2 "MA R2 - Introduction - Sub Region"`), true);
        assert.equal(commands.includes(`Label DataPool "${tempDataPoolName}" Sequence 2 "MA R2 - Introduction - Sub Region"`), true);
        assert.equal(commands.includes("Store Appearance 1"), true);
        assert.equal(commands.includes('Set Appearance 1 COLOR="1,1,1,0" BackR=217 BackG=61 BackB=0 BackAlpha=221'), true);
        assert.equal(commands.includes(`Set DataPool "${tempDataPoolName}" Sequence 2 Cue 4 APPEARANCE="R2MA Color F2FF00"`), true);
        assert.equal(commands.includes('Set Appearance 2 COLOR="1,1,1,0" BackR=242 BackG=255 BackB=0 BackAlpha=221'), true);
        assert.equal(commands.includes(`Set DataPool "${tempDataPoolName}" Sequence 3 APPEARANCE="R2MA Color 00BFFF"`), true);
        assert.equal(commands.includes(`Label DataPool "${tempDataPoolName}" Sequence 2 Cue 1 "Début Billy"`), true);
        assert.equal(commands.includes(`Label DataPool "${tempDataPoolName}" Sequence 2 Cue 5 "Montée"`), true);
        assert.equal(commands.includes(`Store DataPool "${tempDataPoolName}" Timecode 1`), true);
        assert.equal(commands.includes(`Assign DataPool "${tempDataPoolName}" Sequence 2 Cue 1 At Timecode 1.1.2.1.1.1`), true);
        assert.equal(commands.includes(`Move DataPool "${tempDataPoolName}" Sequence 1 Thru At Sequence 102`), true);
        assert.equal(commands.includes(`Move DataPool "${tempDataPoolName}" Timecode 1 Thru At Timecode 1`), true);
        assert.deepEqual(createConversionOutputFiles(artifacts).map((file) => file.name), ["testbillymarkerswithoutmpregionsmarkers_macro.xml"]);
    });
    it("keeps global markers in the main sequence even when they sit inside a region", () => {
        const csv = `#,Name,Start,End,Length,Color
R1,Region A,0,10,10,
1,[GLOBAL] Global Cue,1,,,
2,Region Cue,2,,,
`;
        const artifacts = convertReaperCsvToArtifacts(csv, "global-region.csv", {
            ...baseSettings,
            importMode: "regions-and-markers",
        });
        const commands = getMacroCommands(artifacts.macroXml);
        assert.equal(artifacts.uniqueCues.length, 1);
        assert.equal(artifacts.uniqueCues[0].displayName, "Global Cue");
        assert.equal(artifacts.regionSequences.length, 1);
        assert.deepEqual(artifacts.regionSequences[0].cues.map((cue) => cue.name), ["Region Cue"]);
        assert.equal(commands.includes('Label DataPool "R2MA globalregion" Sequence 1 Cue 1 "Global Cue"'), true);
        assert.equal(commands.includes('Label DataPool "R2MA globalregion" Sequence 1 Cue 1 "Region Cue"'), false);
    });
    it("calculates timecode duration from the latest generated event", () => {
        const csv = `#,Name,Start,End,Length,Color
R1,Region A,10,20,10,
1,Main Cue,0,,,
2,Repeated Cue,5,,,19005190
3,[Temp] Bump Cue,8,,,19005190
4,Region Cue,19,,,
5,[BPM_120] Late BPM,25,,,33554431
`;
        const artifacts = convertReaperCsvToArtifacts(csv, "duration.csv", {
            ...baseSettings,
            importMode: "regions-and-markers",
        });
        const preview = createConversionPreview(artifacts, 5);
        const commands = getMacroCommands(artifacts.macroXml);
        assert.equal(commands.includes('set 1 DURATION="26.000"'), true);
        assert.equal(preview.duration, "26.000");
    });
    it("falls back to Cue 1 for an unlabeled marker inside a region", () => {
        const csv = `#,Name,Start,End,Length,Color
R1,Region A,0,10,10,
1,,1,,,
`;
        const artifacts = convertReaperCsvToArtifacts(csv, "blank-cue.csv", {
            ...baseSettings,
            importMode: "regions-and-markers",
        });
        assert.equal(artifacts.regionSequences.length, 1);
        assert.equal(artifacts.regionSequences[0].cues[0].name, "Cue 1");
        assert.equal(getMacroCommands(artifacts.macroXml).includes('Label DataPool "R2MA blankcue" Sequence 1 Cue 1 "Cue 1"'), true);
    });
    it("assigns sequence and cue appearances independently in hybrid mode", () => {
        const csv = `#,Name,Start,End,Length,Color
R1,Region A,0,10,10,123456
1,Marker A,1,,,
2,Marker B,2,,,654321
`;
        const artifacts = convertReaperCsvToArtifacts(csv, "appearance-region.csv", {
            ...baseSettings,
            importMode: "regions-and-markers",
        });
        assert.equal(artifacts.regionSequences[0].appearanceName, "R2MA Color 123456");
        assert.equal(artifacts.regionSequences[0].cues[1].appearanceName, "R2MA Color 654321");
        assert.equal(artifacts.regionSequences[0].cues[1].appearanceColor, 'COLOR="1,1,1,0" BackR=9 BackG=251 BackB=241 BackAlpha=221');
        assert.equal(getMacroCommands(artifacts.macroXml).includes('Set DataPool "R2MA appearanceregion" Sequence 1 APPEARANCE="R2MA Color 123456"'), true);
        assert.equal(getMacroCommands(artifacts.macroXml).includes('Set DataPool "R2MA appearanceregion" Sequence 1 Cue 2 APPEARANCE="R2MA Color 654321"'), true);
    });
    it("emits OFF before ON for compact region action tags", () => {
        const csv = `#,Name,Start,End,Length,Color
R1,Region One,0,5,5,
R2,Region Two,5,10,5,
1,[OFF_R1|ON_R2] Cue,1,,,
`;
        const artifacts = convertReaperCsvToArtifacts(csv, "region-actions.csv", {
            ...baseSettings,
            importMode: "regions-and-markers",
        });
        const commands = getMacroCommands(artifacts.macroXml);
        const offTokenIndex = commands.indexOf('Set 1 "TOKEN" "Off"');
        const onTokenIndex = commands.indexOf('Set 1 "TOKEN" "Go+"');
        assert.notEqual(offTokenIndex, -1);
        assert.notEqual(onTokenIndex, -1);
        assert.ok(offTokenIndex < onTokenIndex);
        assert.equal(commands.includes('Assign DataPool "R2MA regionactions" Sequence 2 Cue 1 At Timecode 1.1.2.1.1.1'), true);
    });
    it("ignores region rows in markers-only mode", () => {
        const artifacts = convertReaperCsvToArtifacts(regionFixtureCsv, "test-billy-markers-without-mp3_regions_markers.csv", baseSettings);
        assert.equal(artifacts.regionSequences.length, 0);
        assert.equal(artifacts.uniqueCues.length, 4);
        assert.equal(artifacts.repeatedSequences.length, 2);
    });
    it("creates standalone example macro exports by group with a CSV filename fallback", () => {
        const outputFiles = createExampleMacroPresetOutputFiles({
            sourceFileName: "odyssees-erin.csv",
            timecodeName: "",
            selection: {
                showTime: true,
                timecodeControl: false,
            },
        });
        assert.deepEqual(outputFiles.map((file) => file.name), ["show-time-manuel.xml", "show-time-auto-restore.xml"]);
        assert.equal(outputFiles[0].content.includes('Macro Name="SHOW TIME MANUEL"'), true);
        assert.equal(outputFiles[0].content.includes('Off Timecode &quot;odyssees-erin&quot;'), true);
        assert.equal(outputFiles[0].content.includes('Macro &quot;RESET&quot;'), false);
        assert.equal(outputFiles[1].content.includes('Macro Name="SHOW TIME AUTO RESTORE"'), true);
        assert.equal(outputFiles[1].content.includes('Go+ Timecode &quot;odyssees-erin&quot;'), true);
    });
    it("creates the timecode control macro presets independently", () => {
        const outputFiles = createExampleMacroPresetOutputFiles({
            sourceFileName: "show.csv",
            timecodeName: "custom-timecode",
            selection: {
                showTime: false,
                timecodeControl: true,
            },
        });
        assert.deepEqual(outputFiles.map((file) => file.name), [
            "timecode-switch-int.xml",
            "timecode-switch-ltc.xml",
            "timecode-rewind-and-switch-int.xml",
            "timecode-rewind-tc-and-switch-ltc.xml",
        ]);
        assert.equal(outputFiles[0].content.includes('Macro Name="Timecode Switch INT"'), true);
        assert.equal(outputFiles[0].content.includes('Set Timecode &quot;custom-timecode&quot; &quot;TCSlot&quot; -2'), true);
        assert.equal(outputFiles[2].content.includes('Pause Timecode &quot;custom-timecode&quot;'), true);
    });
    it("resolves the example macro timecode name from the CSV basename when blank", () => {
        assert.equal(resolveExampleMacroTimecodeName("", "Pecherie 2023.csv"), "Pecherie 2023");
        assert.equal(resolveExampleMacroTimecodeName("manual-name", "Pecherie 2023.csv"), "manual-name");
    });
    it("omits the timecode export in cues-only mode", () => {
        const artifacts = convertReaperCsvToArtifacts(fixtureCsv, "demo.csv", {
            ...baseSettings,
            exportMode: "cues-only",
        });
        const commands = getMacroCommands(artifacts.macroXml);
        assert.deepEqual(createConversionOutputFiles(artifacts).map((file) => file.name), ["demo_macro.xml"]);
        assert.equal(commands.includes('Store DataPool "R2MA demo" Timecode 1'), false);
        assert.equal(commands.includes('Store Type "CmdSubTrack" 1'), false);
        assert.equal(commands.includes('Move DataPool "R2MA demo" Timecode 1 Thru At Timecode 1'), false);
        assert.equal(commands.includes('Assign DataPool "R2MA demo" Sequence 1 At Page 1.201'), true);
        assert.equal(commands.includes('Move DataPool "R2MA demo" Sequence 1 Thru At Sequence 101'), true);
    });
    it("keeps the current file name normalization semantics", () => {
        assert.equal(normalizeOutputBaseName("Song 01.CSV"), "songcsv");
        assert.equal(buildOutputFileName("demo", "macro"), "demo_macro.xml");
    });
    it("parses raw CSV rows with the expected headers", () => {
        const rows = parseReaperMarkerRows(fixtureCsv);
        const { uniqueCues, repeatedMarkers, bumpMarkers } = splitMarkerRows(normalizeMarkerRows(rows));
        assert.equal(uniqueCues.length, 3);
        assert.equal(repeatedMarkers.length, 3);
        assert.equal(bumpMarkers.length, 0);
        assert.equal(uniqueCues[0].displayName, "Intro");
        assert.equal(uniqueCues[1].displayName, "Intro");
        assert.equal(uniqueCues[2].displayName, "Outro");
        assert.equal(repeatedMarkers[0].displayName, "SD");
        assert.equal(repeatedMarkers[1].displayName, "SD");
    });
    it("uses the execution token from a bracket suffix in generated XML", () => {
        const csv = `#,Name,Start,Color
1,Intro [Load],0,
2,SD [Go+],1,19005190
3,SD,2,19005190
`;
        const artifacts = convertReaperCsvToArtifacts(csv, "tokens.csv", baseSettings);
        const commands = getMacroCommands(artifacts.macroXml);
        assert.equal(commands.includes('Label DataPool "R2MA tokens" Sequence 1 Cue 1 "Intro"'), true);
        assert.equal(commands.includes('Label DataPool "R2MA tokens" Sequence 2 Cue 1 "Start"'), true);
        assert.equal(commands.includes('Set 1 "TOKEN" "Load"'), true);
        assert.equal(commands.includes('Set 1 "TOKEN" "Go+"'), true);
        assert.equal(commands.includes('Set 2 "TOKEN" "Go+"'), true);
    });
    it("honors a configurable appearance start id", () => {
        const csv = `#,Name,Start,Color
1,SD,0,19005190
2,Crash,1,33554431
`;
        const artifacts = convertReaperCsvToArtifacts(csv, "appearances.csv", {
            ...baseSettings,
            appearanceStartNumber: 50,
        });
        assert.deepEqual(artifacts.repeatedSequences.map((sequence) => ({
            appearanceName: sequence.appearanceName,
            appearanceNumber: sequence.appearanceNumber,
            appearanceColor: sequence.appearanceColor,
        })), [
            { appearanceName: "R2MA Color 19005190", appearanceNumber: 50, appearanceColor: 'COLOR="1,1,1,0" BackR=33 BackG=255 BackB=6 BackAlpha=221' },
            { appearanceName: "R2MA Color 33554431", appearanceNumber: 51, appearanceColor: 'COLOR="1,1,1,0" BackR=255 BackG=255 BackB=255 BackAlpha=221' },
        ]);
        assert.equal(artifacts.macroXml.includes('Command="Store Appearance 50"'), true);
        assert.equal(artifacts.macroXml.includes('Command="Label Appearance 50 &quot;R2MA Color 19005190&quot;"'), true);
        assert.equal(artifacts.macroXml.includes('Command="Store Appearance 51"'), true);
        assert.equal(artifacts.macroXml.includes('Command="Label Appearance 51 &quot;R2MA Color 33554431&quot;"'), true);
    });
    it("creates a dedicated BPM sequence when BPM tags are present", () => {
        const csv = `#,Name,Start,Color
1,[BPM_129.5|X_foo] Intro [Load],0,
2,Verse,1,
3,[BPM_123.45] SD [Go+],2,19005190
4,SD,3,19005190
`;
        const artifacts = convertReaperCsvToArtifacts(csv, "bpm.csv", baseSettings);
        const commands = getMacroCommands(artifacts.macroXml);
        assert.equal(artifacts.uniqueCues.length, 2);
        assert.equal(artifacts.repeatedSequences.length, 1);
        assert.equal(artifacts.bumpSequences.length, 0);
        assert.equal(artifacts.bpmSequence?.sequenceNumber, 103);
        assert.equal(artifacts.bpmSequence?.displayName, "MA BPM");
        assert.equal(artifacts.bpmSequence?.events.length, 2);
        assert.equal(commands.includes('Set DataPool "R2MA bpm" Sequence 3 Property "SpeedMaster" #[Master 3.4]'), true);
        assert.equal(commands.includes('Store DataPool "R2MA bpm" Sequence 3 "MA BPM"'), true);
        assert.equal(commands.includes('Label DataPool "R2MA bpm" Sequence 3 "MA BPM"'), true);
        assert.equal(artifacts.macroXml.includes('Master 3.4 At BPM 129.5'), true);
        assert.equal(artifacts.macroXml.includes('Master 3.4 At BPM 123.45'), true);
        assert.equal(commands.includes('Set DataPool "R2MA bpm" Sequence 3 Cue 1 Property "Command" "Master 3.4 At BPM 129.5"'), true);
        assert.equal(commands.includes('Store DataPool "R2MA bpm" Timecode 1'), true);
        assert.equal(commands.includes('Assign DataPool "R2MA bpm" Sequence 3 Cue 1 At Timecode 1.1.3.1.1.1'), true);
    });
    it("applies cue fade commands to unique, repeated and bump cues", () => {
        const csv = `#,Name,Start,Color
1,[CueFade_5] Intro,0,
2,Verse,1,
3,[CueFade_6/12] Intro,2,19005190
4,[CueFade_3/] Hit,3,19005190
5,[Temp|CueFade_*2] Flash,4,19005190
`;
        const artifacts = convertReaperCsvToArtifacts(csv, "cuefade.csv", baseSettings);
        assert.equal(artifacts.uniqueCues[0].cueFade, "5");
        assert.equal(artifacts.repeatedSequences[0].cues[0].cueFade, "6/12");
        assert.equal(artifacts.repeatedSequences[0].cues[1].cueFade, "3/");
        assert.equal(artifacts.bumpSequences[0].cues[0].cueFade, "*2");
        assert.equal(getMacroCommands(artifacts.macroXml).includes('Set DataPool "R2MA cuefade" Sequence 1 Cue 1 CueFade 5'), true);
        assert.equal(getMacroCommands(artifacts.macroXml).includes('Set DataPool "R2MA cuefade" Sequence 2 Cue 1 CueFade 6/12'), true);
        assert.equal(getMacroCommands(artifacts.macroXml).includes('Set DataPool "R2MA cuefade" Sequence 2 Cue 2 CueFade 3/'), true);
        assert.equal(getMacroCommands(artifacts.macroXml).includes('Set DataPool "R2MA cuefade" Sequence 3 Cue 1 CueFade *2'), true);
    });
    it("emits cue timing modifiers for repeated and bump cues", () => {
        const csv = `#,Name,Start,Color
1,Intro,0,
2,[FadeFromX_0.5|FadeToX_1.2] Verse,1,19005190
3,[FadeFromX_1.5|DelayToZ_2] Hit,2,19005190
4,[Temp|FadeFromY_0.25|DelayFromY_0.75] Flash,3,19005190
`;
        const artifacts = convertReaperCsvToArtifacts(csv, "cue-timing.csv", baseSettings);
        assert.equal(artifacts.repeatedSequences[0].cues[0].cueTiming?.[0].key, "FadeFromX");
        assert.equal(artifacts.repeatedSequences[0].cues[0].cueTiming?.[0].value, "0.5");
        assert.equal(artifacts.repeatedSequences[0].cues[0].cueTiming?.[1].key, "FadeToX");
        assert.equal(artifacts.repeatedSequences[0].cues[1].cueTiming?.[0].key, "FadeFromX");
        assert.equal(artifacts.repeatedSequences[0].cues[1].cueTiming?.[1].key, "DelayToZ");
        assert.equal(artifacts.bumpSequences[0].cues[0].cueTiming?.[0].key, "FadeFromY");
        assert.equal(artifacts.bumpSequences[0].cues[0].cueTiming?.[1].key, "DelayFromY");
        assert.equal(getMacroCommands(artifacts.macroXml).includes('Set DataPool "R2MA cuetiming" Sequence 2 Cue 1 Part 0.1 FadeFromX "0.5" FadeToX "1.2"'), true);
        assert.equal(getMacroCommands(artifacts.macroXml).includes('Set DataPool "R2MA cuetiming" Sequence 2 Cue 2 Part 0.1 FadeFromX "1.5" DelayToZ "2"'), true);
        assert.equal(getMacroCommands(artifacts.macroXml).includes('Set DataPool "R2MA cuetiming" Sequence 3 Cue 1 Part 0.1 FadeFromY "0.25" DelayFromY "0.75"'), true);
    });
    it("ignores invalid BPM tags without creating a BPM sequence", () => {
        const csv = `#,Name,Start,Color
1,[BPM_bad] Intro,0,
2,SD,1,19005190
`;
        const artifacts = convertReaperCsvToArtifacts(csv, "invalid-bpm.csv", baseSettings);
        assert.equal(artifacts.bpmSequence, undefined);
        assert.equal(artifacts.uniqueCues[0].displayName, "Intro");
        assert.equal(artifacts.uniqueCues[0].bpm, undefined);
    });
    it("creates bump overlay sequences for Temp and Flash markers", () => {
        const csv = `#,Name,Start,Color
1,Intro,0,19005190
2,[Temp] HIT,1,19005190
3,[Flash] HIT,2,19005190
4,Verse,3,33554431
5,[Temp] HIT,4,33554431
`;
        const artifacts = convertReaperCsvToArtifacts(csv, "bump.csv", baseSettings);
        assert.equal(artifacts.repeatedSequences.length, 2);
        assert.equal(artifacts.bumpSequences.length, 2);
        assert.equal(artifacts.bumpSequences[0].color, "19005190");
        assert.equal(artifacts.bumpSequences[0].displayName, "MA 1 - Intro - BUMP - HIT");
        assert.equal(artifacts.bumpSequences[0].cues[0].name, "Start");
        assert.equal(artifacts.bumpSequences[0].events[0].cueName, "Start");
        assert.equal(artifacts.bumpSequences[0].events[1].cueName, "Start");
        assert.equal(artifacts.bumpSequences[1].color, "33554431");
        assert.equal(artifacts.bumpSequences[1].displayName, "MA 1 - Verse - BUMP - HIT");
        assert.equal(getMacroCommands(artifacts.macroXml).includes('Store DataPool "R2MA bump" Sequence 3 "MA 1 - Intro - BUMP - HIT"'), true);
        assert.equal(getMacroCommands(artifacts.macroXml).includes('Store DataPool "R2MA bump" Sequence 4 "MA 1 - Verse - BUMP - HIT"'), true);
        assert.equal(getMacroCommands(artifacts.macroXml).includes('Assign DataPool "R2MA bump" Sequence 3 Cue 1 At Timecode 1.1.3.1.1.1'), true);
    });
    it("warns when the main sequence is empty", () => {
        const csv = `#,Name,Start,Color
1,SD,0,19005190
2,Crash,1,33554431
`;
        const artifacts = convertReaperCsvToArtifacts(csv, "warning.csv", baseSettings);
        const preview = createConversionPreview(artifacts, 2);
        assert.equal(preview.warnings.some((warning) => warning.includes("séquence principale")), true);
        assert.equal(artifacts.macroXml.includes("Cue 1 thru 0"), false);
        assert.equal(artifacts.macroXml.includes('Sequence 101 Property &quot;SpeedMaster&quot;'), false);
    });
});
describe("reaper transport macro library", () => {
    it("matches the default fixture output", () => {
        const xml = generateReaperTransportMacros();
        assert.equal(xml, transportMacroFixture);
    });
    it("creates a valid macro library with the expected macro order and commands", () => {
        const xml = generateReaperTransportMacros();
        const parsed = parseXml(xml);
        const macros = Array.isArray(parsed.GMA3.Macro) ? parsed.GMA3.Macro : [parsed.GMA3.Macro];
        assert.equal(parsed.GMA3["@_DataVersion"], "2.4.2.2");
        assert.equal(macros.length, 8);
        assert.deepEqual(macros.map((macro) => macro["@_Name"]), [
            "REAPER - REWIND",
            "REAPER - PLAY",
            "REAPER - PAUSE",
            "REAPER - STOP",
            "REAPER - NEXT MARKER",
            "REAPER - PREV MARKER",
            "REAPER - NEXT REGION",
            "REAPER - PREV REGION",
        ]);
        assert.deepEqual(macros.map((macro) => {
            const lines = Array.isArray(macro.MacroLine) ? macro.MacroLine : [macro.MacroLine];
            return lines.map((line) => line["@_Command"]);
        }), [
            ['SendOSC 1 "/action,i,40042"'],
            ['SendOSC 1 "/play,i,1"'],
            ['SendOSC 1 "/pause,i,1"'],
            ['SendOSC 1 "/stop,i,1"'],
            ['SendOSC 1 "/action,i,40173"'],
            ['SendOSC 1 "/action,i,40172"'],
            ['SendOSC 1 "/ma3/region/next,i,1"'],
            ['SendOSC 1 "/ma3/region/previous,i,1"'],
        ]);
        assert.equal(xml.includes("record"), false);
        assert.equal(xml.includes("/record"), false);
        assert.equal(xml.includes("REC"), false);
        assert.equal(xml.includes("&quot;/play,i,1&quot;"), true);
        assert.equal(xml.includes("&quot;/ma3/region/previous,i,1&quot;"), true);
        assert.equal(macros.every((macro) => {
            const lines = Array.isArray(macro.MacroLine) ? macro.MacroLine : [macro.MacroLine];
            return lines.length === 1 && Boolean(lines[0]["@_Guid"]) && Boolean(lines[0]["@_Command"]);
        }), true);
    });
    it("supports custom slot ids and display names without changing the command payload", () => {
        const defaultXml = generateReaperTransportMacros();
        const oscDataNameOnlyXml = generateReaperTransportMacros({
            oscDataName: "AUDIO_REAPER",
        });
        const customXml = generateReaperTransportMacros({
            oscSlotId: 3,
            oscDataName: "AUDIO_REAPER",
            macroNamePrefix: "AUDIO_REAPER - ",
            outputFileName: "audio_reaper_macros.xml",
        });
        assert.equal(oscDataNameOnlyXml, defaultXml);
        assert.equal(customXml.includes('SendOSC 3 &quot;/play,i,1&quot;'), true);
        assert.equal(customXml.includes('SendOSC 3 &quot;/action,i,40042&quot;'), true);
        assert.equal(customXml.includes("AUDIO_REAPER - PLAY"), true);
        assert.equal(defaultXml.includes("AUDIO_REAPER - PLAY"), false);
        assert.notEqual(customXml, defaultXml);
    });
    it("is deterministic for repeated generations with the same options", () => {
        const first = generateReaperTransportMacros({
            oscSlotId: 3,
            oscDataName: "AUDIO_REAPER",
            macroNamePrefix: "AUDIO_REAPER - ",
        });
        const second = generateReaperTransportMacros({
            oscSlotId: 3,
            oscDataName: "AUDIO_REAPER",
            macroNamePrefix: "AUDIO_REAPER - ",
        });
        assert.equal(first, second);
    });
    it("rejects invalid slot ids", () => {
        assert.throws(() => generateReaperTransportMacros({ oscSlotId: 0 }), /positive integer/);
        assert.throws(() => generateReaperTransportMacros({ oscSlotId: -1 }), /positive integer/);
        assert.throws(() => generateReaperTransportMacros({ oscSlotId: 1.25 }), /positive integer/);
    });
    it("creates an output file wrapper with the configured filename", () => {
        const output = createReaperTransportMacroOutputFile({
            outputFileName: "custom.xml",
        });
        assert.equal(output.name, "custom.xml");
        assert.equal(output.content, generateReaperTransportMacros({ outputFileName: "custom.xml" }));
    });
});
//# sourceMappingURL=reaper2ma.test.js.map