export function collectTimecodeTimestamps(uniqueCues, regionSequences, repeatedSequences, bumpSequences, bpmSequence) {
    return [
        ...uniqueCues.map((cue) => cue.start),
        ...regionSequences.flatMap((sequence) => sequence.events.map((event) => event.timestamp)),
        ...repeatedSequences.flatMap((sequence) => sequence.events.map((event) => event.timestamp)),
        ...bumpSequences.flatMap((sequence) => sequence.events.map((event) => event.timestamp)),
        ...(bpmSequence?.events.flatMap((event) => [event.timestamp, offsetTimestampByMilliseconds(event.timestamp, 500)]) ?? []),
    ].filter((timestamp) => timestamp !== "");
}
export function calculateTimecodeDuration(timestamps) {
    if (timestamps.length === 0) {
        return "0.00";
    }
    const maxTimestamp = timestamps.reduce((max, value) => {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
    }, 0);
    return (maxTimestamp + 1).toFixed(3);
}
function offsetTimestampByMilliseconds(timestamp, milliseconds) {
    const parsedTimestamp = Number.parseFloat(timestamp);
    if (!Number.isFinite(parsedTimestamp)) {
        return timestamp;
    }
    return (parsedTimestamp + milliseconds / 1000).toFixed(3);
}
//# sourceMappingURL=timecode-duration.js.map