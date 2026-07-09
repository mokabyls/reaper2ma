import * as csv from "@vanillaes/csv";
const SAFE_MARKER_NAME_PATTERN = /[^a-zA-Z0-9äöüÄÖÜß \-_#%\/\(\)\[\]=+]/g;
const EXECUTION_SUFFIX_PATTERN = /^(.*)\s\[(.+)\]$/;
const ALLOWED_EXECUTION_TOKENS = new Set(["Go+", "Go-", "Goto", "Load", "On", "Select", "Top", "Temp", "Flash"]);
export function sanitizeMarkerName(name) {
    return name.replace(SAFE_MARKER_NAME_PATTERN, "");
}
export function parseMarkerExecution(name) {
    const trimmedName = name.trim();
    const suffixMatch = trimmedName.match(EXECUTION_SUFFIX_PATTERN);
    if (!suffixMatch) {
        return {
            displayName: sanitizeMarkerName(trimmedName),
            execToken: "Goto",
        };
    }
    const displayName = sanitizeMarkerName(suffixMatch[1].trim());
    const execToken = normalizeExecutionToken(suffixMatch[2]);
    if (!execToken) {
        return {
            displayName,
            execToken: "Goto",
        };
    }
    return {
        displayName,
        execToken,
    };
}
function normalizeExecutionToken(token) {
    const parts = token.split("|").map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) {
        return undefined;
    }
    if (!parts.every((part) => ALLOWED_EXECUTION_TOKENS.has(part))) {
        return undefined;
    }
    return parts.join("|");
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
        const marker = parseMarkerExecution(row.Name);
        seenNameCount[marker.displayName] = (seenNameCount[marker.displayName] || 0) + 1;
        return {
            displayName: marker.displayName,
            execToken: marker.execToken,
            start: row.Start,
            color: row.Color,
        };
    });
    const remainingNames = { ...seenNameCount };
    return sanitizedRows
        .slice()
        .reverse()
        .map((row) => {
        const remaining = remainingNames[row.displayName] ?? 0;
        if (remaining > 1) {
            remainingNames[row.displayName] = remaining - 1;
            return {
                ...row,
                displayName: `${row.displayName} ${remaining}`,
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
            existing.events.push({
                timestamp: marker.start,
                execToken: marker.execToken,
            });
            continue;
        }
        const repeatedSequence = {
            color: marker.color,
            displayName: `${prefix} - ${marker.displayName}`,
            events: [
                {
                    timestamp: marker.start,
                    execToken: marker.execToken,
                },
            ],
            sequenceNumber: nextSequenceNumber++,
        };
        sequencesByColor.set(marker.color, repeatedSequence);
        repeatedSequences.push(repeatedSequence);
    }
    return repeatedSequences;
}
//# sourceMappingURL=markers.js.map