export function createCueTimingProvider(family) {
    const allowedAxes = new Set(["X", "Y", "Z"]);
    return {
        id: family.id,
        supports(tag) {
            const normalizedKey = tag.key.toUpperCase();
            return (normalizedKey.startsWith(family.prefix) &&
                normalizedKey.length === family.prefix.length + 1 &&
                allowedAxes.has(normalizedKey.slice(family.prefix.length)));
        },
        apply(tag, state) {
            if (tag.value === null) {
                return;
            }
            const normalizedKey = tag.key.toUpperCase();
            const axis = normalizedKey.slice(family.prefix.length);
            const value = tag.value.trim();
            if (!value) {
                return;
            }
            const cueTimingTag = {
                key: `${family.keyPrefix}${axis}`,
                value,
            };
            if (!state.cueTiming.some((existing) => existing.key === cueTimingTag.key)) {
                state.cueTiming.push(cueTimingTag);
            }
        },
    };
}
//# sourceMappingURL=cue-timing-utils.js.map