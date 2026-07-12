export const DEFAULT_REGION_END_PRE_ROLL_MS = 750;
export const MIN_REGION_END_PRE_ROLL_MS = 0;
export const MAX_REGION_END_PRE_ROLL_MS = 5000;
export function resolveSpeedMaster(speedMasterNumber) {
    if (!Number.isInteger(speedMasterNumber) || speedMasterNumber < 1 || speedMasterNumber > 15) {
        throw new RangeError("Speed Master must be an integer from 1 to 15.");
    }
    return `3.${speedMasterNumber}`;
}
export function clampRegionEndPreRollMs(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return DEFAULT_REGION_END_PRE_ROLL_MS;
    }
    return Math.min(MAX_REGION_END_PRE_ROLL_MS, Math.max(MIN_REGION_END_PRE_ROLL_MS, Math.trunc(numericValue)));
}
//# sourceMappingURL=settings.js.map