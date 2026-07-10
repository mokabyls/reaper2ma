export function normalizeOutputBaseName(fileName) {
    return fileName.replace(".csv", "").toLowerCase().replace(/[^a-z]/g, "");
}
export function buildOutputFileName(baseName, suffix) {
    return `${baseName}_${suffix}.xml`;
}
export function stripFileExtension(fileName) {
    return fileName.replace(/\.[^.]+$/, "");
}
//# sourceMappingURL=filename.js.map