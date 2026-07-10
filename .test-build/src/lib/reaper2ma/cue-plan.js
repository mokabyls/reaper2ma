export function createUniqueCuePlan(uniqueCues) {
    const seenNames = new Map();
    return uniqueCues.map((marker) => {
        const nextIndex = (seenNames.get(marker.displayName) ?? 0) + 1;
        seenNames.set(marker.displayName, nextIndex);
        return {
            ...marker,
            cueName: nextIndex === 1 ? marker.displayName : `${marker.displayName} ${nextIndex}`,
        };
    });
}
//# sourceMappingURL=cue-plan.js.map