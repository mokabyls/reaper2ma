export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
export function downloadTextFile(content, filename, mimeType = "application/xml") {
    const blob = new Blob([content], { type: mimeType });
    downloadBlob(blob, filename);
}
//# sourceMappingURL=download.js.map