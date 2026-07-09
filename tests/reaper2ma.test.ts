import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { convertReaperCsvToArtifacts, createConversionOutputFiles } from "../src/lib/reaper2ma/converter.js";
import { buildOutputFileName, normalizeOutputBaseName } from "../src/lib/reaper2ma/filename.js";
import { groupRepeatedSequences, normalizeMarkerRows, parseReaperMarkerRows, sanitizeMarkerName, splitMarkerRows } from "../src/lib/reaper2ma/markers.js";
import type { ConversionSettings } from "../src/lib/reaper2ma/types.js";

const baseSettings: ConversionSettings = {
    sequenceNumber: 101,
    driveNumber: 2,
    cueStartNumber: 1,
    prefix: "1",
    exportMode: "cues-and-timecode",
};

const fixtureCsv = readFileSync(new URL("../../tests/fixtures/basic.csv", import.meta.url), "utf8");

describe("marker normalization", () => {
    it("preserves allowed marker characters and removes unsupported ones", () => {
        assert.equal(sanitizeMarkerName('Crash! "Main" / Intro'), "Crash Main / Intro");
    });

    it("suffixes duplicate names in chronological order", () => {
        const markers = normalizeMarkerRows([
            { "#": "1", Name: "Intro!", Start: "0", Color: "" },
            { "#": "2", Name: "Intro!", Start: "1", Color: "" },
            { "#": "3", Name: "Crash", Start: "2", Color: "19005190" },
        ]);

        assert.deepEqual(
            markers.map((marker) => marker.name),
            ["Intro", "Intro 2", "Crash"],
        );
    });

    it("groups repeated markers by exact color and first appearance", () => {
        const repeatedSequences = groupRepeatedSequences(
            [
                { name: "SD", start: "2", color: "19005190" },
                { name: "SD 2", start: "3", color: "19005190" },
                { name: "Crash", start: "4", color: "33554431" },
            ],
            "1",
            101,
        );

        assert.deepEqual(
            repeatedSequences.map((sequence) => ({
                color: sequence.color,
                name: sequence.name,
                sequenceNumber: sequence.sequenceNumber,
                timestamps: sequence.timestamps,
            })),
            [
                {
                    color: "19005190",
                    name: "1 - SD",
                    sequenceNumber: 102,
                    timestamps: ["2", "3"],
                },
                {
                    color: "33554431",
                    name: "1 - Crash",
                    sequenceNumber: 103,
                    timestamps: ["4"],
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
        assert.equal(artifacts.macroXml.includes('Command="Store Sequence 102 &quot;1 - SD&quot;"'), true);
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
        assert.equal(uniqueCues[0].name, "Intro");
        assert.equal(repeatedMarkers[0].name, "SD");
    });
});
