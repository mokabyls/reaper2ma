const REQUIRED_HEADERS = ["#", "Name", "Start", "Color"];
const TIME_FIELDS = ["Start", "End", "Length"];
const SECONDS_VALUE_PATTERN = /^-?\d+(?:\.\d+)?$/;
export function validateReaperCsvRows(headers, rows) {
    const warnings = [];
    const normalizedHeaders = new Set(headers.map((header) => header.trim()));
    const missingHeaders = REQUIRED_HEADERS.filter((header) => !normalizedHeaders.has(header));
    const nonSecondTimestamp = findNonSecondTimestamp(rows);
    if (missingHeaders.length > 0) {
        warnings.push(`Le CSV ne contient pas la colonne ${formatHeaderList(missingHeaders)}. Vérifie l'export REAPER: les colonnes attendues sont #, Name, Start et Color.`);
    }
    if (nonSecondTimestamp) {
        const formatHint = hasMultipleDecimalSeparators(nonSecondTimestamp.value)
            ? "Les timestamps semblent être en mesures/temps plutôt qu'en secondes."
            : "Certaines valeurs de temps ne sont pas des secondes numériques.";
        warnings.push(`${formatHint} Exemple: ${nonSecondTimestamp.field}="${nonSecondTimestamp.value}" à la ligne ${nonSecondTimestamp.lineNumber}. Réexporte le CSV depuis REAPER avec l'unité de temps en secondes, sinon les régions et le timecode peuvent être mal alignés.`);
    }
    return warnings;
}
function findNonSecondTimestamp(rows) {
    for (const [index, row] of rows.entries()) {
        for (const field of TIME_FIELDS) {
            const value = row[field]?.trim();
            if (!value || SECONDS_VALUE_PATTERN.test(value)) {
                continue;
            }
            return {
                field,
                value,
                lineNumber: index + 2,
            };
        }
    }
    return undefined;
}
function hasMultipleDecimalSeparators(value) {
    return (value.match(/\./g) ?? []).length > 1;
}
function formatHeaderList(headers) {
    if (headers.length === 1) {
        return `"${headers[0]}"`;
    }
    return headers.map((header) => `"${header}"`).join(", ");
}
//# sourceMappingURL=csv-validation.js.map