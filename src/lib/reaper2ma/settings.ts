export function resolveSpeedMaster(speedMasterNumber: number): string {
    if (!Number.isInteger(speedMasterNumber) || speedMasterNumber < 1 || speedMasterNumber > 15) {
        throw new RangeError("Speed Master must be an integer from 1 to 15.");
    }

    return `3.${speedMasterNumber}`;
}
