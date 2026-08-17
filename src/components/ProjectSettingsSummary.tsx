import { resolveInternalTimecodeSlot } from "../lib/reaper2ma/index.js";
import type { ProjectDocumentV1, ProjectStage } from "../lib/projects/index.js";
import { useI18n } from "../i18n.js";

type SummaryItem = { label: string; value: string; enabled?: boolean };
type SummaryGroup = { title: string; stage: ProjectStage; items: SummaryItem[] };

export function ProjectSettingsSummary({ project, executorAssignmentCount, onEdit }: { project: ProjectDocumentV1; executorAssignmentCount?: number; onEdit?: (stage: ProjectStage) => void }) {
    const { t } = useI18n();
    const settings = project.settings;
    const yesNo = (value: boolean) => value ? t("summary.yes") : t("summary.no");
    const regionMode = settings.importMode === "regions-and-markers";
    const extrasUseSlots = settings.exportShowTimeMacros || settings.exportTimecodeControlMacros;

    const cueItems: SummaryItem[] = [
        { label: t("summary.importMode"), value: regionMode ? t("summary.perRegion") : t("summary.classic") },
        { label: t("cues.start"), value: String(settings.cueStartNumber) },
    ];
    if (regionMode) {
        cueItems.push(
            { label: t("cues.regionEnd"), value: `${settings.regionEndPreRollMs} ms` },
            { label: t("cues.layerPreRollEnabled"), value: yesNo(settings.regionLayerPreRollEnabled), enabled: settings.regionLayerPreRollEnabled },
            ...(settings.regionLayerPreRollEnabled ? [{ label: t("cues.layerPreRoll"), value: `${settings.regionLayerPreRollMs} ms` }] : []),
            { label: t("cues.autoOff"), value: yesNo(settings.autoOffRegionLayers), enabled: settings.autoOffRegionLayers },
        );
    }

    const outputItems: SummaryItem[] = [
        { label: t("summary.exportMode"), value: settings.exportMode === "cues-and-timecode" ? t("output.full") : t("output.cues") },
        { label: t("output.timecodeNumber"), value: settings.exportMode === "cues-and-timecode" ? String(settings.timecodeNumber) : t("summary.notCreated") },
        { label: t("output.incomingSlot"), value: `TCSlot ${settings.externalTimecodeSlot}` },
    ];

    const executorItems: SummaryItem[] = [
        { label: t("executors.assign"), value: yesNo(settings.assignExecutors), enabled: settings.assignExecutors },
    ];
    if (settings.assignExecutors) {
        executorItems.push(
            { label: t("summary.executorLayout"), value: (settings.executorLayout ?? "continuous") === "region-per-page" ? t("executors.regionPerPage") : t("summary.continuous") },
            { label: t("executors.page"), value: `Page ${settings.pageNumber}` },
            { label: t("executors.main"), value: String(settings.pageSlotStart) },
            { label: t("executors.bump"), value: String(settings.bumpPageSlotStart) },
            ...(executorAssignmentCount === undefined ? [] : [{ label: t("summary.assignments"), value: String(executorAssignmentCount) }]),
        );
    }

    const extrasItems: SummaryItem[] = [
        { label: t("extras.showTime"), value: yesNo(settings.exportShowTimeMacros), enabled: settings.exportShowTimeMacros },
        { label: t("extras.timecodeControl"), value: yesNo(settings.exportTimecodeControlMacros), enabled: settings.exportTimecodeControlMacros },
        { label: t("extras.reaper"), value: yesNo(settings.includeReaperTransportMacros), enabled: settings.includeReaperTransportMacros },
    ];
    if (extrasUseSlots) {
        extrasItems.push(
            { label: t("extras.version"), value: settings.grandmaVersion },
            { label: t("extras.internalSlot"), value: `TCSlot ${resolveInternalTimecodeSlot(settings.grandmaVersion)}` },
            { label: t("extras.ltcSlot"), value: `TCSlot ${settings.externalTimecodeSlot}` },
        );
    }
    if (settings.includeReaperTransportMacros) {
        extrasItems.push(
            { label: t("extras.oscSlot"), value: String(settings.transportOscSlotId) },
            { label: t("extras.oscName"), value: settings.transportOscDataName || "—" },
            { label: t("extras.macroPrefix"), value: settings.transportMacroNamePrefix || "—" },
            { label: t("extras.outputFile"), value: settings.transportOutputFileName || "—" },
        );
    }

    const groups: SummaryGroup[] = [
        { title: t("summary.cuesRegions"), stage: "cues", items: cueItems },
        { title: t("summary.sequences"), stage: "sequences", items: [
            { label: t("sequences.number"), value: String(settings.sequenceNumber) },
            { label: t("sequences.namePrefix"), value: settings.sequenceNamePrefix || "—" },
            { label: t("sequences.repeatPrefix"), value: settings.prefix || "—" },
            { label: t("sequences.appearance"), value: String(settings.appearanceStartNumber) },
            { label: t("sequences.speed"), value: settings.speedMaster },
        ] },
        { title: t("summary.output"), stage: "output", items: outputItems },
        { title: t("summary.executors"), stage: "executors", items: executorItems },
        { title: t("summary.extras"), stage: "extras", items: extrasItems },
    ];

    return <section className="complete-settings-summary" aria-labelledby="complete-settings-title"><header><div><h3 id="complete-settings-title">{t("summary.title")}</h3><p>{t("summary.copy")}</p></div></header><div className="settings-summary-groups">{groups.map((group) => <section className="settings-summary-group" key={group.stage}><header><h4>{group.title}</h4>{onEdit ? <button className="text-button" type="button" onClick={() => onEdit(group.stage)} aria-label={`${t("action.edit")} · ${group.title}`}>{t("action.edit")}</button> : null}</header><dl>{group.items.map((item) => <div className="settings-summary-row" key={item.label}><dt>{item.label}</dt><dd className={item.enabled === undefined ? undefined : item.enabled ? "is-enabled" : "is-disabled"}>{item.value}</dd></div>)}</dl></section>)}</div></section>;
}
