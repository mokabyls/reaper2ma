import { applySequenceNamePrefix } from "./sequence-services.js";
import type { ConversionArtifacts, ConversionSettings } from "./types.js";

export type ExecutorSlotGroup = "main" | "bump";

export type ExecutorPlanItem = {
    localSequenceNumber: number;
    finalSequenceNumber: number;
    displayName: string;
    assignToExecutor: boolean;
    executorSlotGroup: ExecutorSlotGroup;
    executorRegionId?: string;
    regionLabel?: string;
};

export type ExecutorAssignment = {
    localSequenceNumber: number;
    sequenceNumber: number;
    sequenceName: string;
    pageNumber: number;
    slotNumber: number;
    slotGroup: ExecutorSlotGroup;
    regionId?: string;
    regionLabel?: string;
};

export function createExecutorAssignmentPlan(settings: ConversionSettings, sequences: ExecutorPlanItem[]): ExecutorAssignment[] {
    if (settings.assignExecutors === false) return [];

    const layout = settings.executorLayout ?? "continuous";
    const regionPages = new Map<string, number>();

    if (layout === "region-per-page") {
        for (const sequence of sequences) {
            if (sequence.executorRegionId && !regionPages.has(sequence.executorRegionId)) {
                regionPages.set(sequence.executorRegionId, settings.pageNumber + regionPages.size);
            }
        }
    }

    const offsets = new Map<string, number>();

    return sequences.flatMap((sequence) => {
        if (!sequence.assignToExecutor) return [];

        const pageNumber = sequence.executorRegionId ? (regionPages.get(sequence.executorRegionId) ?? settings.pageNumber) : settings.pageNumber;
        const offsetKey = layout === "region-per-page" ? `${pageNumber}:${sequence.executorSlotGroup}` : sequence.executorSlotGroup;
        const offset = offsets.get(offsetKey) ?? 0;
        const slotStart = sequence.executorSlotGroup === "bump" ? settings.bumpPageSlotStart : settings.pageSlotStart;
        offsets.set(offsetKey, offset + 1);

        return [{
            localSequenceNumber: sequence.localSequenceNumber,
            sequenceNumber: sequence.finalSequenceNumber,
            sequenceName: sequence.displayName,
            pageNumber,
            slotNumber: slotStart + offset,
            slotGroup: sequence.executorSlotGroup,
            ...(sequence.executorRegionId ? { regionId: sequence.executorRegionId } : {}),
            ...(sequence.regionLabel ? { regionLabel: sequence.regionLabel } : {}),
        }];
    });
}

export function createExecutorAssignmentPreview(artifacts: ConversionArtifacts, settings: ConversionSettings): ExecutorAssignment[] {
    const sequences: ExecutorPlanItem[] = [];
    const add = (sequence: Omit<ExecutorPlanItem, "localSequenceNumber" | "assignToExecutor"> & { assignToExecutor?: boolean }) => {
        sequences.push({ localSequenceNumber: sequences.length + 1, assignToExecutor: sequence.assignToExecutor ?? true, ...sequence });
    };

    if (artifacts.uniqueCues.length > 0) {
        add({
            finalSequenceNumber: settings.sequenceNumber,
            displayName: applySequenceNamePrefix(`Sequence ${settings.sequenceNumber}`, settings.sequenceNamePrefix),
            executorSlotGroup: "main",
        });
    }

    for (const region of artifacts.regionSequences) {
        add({
            finalSequenceNumber: region.sequenceNumber,
            displayName: region.displayName,
            executorSlotGroup: "main",
            executorRegionId: region.regionId,
            regionLabel: region.regionLabel,
        });

        for (const layer of artifacts.regionLayerSequences.filter((candidate) => candidate.regionId === region.regionId)) {
            add({
                finalSequenceNumber: layer.sequenceNumber,
                displayName: layer.displayName,
                executorSlotGroup: "main",
                executorRegionId: layer.regionId,
                regionLabel: layer.regionLabel,
            });
        }
    }

    for (const repeated of artifacts.repeatedSequences) {
        add({ finalSequenceNumber: repeated.sequenceNumber, displayName: repeated.displayName, executorSlotGroup: "main" });
    }

    for (const bump of artifacts.bumpSequences) {
        add({
            finalSequenceNumber: bump.sequenceNumber,
            displayName: bump.displayName,
            executorSlotGroup: "bump",
            ...(bump.regionId ? { executorRegionId: bump.regionId } : {}),
            ...(bump.regionLabel ? { regionLabel: bump.regionLabel } : {}),
        });
    }

    return createExecutorAssignmentPlan(settings, sequences);
}
