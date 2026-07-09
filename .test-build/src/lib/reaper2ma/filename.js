export function normalizeOutputBaseName(fileName) {
    return fileName.replace(".csv", "").toLowerCase().replace(/[^a-z]/g, "");
}
export function buildOutputFileName(baseName, suffix) {
    return `${baseName}_${suffix}.xml`;
}
//# sourceMappingURL=filename.js.map