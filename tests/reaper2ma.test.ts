import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { convertReaperCsvToArtifacts, createConversionOutputFiles } from "../src/lib/reaper2ma/converter.js";
import { buildOutputFileName, normalizeOutputBaseName } from "../src/lib/reaper2ma/filename.js";
import { groupRepeatedSequences, normalizeMarkerRows, parseMarkerExecution, parseReaperMarkerRows, sanitizeMarkerName, splitMarkerRows } from "../src/lib/reaper2ma/markers.js";
import type { ConversionSettings } from "../src/lib/reaper2ma/types.js";

const baseSettings: ConversionSettings = {
    sequenceNumber: 101,
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

    it("suffixes duplicate names in chronological order", () => {
        const markers = normalizeMarkerRows([
            { "#": "1", Name: "Intro!", Start: "0", Color: "" },
            { "#": "2", Name: "Intro!", Start: "1", Color: "" },
            { "#": "3", Name: "Crash", Start: "2", Color: "19005190" },
        ]);

        assert.deepEqual(
            markers.map((marker) => marker.displayName),
            ["Intro", "Intro 2", "Crash"],
        );
    });

    it("groups repeated markers by exact color and first appearance", () => {
        const repeatedSequences = groupRepeatedSequences(
            [
                { displayName: "SD", execToken: "Goto", start: "2", color: "19005190" },
                { displayName: "SD 2", execToken: "Temp|Flash", start: "3", color: "19005190" },
                { displayName: "Crash", execToken: "Flash", start: "4", color: "33554431" },
            ],
            "1",
            101,
        );

        assert.deepEqual(
            repeatedSequences.map((sequence) => ({
                color: sequence.color,
                displayName: sequence.displayName,
                sequenceNumber: sequence.sequenceNumber,
                events: sequence.events,
            })),
            [
                {
                    color: "19005190",
                    displayName: "1 - SD",
                    sequenceNumber: 102,
                    events: [
                        { timestamp: "2", execToken: "Goto" },
                        { timestamp: "3", execToken: "Temp|Flash" },
                    ],
                },
                {
                    color: "33554431",
                    displayName: "1 - Crash",
                    sequenceNumber: 103,
                    events: [{ timestamp: "4", execToken: "Flash" }],
                },
            ],
        );
    });
});

describe("conversion artifacts", () => {
    it("builds the expected XML artifacts from the fixture", () => {
        const artifacts = convertReaperCsvToArtifacts(fixtureCsv, "Song 01.CSV", baseSettings);

        assert.equal(artifacts.outputBaseName, "songcsv");
        assert.equal(artifacts.uniqueCues.length, 3);
        assert.equal(artifacts.repeatedSequences.length, 2);
        assert.equal(artifacts.timecodeXml?.includes('ShowData.DataPools.Default.Sequences.1 - SD'), true);
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
        const { uniqueCues, repeatedMarkers } = splitMarkerRows(normalizeMarkerRows(rows));

        assert.equal(uniqueCues.length, 3);
        assert.equal(repeatedMarkers.length, 3);
        assert.equal(uniqueCues[0].displayName, "Intro");
        assert.equal(uniqueCues[0].execToken, "Goto");
        assert.equal(repeatedMarkers[0].displayName, "SD");
        assert.equal(repeatedMarkers[1].execToken, "Goto");
    });

    it("uses the execution token from a bracket suffix in generated XML", () => {
        const csv = `#,Name,Start,Color
1,Intro [Temp|Flash],0,
2,SD [Flash],1,19005190
3,SD,2,19005190
`;
        const artifacts = convertReaperCsvToArtifacts(csv, "tokens.csv", baseSettings);

        assert.equal(artifacts.macroXml.includes('Label Sequence 101 Cue 1 &quot;Intro&quot;'), true);
        assert.equal(artifacts.timecodeXml?.includes('Name="Temp|Flash"'), true);
        assert.equal(artifacts.timecodeXml?.includes('ExecToken="Temp|Flash"'), true);
        assert.equal(artifacts.timecodeXml?.includes('ExecToken="Flash"'), true);
        assert.equal(artifacts.timecodeXml?.includes('ExecToken="Goto"'), true);
    });
});
