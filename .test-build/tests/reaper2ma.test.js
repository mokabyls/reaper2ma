import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { convertReaperCsvToArtifacts, createConversionOutputFiles } from "../src/lib/reaper2ma/converter.js";
import { convertReaperColorToGrandmaAppearanceColor } from "../src/lib/reaper2ma/colors.js";
import { buildOutputFileName, normalizeOutputBaseName } from "../src/lib/reaper2ma/filename.js";
import { groupBumpSequences, groupRepeatedSequences, normalizeMarkerRows, parseMarkerExecution, parseMarkerName, parseReaperMarkerRows, sanitizeMarkerName, splitMarkerRows } from "../src/lib/reaper2ma/markers.js";
const baseSettings = {
    sequenceNumber: 101,
    appearanceStartNumber: 1,
    driveNumber: 2,
    cueStartNumber: 1,
    speedMaster: "3.4",
    prefix: "1",
    exportMode: "cues-and-timecode",
};
const fixtureCsv = readFileSync(new URL("../../tests/fixtures/basic.csv", import.meta.url), "utf8");
describe("marker normalization", () => {
    it("preserves allowed marker characters and removes unsupported ones", () => {
        assert.equal(sanitizeMarkerName('Crash! "Main" / Intro'), "Crash Main / Intro");
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
            execToken: "Goto",
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
    });
    it("ignores invalid BPM metadata and keeps exporting", () => {
        const markers = normalizeMarkerRows([
            { "#": "1", Name: "[BPM_bad] Intro [Broken]", Start: "0", Color: "" },
        ]);
        assert.deepEqual(markers[0], {
            displayName: "Intro",
            execToken: "Goto",
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
        assert.equal(convertReaperColorToGrandmaAppearanceColor("19005190"), "12.9,100.0,2.4,100.0");
        assert.equal(convertReaperColorToGrandmaAppearanceColor("33554431"), "100.0,100.0,100.0,100.0");
        assert.equal(convertReaperColorToGrandmaAppearanceColor(""), undefined);
    });
});
describe("conversion artifacts", () => {
    it("builds the expected XML artifacts from the fixture", () => {
        const artifacts = convertReaperCsvToArtifacts(fixtureCsv, "Song 01.CSV", baseSettings);
        assert.equal(artifacts.outputBaseName, "songcsv");
        assert.equal(artifacts.uniqueCues.length, 3);
        assert.equal(artifacts.repeatedSequences.length, 2);
        assert.equal(artifacts.bumpSequences.length, 0);
        assert.equal(artifacts.bpmSequence, undefined);
        assert.equal(artifacts.macroXml.includes('Command="Store Appearance 1"'), true);
        assert.equal(artifacts.macroXml.includes('Command="Label Appearance 1 &quot;R2MA Color 19005190&quot;"'), true);
        assert.equal(artifacts.macroXml.includes('Command="Set Appearance 1 &quot;Color&quot; &quot;12.9,100.0,2.4,100.0&quot;"'), true);
        assert.equal(artifacts.macroXml.includes('Command="Assign Appearance &quot;R2MA Color 19005190&quot; at Sequence 102"'), true);
        assert.equal(artifacts.macroXml.includes('Command="Store Appearance 2"'), true);
        assert.equal(artifacts.macroXml.includes('Command="Label Appearance 2 &quot;R2MA Color 33554431&quot;"'), true);
        assert.equal(artifacts.macroXml.includes('Command="Assign Appearance &quot;R2MA Color 33554431&quot; at Sequence 103"'), true);
        assert.equal(artifacts.macroXml.includes('Label Sequence 101 Cue 1 &quot;Intro&quot;'), true);
        assert.equal(artifacts.macroXml.includes('Label Sequence 101 Cue 2 &quot;Intro 2&quot;'), true);
        assert.equal(artifacts.macroXml.includes('Label Sequence 101 Cue 3 &quot;Outro&quot;'), true);
        assert.equal(artifacts.macroXml.includes('Command="Label Sequence 102 Cue 1 &quot;Start&quot;"'), true);
        assert.equal(artifacts.macroXml.includes('Command="Label Sequence 103 Cue 1 &quot;Start&quot;"'), true);
        assert.equal(artifacts.timecodeXml?.includes('ShowData.DataPools.Default.Sequences.Sequence 101.Intro 2'), true);
        assert.equal(artifacts.timecodeXml?.includes('ShowData.DataPools.Default.Sequences.1 - SD.Start'), true);
        assert.equal(artifacts.macroXml.includes('Store Sequence 101 Cue 1 thru 3'), true);
        assert.equal(artifacts.macroXml.includes('Command="Set Sequence 101 Property &quot;SpeedMaster&quot; #[Master 3.4]"'), true);
        assert.equal(artifacts.macroXml.includes('Command="Set Sequence 102 Property &quot;SpeedMaster&quot; #[Master 3.4]"'), true);
        assert.equal(artifacts.timecodeXml?.includes('Duration="6.000"'), true);
        const outputFiles = createConversionOutputFiles(artifacts);
        assert.deepEqual(outputFiles.map((file) => file.name), ["songcsv_macro.xml", "songcsv_timecode.xml"]);
    });
    it("omits the timecode export in cues-only mode", () => {
        const artifacts = convertReaperCsvToArtifacts(fixtureCsv, "demo.csv", {
            ...baseSettings,
            exportMode: "cues-only",
        });
        assert.equal(artifacts.timecodeXml, undefined);
        assert.deepEqual(createConversionOutputFiles(artifacts).map((file) => file.name), ["demo_macro.xml"]);
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
        assert.equal(artifacts.macroXml.includes('Label Sequence 101 Cue 1 &quot;Intro&quot;'), true);
        assert.equal(artifacts.macroXml.includes('Label Sequence 102 Cue 1 &quot;Start&quot;'), true);
        assert.equal(artifacts.timecodeXml?.includes('Name="Load"'), true);
        assert.equal(artifacts.timecodeXml?.includes('ExecToken="Load"'), true);
        assert.equal(artifacts.timecodeXml?.includes('ExecToken="Go+"'), true);
        assert.equal(artifacts.timecodeXml?.includes('ExecToken="Goto"'), true);
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
        })), [
            { appearanceName: "R2MA Color 19005190", appearanceNumber: 50 },
            { appearanceName: "R2MA Color 33554431", appearanceNumber: 51 },
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
        assert.equal(artifacts.uniqueCues.length, 2);
        assert.equal(artifacts.repeatedSequences.length, 1);
        assert.equal(artifacts.bumpSequences.length, 0);
        assert.equal(artifacts.bpmSequence?.sequenceNumber, 103);
        assert.equal(artifacts.bpmSequence?.events.length, 2);
        assert.equal(artifacts.macroXml.includes('Command="Set Sequence 103 Property &quot;SpeedMaster&quot; #[Master 3.4]"'), true);
        assert.equal(artifacts.macroXml.includes('Command="Store Sequence 103 &quot;BPM&quot;"'), true);
        assert.equal(artifacts.macroXml.includes('Master 3.4 At BPM 129.5'), true);
        assert.equal(artifacts.macroXml.includes('Master 3.4 At BPM 123.45'), true);
        assert.equal(artifacts.macroXml.includes('CuePart 1 Property &quot;CMD&quot; &quot;Master 3.4 At BPM 129.5&quot;'), true);
        assert.equal(artifacts.timecodeXml?.includes('MarkerTrack'), true);
        assert.equal(artifacts.timecodeXml?.includes('Name="BPM"'), true);
        assert.equal(artifacts.timecodeXml?.includes('Target="ShowData.DataPools.Default.Sequences.Sequence 103"'), true);
        assert.equal(artifacts.timecodeXml?.includes('Cue 1.Part 1'), true);
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
        assert.equal(artifacts.macroXml.includes('Command="Set Sequence 101 Cue &quot;Intro&quot; CueFade 5"'), true);
        assert.equal(artifacts.macroXml.includes('Command="Set Sequence 102 Cue &quot;Start&quot; CueFade 6/12"'), true);
        assert.equal(artifacts.macroXml.includes('Command="Set Sequence 102 Cue &quot;Hit&quot; CueFade 3/"'), true);
        assert.equal(artifacts.macroXml.includes('Command="Set Sequence 103 Cue &quot;Start&quot; CueFade *2"'), true);
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
        assert.equal(artifacts.bumpSequences[0].displayName, "1 - Intro - BUMP - HIT");
        assert.equal(artifacts.bumpSequences[0].cues[0].name, "Start");
        assert.equal(artifacts.bumpSequences[0].events[0].cueName, "Start");
        assert.equal(artifacts.bumpSequences[0].events[1].cueName, "Start");
        assert.equal(artifacts.bumpSequences[1].color, "33554431");
        assert.equal(artifacts.bumpSequences[1].displayName, "1 - Verse - BUMP - HIT");
        assert.equal(artifacts.macroXml.includes('Command="Store Sequence 104 &quot;1 - Intro - BUMP - HIT&quot;"'), true);
        assert.equal(artifacts.macroXml.includes('Command="Store Sequence 105 &quot;1 - Verse - BUMP - HIT&quot;"'), true);
        assert.equal(artifacts.timecodeXml?.includes('ShowData.DataPools.Default.Sequences.1 - Intro - BUMP - HIT.Start'), true);
    });
});
//# sourceMappingURL=reaper2ma.test.js.map