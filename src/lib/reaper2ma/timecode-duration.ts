import type { BpmSequence, BumpSequence, ConvertedMarker, RegionSequence, RepeatedSequence } from "./types.js";

export function collectTimecodeTimestamps(
    uniqueCues: ConvertedMarker[],
    regionSequences: RegionSequence[],
    repeatedSequences: RepeatedSequence[],
    bumpSequences: BumpSequence[],
    bpmSequence?: BpmSequence,
): string[] {
    return [
        ...uniqueCues.map((cue) => cue.start),
        ...regionSequences.flatMap((sequence) => sequence.events.map((event) => event.timestamp)),
        ...repeatedSequences.flatMap((sequence) => sequence.events.map((event) => event.timestamp)),
        ...bumpSequences.flatMap((sequence) => sequence.events.map((event) => event.timestamp)),
        ...(bpmSequence?.events.map((event) => event.timestamp) ?? []),
    ].filter((timestamp) => timestamp !== "");
}

export function calculateTimecodeDuration(timestamps: string[]): string {
    if (timestamps.length === 0) {
        return "0.00";
    }

    const maxTimestamp = timestamps.reduce((max, value) => {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
    }, 0);

    return (maxTimestamp + 1).toFixed(3);
}
