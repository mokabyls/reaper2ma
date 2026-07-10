import type { ConvertedMarker } from "./types.js";

export function createUniqueCuePlan(uniqueCues: ConvertedMarker[]): Array<ConvertedMarker & { cueName: string }> {
    const seenNames = new Map<string, number>();

    return uniqueCues.map((marker) => {
        const nextIndex = (seenNames.get(marker.displayName) ?? 0) + 1;
        seenNames.set(marker.displayName, nextIndex);

        return {
            ...marker,
            cueName: nextIndex === 1 ? marker.displayName : `${marker.displayName} ${nextIndex}`,
        };
    });
}
