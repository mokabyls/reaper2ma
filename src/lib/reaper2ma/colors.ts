const REAPER_COLOR_MASK = 0xFFFFFF;
const MAX_COLOR_CHANNEL = 255;

function formatGrandmaColorChannel(channel: number): string {
    return (Math.round((channel / MAX_COLOR_CHANNEL) * 1000) / 10).toFixed(1);
}

function parseReaperColorValue(color: string): number | undefined {
    const trimmedColor = color.trim();

    if (!trimmedColor) {
        return undefined;
    }

    if (/^0x[0-9a-f]+$/i.test(trimmedColor)) {
        return Number.parseInt(trimmedColor.slice(2), 16);
    }

    if (!/^\d+$/.test(trimmedColor)) {
        return undefined;
    }

    return Number.parseInt(trimmedColor, 10);
}

export function convertReaperColorToGrandmaAppearanceColor(color: string): string | undefined {
    const parsedColor = parseReaperColorValue(color);

    if (parsedColor === undefined || !Number.isFinite(parsedColor)) {
        return undefined;
    }

    const rgb = parsedColor & REAPER_COLOR_MASK;
    const red = formatGrandmaColorChannel((rgb >> 16) & 0xff);
    const green = formatGrandmaColorChannel((rgb >> 8) & 0xff);
    const blue = formatGrandmaColorChannel(rgb & 0xff);

    return `${red},${green},${blue},100.0`;
}

export function createAppearanceNameFromReaperColor(color: string): string {
    return `R2MA Color ${color.trim()}`;
}
