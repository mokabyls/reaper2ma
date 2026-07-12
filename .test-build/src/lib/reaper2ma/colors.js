const REAPER_COLOR_MASK = 0xFFFFFF;
const GRANDMA_APPEARANCE_COLOR = "1,1,1,0";
const GRANDMA_APPEARANCE_BACK_ALPHA = 221;
function parseReaperColorValue(color) {
    const trimmedColor = color.trim();
    if (!trimmedColor) {
        return undefined;
    }
    if (/^#[0-9a-f]{6}$/i.test(trimmedColor)) {
        return Number.parseInt(trimmedColor.slice(1), 16);
    }
    if (/^0x[0-9a-f]+$/i.test(trimmedColor)) {
        return Number.parseInt(trimmedColor.slice(2), 16);
    }
    if (/^[0-9a-f]{6}$/i.test(trimmedColor) && /[a-f]/i.test(trimmedColor)) {
        return Number.parseInt(trimmedColor, 16);
    }
    if (!/^\d+$/.test(trimmedColor)) {
        return undefined;
    }
    return Number.parseInt(trimmedColor, 10);
}
function convertReaperColorToRgb(color) {
    const parsedColor = parseReaperColorValue(color);
    if (parsedColor === undefined || !Number.isFinite(parsedColor)) {
        return undefined;
    }
    const rgb = parsedColor & REAPER_COLOR_MASK;
    return {
        red: (rgb >> 16) & 0xff,
        green: (rgb >> 8) & 0xff,
        blue: rgb & 0xff,
    };
}
export function convertReaperColorToGrandmaAppearanceColor(color) {
    const rgb = convertReaperColorToRgb(color);
    if (!rgb) {
        return undefined;
    }
    return `COLOR="${GRANDMA_APPEARANCE_COLOR}" BackR=${rgb.red} BackG=${rgb.green} BackB=${rgb.blue} BackAlpha=${GRANDMA_APPEARANCE_BACK_ALPHA}`;
}
export function convertReaperColorToCssColor(color) {
    const rgb = convertReaperColorToRgb(color);
    if (!rgb) {
        return undefined;
    }
    return `rgb(${rgb.red}, ${rgb.green}, ${rgb.blue})`;
}
export function createAppearanceNameFromReaperColor(color) {
    return `R2MA Color ${color.trim()}`;
}
//# sourceMappingURL=colors.js.map