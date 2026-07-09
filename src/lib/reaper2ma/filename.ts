export function normalizeOutputBaseName(fileName: string): string {
    return fileName.replace(".csv", "").toLowerCase().replace(/[^a-z]/g, "");
}

export function buildOutputFileName(baseName: string, suffix: string): string {
    return `${baseName}_${suffix}.xml`;
}
