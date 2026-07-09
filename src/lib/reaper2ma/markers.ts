import * as csv from "@vanillaes/csv";

import type { ConvertedMarker, ReaperMarkerRow, RepeatedSequence } from "./types.js";

const SAFE_MARKER_NAME_PATTERN = /[^a-zA-Z0-9äöüÄÖÜß \-_#%\/\(\)\[\]=+]/g;

export function sanitizeMarkerName(name: string): string {
    return name.replace(SAFE_MARKER_NAME_PATTERN, "");
}

export function parseReaperMarkerRows(dataString: string): ReaperMarkerRow[] {
    const parsedLines = csv.parse(dataString) as string[][];
    const header = parsedLines[0] ?? [];

    return parsedLines.slice(1).map((row) => {
        const obj: Record<string, string> = {};

        row.forEach((value, index) => {
            const key = header[index];
            if (key) {
                obj[key] = value;
            }
        });

        return {
            "#": obj["#"] ?? "",
            Name: obj.Name ?? "",
            Start: obj.Start ?? "",
            Color: obj.Color ?? "",
        };
    });
}

export function normalizeMarkerRows(rows: ReaperMarkerRow[]): ConvertedMarker[] {
    const seenNameCount: Record<string, number> = {};

    const sanitizedRows = rows.map((row) => {
        const name = sanitizeMarkerName(row.Name);
        seenNameCount[name] = (seenNameCount[name] || 0) + 1;

        return {
            name,
            start: row.Start,
            color: row.Color,
        };
    });

    const remainingNames = { ...seenNameCount };

    return sanitizedRows
        .slice()
        .reverse()
        .map((row) => {
            const remaining = remainingNames[row.name] ?? 0;

            if (remaining > 1) {
                remainingNames[row.name] = remaining - 1;
                return {
                    ...row,
                    name: `${row.name} ${remaining}`,
                };
            }

            return row;
        })
        .reverse();
}

export function splitMarkerRows(markers: ConvertedMarker[]): {
    uniqueCues: ConvertedMarker[];
    repeatedMarkers: ConvertedMarker[];
} {
    return {
        uniqueCues: markers.filter((marker) => !marker.color),
        repeatedMarkers: markers.filter((marker) => marker.color),
    };
}

export function groupRepeatedSequences(
    repeatedMarkers: ConvertedMarker[],
    prefix: string,
    sequenceNumber: number,
): RepeatedSequence[] {
    const repeatedSequences: RepeatedSequence[] = [];
    const sequencesByColor = new Map<string, RepeatedSequence>();
    let nextSequenceNumber = sequenceNumber + 1;

    for (const marker of repeatedMarkers) {
        const existing = sequencesByColor.get(marker.color);

        if (existing) {
            existing.timestamps.push(marker.start);
            continue;
        }

        const repeatedSequence: RepeatedSequence = {
            color: marker.color,
            name: `${prefix} - ${marker.name}`,
            timestamps: [marker.start],
            sequenceNumber: nextSequenceNumber++,
        };

        sequencesByColor.set(marker.color, repeatedSequence);
        repeatedSequences.push(repeatedSequence);
    }

    return repeatedSequences;
}
