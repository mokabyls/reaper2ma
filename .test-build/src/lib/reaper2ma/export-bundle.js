import { createConversionOutputFiles } from "./converter.js";
import { createExampleMacroPresetOutputFiles } from "./macro-presets.js";
import { createReaperTransportMacroOutputFile } from "./transport-macros.js";
export function createExportBundleFiles(options) {
    const files = [
        ...createConversionOutputFiles(options.conversionArtifacts).map(({ name, content }) => ({
            name,
            content,
        })),
        ...createExampleMacroPresetOutputFiles({
            sourceFileName: options.sourceFileName,
            timecodeName: options.timecodeName,
            selection: options.macroPresetSelection,
        }).map(({ name, content }) => ({
            name,
            content,
        })),
    ];
    if (options.includeReaperTransportMacros) {
        const transportFile = createReaperTransportMacroOutputFile(options.transportMacroOptions);
        files.push({
            name: transportFile.name,
            content: transportFile.content,
        });
    }
    return files;
}
export function createExportBundleFileNames(options) {
    return createExportBundleFiles(options).map((file) => file.name);
}
//# sourceMappingURL=export-bundle.js.map