import * as csv from "@vanillaes/csv";
const SAFE_MARKER_NAME_PATTERN = /[^a-zA-Z0-9äöüÄÖÜß \-_#%\/\(\)\[\]=+]/g;
export function sanitizeMarkerName(name) {
    return name.replace(SAFE_MARKER_NAME_PATTERN, "");
}
export function parseReaperMarkerRows(dataString) {
    const parsedLines = csv.parse(dataString);
    const header = parsedLines[0] ?? [];
    return parsedLines.slice(1).map((row) => {
        const obj = {};
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
export function normalizeMarkerRows(rows) {
    const seenNameCount = {};
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
export function splitMarkerRows(markers) {
    return {
        uniqueCues: markers.filter((marker) => !marker.color),
        repeatedMarkers: markers.filter((marker) => marker.color),
    };
}
export function groupRepeatedSequences(repeatedMarkers, prefix, sequenceNumber) {
    const repeatedSequences = [];
    const sequencesByColor = new Map();
    let nextSequenceNumber = sequenceNumber + 1;
    for (const marker of repeatedMarkers) {
        const existing = sequencesByColor.get(marker.color);
        if (existing) {
            existing.timestamps.push(marker.start);
            continue;
        }
        const repeatedSequence = {
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
//# sourceMappingURL=markers.js.map