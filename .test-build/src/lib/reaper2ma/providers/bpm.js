const BPM_VALUE_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
export const bpmTagProvider = {
    id: "bpm",
    supports(tag) {
        return tag.key.toUpperCase() === "BPM";
    },
    apply(tag, state) {
        if (tag.value === null) {
            return;
        }
        const value = tag.value.trim();
        if (!isValidBpmValue(value)) {
            return;
        }
        if (state.bpm === undefined) {
            state.bpm = Number.parseFloat(value);
            state.bpmText = value;
        }
    },
};
function isValidBpmValue(value) {
    return BPM_VALUE_PATTERN.test(value) && Number.parseFloat(value) > 0;
}
//# sourceMappingURL=bpm.js.map