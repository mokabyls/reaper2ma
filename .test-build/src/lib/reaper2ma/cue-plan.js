export function createUniqueCuePlan(uniqueCues) {
    const seenNames = new Map();
    return uniqueCues.map((marker, index) => {
        const hasDisplayName = marker.displayName.trim().length > 0;
        const baseName = hasDisplayName ? marker.displayName : `Cue ${index + 1}`;
        const nextIndex = hasDisplayName ? (seenNames.get(baseName) ?? 0) + 1 : 1;
        if (hasDisplayName) {
            seenNames.set(baseName, nextIndex);
        }
        return {
            ...marker,
            cueName: hasDisplayName ? (nextIndex === 1 ? baseName : `${baseName} ${nextIndex}`) : baseName,
        };
    });
}
//# sourceMappingURL=cue-plan.js.map