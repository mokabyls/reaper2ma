<script lang="ts">
    import { onDestroy, onMount, tick } from "svelte";
    import {
        convertReaperCsvToArtifacts,
        createConversionPreview,
        createExportBundleFiles,
        createTimestampedZipFileName,
        createTimelinePreview,
        createZipArchiveBlob,
        downloadBlob,
        exampleMacroPresetGroups,
        parseReaperMarkerRows,
        clampRegionEndPreRollMs,
        clampRegionLayerPreRollMs,
        DEFAULT_AUTO_OFF_REGION_LAYERS,
        DEFAULT_REGION_END_PRE_ROLL_MS,
        DEFAULT_REGION_LAYER_PRE_ROLL_ENABLED,
        DEFAULT_REGION_LAYER_PRE_ROLL_MS,
        MAX_REGION_END_PRE_ROLL_MS,
        MAX_REGION_LAYER_PRE_ROLL_MS,
        MIN_REGION_END_PRE_ROLL_MS,
        MIN_REGION_LAYER_PRE_ROLL_MS,
        resolveExampleMacroTimecodeName,
        resolveSpeedMaster,
        stripFileExtension,
        type ConversionArtifacts,
        type ConversionPreview,
        type ConversionSettings,
        type ImportMode,
        type ExportMode,
        type ExampleMacroPresetSelection,
        type ReaperMacroGeneratorOptions,
        type TimelinePreview,
    } from "$lib/reaper2ma/index.js";

    let fileInput: HTMLInputElement;
    let uploadArea: HTMLElement;
    let timelineScrollContainer: HTMLDivElement | undefined = undefined;
    let activeStep = 1;
    let selectedCsvText = "";
    let selectedMarkerCount = 0;
    let sequenceNumber = 9001;
    let appearanceStartNumber = 9001;
    let sequenceNamePrefix = "MA";
    let timecodeNumber = 1;
    let pageNumber = 1;
    let pageSlotStart = 201;
    let bumpPageSlotStart = 101;
    let cueStartNumber = 1;
    let regionEndPreRollMs = DEFAULT_REGION_END_PRE_ROLL_MS;
    let autoOffRegionLayers = DEFAULT_AUTO_OFF_REGION_LAYERS;
    let regionLayerPreRollEnabled = DEFAULT_REGION_LAYER_PRE_ROLL_ENABLED;
    let regionLayerPreRollMs = DEFAULT_REGION_LAYER_PRE_ROLL_MS;
    let speedMasterNumber = 4;
    let resolvedSpeedMaster = "3.4";
    let prefix = "1";
    let importMode: ImportMode = "markers-only";
    let exportMode: ExportMode = "cues-and-timecode";
    let timecodeName = "";
    let exportShowTimeMacros = false;
    let exportTimecodeControlMacros = false;
    let includeReaperTransportMacros = false;
    let transportOscSlotId = 1;
    let transportOscDataName = "REAPER";
    let transportMacroNamePrefix = "REAPER - ";
    let transportOutputFileName = "reaper_transport_macros.xml";
    let isDragOver = false;
    let isProcessing = false;
    let isUsageModalOpen = false;
    let processingStatus = "";
    let exportStatus = "";
    let processingCompleted = false;
    let selectedFileName = "";
    let selectedFileBaseName = "";
    let resolvedExampleMacroTimecodeName = "";
    let selectedZipFileNames: string[] = [];
    let executorPreviewRows: ExecutorPreviewRow[] = [];
    let timelinePreview: TimelinePreview | undefined = undefined;
    let filteredTimelineTracks: TimelinePreview["tracks"] = [];
    let markerSearchMatches: TimelineMarkerSearchMatch[] = [];
    let markerSearchMatchKeys = new Set<string>();
    let timelineViewMode: TimelineViewMode = "graphic";
    let timelineCursorSeconds = 0;
    let timelineDurationSeconds = 0;
    let timelineCursorPercent = 0;
    let timelinePadRows: TimelinePadRow[] = [];
    let canControlTimeline = false;
    let isTimelinePlaying = false;
    let timelinePlaybackRate = 1;
    let timelineAnimationFrameId: number | undefined = undefined;
    let timelinePlaybackStartedAt = 0;
    let timelinePlaybackStartSeconds = 0;
    let sequenceFilter = "";
    let markerSearchQuery = "";
    let lastMarkerSearchQuery = "";
    let activeMarkerMatchIndex = 0;
    let collapsedTimelineTrackIds: Record<string, boolean> = {};
    let collapsedTimelineTrackIdSet = new Set<string>();
    let activeMarkerMatch: TimelineMarkerSearchMatch | undefined = undefined;
    let activeMarkerMatchKey = "";
    let activeMarkerFocusKey = "";
    let timelineMinWidth = 720;
    let hasLoadedPersistedSettings = false;
    let settingsPersistenceStatus = "Settings are saved locally in this browser.";
    let conversionSettings: ConversionSettings = {
        sequenceNumber,
        appearanceStartNumber,
        sequenceNamePrefix,
        timecodeNumber,
        pageNumber,
        pageSlotStart,
        bumpPageSlotStart,
        cueStartNumber,
        regionEndPreRollMs,
        autoOffRegionLayers,
        regionLayerPreRollEnabled,
        regionLayerPreRollMs,
        speedMaster: resolvedSpeedMaster,
        prefix,
        importMode,
        exportMode,
    };
    let conversionArtifacts: ConversionArtifacts | undefined = undefined;
    let conversionPreview: ConversionPreview | undefined = undefined;

    const showTimePresetGroup = exampleMacroPresetGroups.find((group) => group.id === "show-time");
    const timecodeControlPresetGroup = exampleMacroPresetGroups.find((group) => group.id === "timecode-control");
    const TIMELINE_PAD_FLASH_SECONDS = 1.35;
    const TIMELINE_TIME_EPSILON = 0.001;
    const SETTINGS_STORAGE_KEY = "reaper2ma:settings:v1";
    const SETTINGS_STORAGE_VERSION = 1;
    const wizardSteps = [
        {
            id: 1,
            label: "Import CSV",
            description: "Upload the Reaper marker export.",
        },
        {
            id: 2,
            label: "Settings",
            description: "Tune sequence numbers, import mode and export mode.",
        },
        {
            id: 3,
            label: "Summary",
            description: "Review what will be generated.",
        },
        {
            id: 4,
            label: "Extras",
            description: "Optional preset exports and help.",
        },
    ] as const;

    type PersistedUserSettings = {
        version: number;
        sequenceNumber: number;
        appearanceStartNumber: number;
        sequenceNamePrefix: string;
        timecodeNumber: number;
        pageNumber: number;
        pageSlotStart: number;
        bumpPageSlotStart: number;
        cueStartNumber: number;
        regionEndPreRollMs: number;
        autoOffRegionLayers: boolean;
        regionLayerPreRollEnabled: boolean;
        regionLayerPreRollMs: number;
        speedMasterNumber: number;
        prefix: string;
        importMode: ImportMode;
        exportMode: ExportMode;
        timecodeName: string;
        exportShowTimeMacros: boolean;
        exportTimecodeControlMacros: boolean;
        includeReaperTransportMacros: boolean;
        transportOscSlotId: number;
        transportOscDataName: string;
        transportMacroNamePrefix: string;
        transportOutputFileName: string;
    };

    type PersistedUserSettingsRecord = Partial<Record<keyof PersistedUserSettings, unknown>>;

    $: persistedSettingsSnapshot = {
        version: SETTINGS_STORAGE_VERSION,
        sequenceNumber,
        appearanceStartNumber,
        sequenceNamePrefix,
        timecodeNumber,
        pageNumber,
        pageSlotStart,
        bumpPageSlotStart,
        cueStartNumber,
        regionEndPreRollMs: clampRegionEndPreRollMs(regionEndPreRollMs),
        autoOffRegionLayers,
        regionLayerPreRollEnabled,
        regionLayerPreRollMs: clampRegionLayerPreRollMs(regionLayerPreRollMs),
        speedMasterNumber: clampSpeedMasterNumber(speedMasterNumber),
        prefix,
        importMode,
        exportMode,
        timecodeName,
        exportShowTimeMacros,
        exportTimecodeControlMacros,
        includeReaperTransportMacros,
        transportOscSlotId,
        transportOscDataName,
        transportMacroNamePrefix,
        transportOutputFileName,
    } satisfies PersistedUserSettings;
    $: if (hasLoadedPersistedSettings) {
        savePersistedSettings(persistedSettingsSnapshot);
    }
    $: resolvedExampleMacroTimecodeName = resolveExampleMacroTimecodeName(timecodeName, selectedFileBaseName);
    $: conversionSettings = {
        sequenceNumber,
        appearanceStartNumber,
        sequenceNamePrefix,
        timecodeNumber,
        pageNumber,
        pageSlotStart,
        bumpPageSlotStart,
        cueStartNumber,
        regionEndPreRollMs: clampRegionEndPreRollMs(regionEndPreRollMs),
        autoOffRegionLayers,
        regionLayerPreRollEnabled,
        regionLayerPreRollMs: clampRegionLayerPreRollMs(regionLayerPreRollMs),
        speedMaster: resolvedSpeedMaster,
        prefix,
        importMode,
        exportMode,
    };
    $: conversionArtifacts =
        selectedCsvText && selectedFileName
            ? convertReaperCsvToArtifacts(selectedCsvText, selectedFileName, conversionSettings)
            : undefined;
    $: conversionPreview = conversionArtifacts ? createConversionPreview(conversionArtifacts, selectedMarkerCount) : undefined;
    $: timelinePreview = conversionArtifacts ? createTimelinePreview(conversionArtifacts, conversionSettings) : undefined;
    $: filteredTimelineTracks = timelinePreview ? filterTimelineTracks(timelinePreview.tracks, sequenceFilter) : [];
    $: timelineDurationSeconds = timelinePreview?.durationSeconds ?? 0;
    $: canControlTimeline = Boolean(timelinePreview?.enabled && timelinePreview.tracks.length && timelineDurationSeconds > 0);
    $: if (!canControlTimeline && isTimelinePlaying) {
        pauseTimelinePlayback();
    }
    $: if (!timelinePreview && timelineCursorSeconds !== 0) {
        setTimelineCursorSeconds(0);
    }
    $: if (timelineCursorSeconds > timelineDurationSeconds) {
        setTimelineCursorSeconds(timelineDurationSeconds);
    }
    $: timelineCursorPercent = calculateTimelineCursorPercent(timelineCursorSeconds, timelineDurationSeconds);
    $: timelinePadRows = createTimelinePadRows(filteredTimelineTracks, timelineCursorSeconds);
    $: markerSearchMatches = createMarkerSearchMatches(filteredTimelineTracks, markerSearchQuery);
    $: markerSearchMatchKeys = new Set(markerSearchMatches.map((match) => createMarkerSearchKey(match.trackId, match.eventId)));
    $: collapsedTimelineTrackIdSet = createCollapsedTimelineTrackIdSet(collapsedTimelineTrackIds);
    $: if (markerSearchQuery !== lastMarkerSearchQuery) {
        lastMarkerSearchQuery = markerSearchQuery;
        activeMarkerMatchIndex = 0;
    }
    $: if (activeMarkerMatchIndex >= markerSearchMatches.length) {
        activeMarkerMatchIndex = Math.max(0, markerSearchMatches.length - 1);
    }
    $: activeMarkerMatch = markerSearchMatches[activeMarkerMatchIndex];
    $: activeMarkerMatchKey = activeMarkerMatch ? createMarkerSearchKey(activeMarkerMatch.trackId, activeMarkerMatch.eventId) : "";
    $: if (markerSearchQuery.trim() && activeMarkerMatch) {
        const nextFocusKey = `${timelineViewMode}:${markerSearchQuery}:${activeMarkerMatchIndex}:${activeMarkerMatch.eventDomId}`;

        if (nextFocusKey !== activeMarkerFocusKey) {
            activeMarkerFocusKey = nextFocusKey;
            focusActiveMarkerMatch();
        }
    }
    $: timelineMinWidth = createTimelineMinWidth(timelinePreview?.durationSeconds ?? 0);
    $: selectedZipFileNames = getSelectedZipFileNames();
    $: resolvedSpeedMaster = resolveSpeedMaster(clampSpeedMasterNumber(speedMasterNumber));
    $: executorPreviewRows = createExecutorPreviewRows(conversionArtifacts, pageNumber, pageSlotStart, bumpPageSlotStart);

    const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

    type ExecutorPreviewRow = {
        slot: number;
        address: string;
        sequenceNumber: number;
        name: string;
        kind: string;
        cueCount: number;
        eventCount: number;
        appearanceName: string;
        executorSlotGroup: "main" | "bump";
    };

    type TimelineViewMode = "graphic" | "sheet";

    type TimelineMarkerSearchMatch = {
        trackId: string;
        eventId: string;
        eventDomId: string;
        rowDomId: string;
    };

    type TimelinePreviewTrack = TimelinePreview["tracks"][number];

    type TimelinePreviewEvent = TimelinePreviewTrack["events"][number];

    type TimelinePadRow = {
        id: string;
        sequenceNumber: number;
        kindLabel: string;
        displayName: string;
        color: string;
        isActive: boolean;
        isHeld: boolean;
        isFlashing: boolean;
        latestEventLabel: string;
        latestEventMeta: string;
        statusLabel: string;
    };

    onDestroy(() => {
        cancelTimelineAnimationFrame();
    });

    onMount(() => {
        const didLoadSettings = applyPersistedSettings();

        settingsPersistenceStatus = didLoadSettings ? "Saved settings loaded locally." : "Settings are saved locally in this browser.";
        hasLoadedPersistedSettings = true;
    });

    function applyPersistedSettings(): boolean {
        const storedSettings = readPersistedSettings();

        if (!storedSettings) {
            return false;
        }

        sequenceNumber = readPersistedInteger(storedSettings.sequenceNumber, sequenceNumber, 1, 9999);
        appearanceStartNumber = readPersistedInteger(storedSettings.appearanceStartNumber, appearanceStartNumber, 1, 9999);
        sequenceNamePrefix = readPersistedString(storedSettings.sequenceNamePrefix, sequenceNamePrefix);
        timecodeNumber = readPersistedInteger(storedSettings.timecodeNumber, timecodeNumber, 1, 9999);
        pageNumber = readPersistedInteger(storedSettings.pageNumber, pageNumber, 1, 9999);
        pageSlotStart = readPersistedInteger(storedSettings.pageSlotStart, pageSlotStart, 101, 490);
        bumpPageSlotStart = readPersistedInteger(storedSettings.bumpPageSlotStart, bumpPageSlotStart, 101, 490);
        cueStartNumber = readPersistedInteger(storedSettings.cueStartNumber, cueStartNumber, 1, 9999);
        regionEndPreRollMs = readPersistedInteger(
            storedSettings.regionEndPreRollMs,
            regionEndPreRollMs,
            MIN_REGION_END_PRE_ROLL_MS,
            MAX_REGION_END_PRE_ROLL_MS,
        );
        autoOffRegionLayers = readPersistedBoolean(storedSettings.autoOffRegionLayers, autoOffRegionLayers);
        regionLayerPreRollEnabled = readPersistedBoolean(storedSettings.regionLayerPreRollEnabled, regionLayerPreRollEnabled);
        regionLayerPreRollMs = readPersistedInteger(
            storedSettings.regionLayerPreRollMs,
            regionLayerPreRollMs,
            MIN_REGION_LAYER_PRE_ROLL_MS,
            MAX_REGION_LAYER_PRE_ROLL_MS,
        );
        speedMasterNumber = readPersistedInteger(storedSettings.speedMasterNumber, speedMasterNumber, 1, 15);
        prefix = readPersistedString(storedSettings.prefix, prefix);
        importMode = isImportMode(storedSettings.importMode) ? storedSettings.importMode : importMode;
        exportMode = isExportMode(storedSettings.exportMode) ? storedSettings.exportMode : exportMode;
        timecodeName = readPersistedString(storedSettings.timecodeName, timecodeName);
        exportShowTimeMacros = readPersistedBoolean(storedSettings.exportShowTimeMacros, exportShowTimeMacros);
        exportTimecodeControlMacros = readPersistedBoolean(storedSettings.exportTimecodeControlMacros, exportTimecodeControlMacros);
        includeReaperTransportMacros = readPersistedBoolean(storedSettings.includeReaperTransportMacros, includeReaperTransportMacros);
        transportOscSlotId = readPersistedInteger(storedSettings.transportOscSlotId, transportOscSlotId, 1);
        transportOscDataName = readPersistedString(storedSettings.transportOscDataName, transportOscDataName);
        transportMacroNamePrefix = readPersistedString(storedSettings.transportMacroNamePrefix, transportMacroNamePrefix);
        transportOutputFileName = readPersistedString(storedSettings.transportOutputFileName, transportOutputFileName);

        return true;
    }

    function readPersistedSettings(): PersistedUserSettingsRecord | undefined {
        try {
            const serializedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);

            if (!serializedSettings) {
                return undefined;
            }

            const parsedSettings: unknown = JSON.parse(serializedSettings);

            return isPersistedSettingsRecord(parsedSettings) ? parsedSettings : undefined;
        } catch {
            settingsPersistenceStatus = "Saved settings could not be read in this browser.";
            return undefined;
        }
    }

    function savePersistedSettings(settings: PersistedUserSettings) {
        try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        } catch {
            settingsPersistenceStatus = "Settings could not be saved in this browser.";
        }
    }

    function isPersistedSettingsRecord(value: unknown): value is PersistedUserSettingsRecord {
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }

    function readPersistedInteger(value: unknown, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
        const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

        if (!Number.isFinite(numericValue)) {
            return fallback;
        }

        return Math.min(max, Math.max(min, Math.trunc(numericValue)));
    }

    function readPersistedString(value: unknown, fallback: string): string {
        return typeof value === "string" ? value : fallback;
    }

    function readPersistedBoolean(value: unknown, fallback: boolean): boolean {
        return typeof value === "boolean" ? value : fallback;
    }

    function isImportMode(value: unknown): value is ImportMode {
        return value === "markers-only" || value === "regions-and-markers";
    }

    function isExportMode(value: unknown): value is ExportMode {
        return value === "cues-and-timecode" || value === "cues-only";
    }

    function clampSpeedMasterNumber(value: number): number {
        const numericValue = Number(value);

        if (!Number.isFinite(numericValue)) {
            return 1;
        }

        return Math.min(15, Math.max(1, Math.trunc(numericValue)));
    }

    function syncSpeedMasterNumber() {
        speedMasterNumber = clampSpeedMasterNumber(speedMasterNumber);
    }

    function syncRegionEndPreRollMs() {
        regionEndPreRollMs = clampRegionEndPreRollMs(regionEndPreRollMs);
    }

    function syncRegionLayerPreRollMs() {
        regionLayerPreRollMs = clampRegionLayerPreRollMs(regionLayerPreRollMs);
    }

    function createTimelineMinWidth(durationSeconds: number): number {
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
            return 720;
        }

        return Math.min(3200, Math.max(720, Math.ceil(durationSeconds * 16)));
    }

    function calculateTimelineCursorPercent(currentSeconds: number, durationSeconds: number): number {
        if (!Number.isFinite(currentSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
            return 0;
        }

        return Math.min(100, Math.max(0, (currentSeconds / durationSeconds) * 100));
    }

    function setTimelineCursorSeconds(value: number) {
        const parsedValue = Number(value);
        const duration = Number.isFinite(timelineDurationSeconds) ? Math.max(0, timelineDurationSeconds) : 0;

        timelineCursorSeconds = Number.isFinite(parsedValue) ? Math.min(duration, Math.max(0, parsedValue)) : 0;
    }

    function toggleTimelinePlayback() {
        if (isTimelinePlaying) {
            pauseTimelinePlayback();
            return;
        }

        startTimelinePlayback();
    }

    function startTimelinePlayback() {
        if (!canControlTimeline) {
            return;
        }

        if (timelineCursorSeconds >= timelineDurationSeconds - TIMELINE_TIME_EPSILON) {
            setTimelineCursorSeconds(0);
        }

        isTimelinePlaying = true;
        resetTimelinePlaybackClock();
        cancelTimelineAnimationFrame();
        timelineAnimationFrameId = requestAnimationFrame(updateTimelinePlayback);
    }

    function pauseTimelinePlayback() {
        isTimelinePlaying = false;
        cancelTimelineAnimationFrame();
    }

    function rewindTimeline() {
        setTimelineCursorSeconds(0);
        resetTimelinePlaybackClock();
        scrollTimelineCursorIntoView(0, "smooth");
    }

    function handleTimelineScrub(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const nextCursorSeconds = Number(input.value);

        setTimelineCursorSeconds(nextCursorSeconds);
        resetTimelinePlaybackClock();
        scrollTimelineCursorIntoView(nextCursorSeconds, "smooth");
    }

    function handleTimelinePlaybackRateChange() {
        timelinePlaybackRate = Number(timelinePlaybackRate);
        resetTimelinePlaybackClock();
    }

    function updateTimelinePlayback(timestamp: number) {
        if (!isTimelinePlaying) {
            return;
        }

        const nextCursorSeconds = timelinePlaybackStartSeconds + ((timestamp - timelinePlaybackStartedAt) / 1000) * timelinePlaybackRate;

        if (nextCursorSeconds >= timelineDurationSeconds) {
            setTimelineCursorSeconds(timelineDurationSeconds);
            scrollTimelineCursorIntoView(timelineDurationSeconds, "auto");
            pauseTimelinePlayback();
            return;
        }

        setTimelineCursorSeconds(nextCursorSeconds);
        scrollTimelineCursorIntoView(nextCursorSeconds, "auto");
        timelineAnimationFrameId = requestAnimationFrame(updateTimelinePlayback);
    }

    function scrollTimelineCursorIntoView(currentSeconds: number, behavior: ScrollBehavior) {
        if (!timelineScrollContainer || timelineViewMode !== "graphic" || !canControlTimeline || timelineDurationSeconds <= 0) {
            return;
        }

        const scrollElement = timelineScrollContainer;
        const viewportWidth = scrollElement.clientWidth;
        const contentWidth = scrollElement.scrollWidth;

        if (contentWidth <= viewportWidth) {
            return;
        }

        const cursorPercent = calculateTimelineCursorPercent(currentSeconds, timelineDurationSeconds);
        const cursorX = (cursorPercent / 100) * contentWidth;
        const visibleStart = scrollElement.scrollLeft;
        const visibleEnd = visibleStart + viewportWidth;
        const margin = Math.min(180, Math.max(48, viewportWidth * 0.18));
        let nextScrollLeft = visibleStart;

        if (cursorX > visibleEnd - margin) {
            nextScrollLeft = Math.min(contentWidth - viewportWidth, cursorX - viewportWidth + margin);
        } else if (cursorX < visibleStart + margin) {
            nextScrollLeft = Math.max(0, cursorX - margin);
        }

        if (Math.abs(nextScrollLeft - visibleStart) < 1) {
            return;
        }

        scrollElement.scrollTo({
            left: nextScrollLeft,
            behavior,
        });
    }

    function resetTimelinePlaybackClock() {
        if (!isTimelinePlaying || typeof performance === "undefined") {
            return;
        }

        timelinePlaybackStartSeconds = timelineCursorSeconds;
        timelinePlaybackStartedAt = performance.now();
    }

    function cancelTimelineAnimationFrame() {
        if (timelineAnimationFrameId === undefined || typeof cancelAnimationFrame === "undefined") {
            timelineAnimationFrameId = undefined;
            return;
        }

        cancelAnimationFrame(timelineAnimationFrameId);
        timelineAnimationFrameId = undefined;
    }

    function formatTimelineClock(seconds: number): string {
        const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
        const hours = Math.floor(safeSeconds / 3600);
        const minutes = Math.floor((safeSeconds % 3600) / 60);
        const secondsPart = (safeSeconds % 60).toFixed(3).padStart(6, "0");

        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, "0")}:${secondsPart}`;
        }

        return `${minutes}:${secondsPart}`;
    }

    function createTimelinePadRows(tracks: TimelinePreview["tracks"], currentSeconds: number): TimelinePadRow[] {
        return tracks.map((track) => {
            const latestState = resolveTimelinePadState(track.events, currentSeconds);
            const latestEvent = latestState.latestEvent;
            const isActive = latestState.isOn || latestState.isFlashing;

            return {
                id: track.id,
                sequenceNumber: track.sequenceNumber,
                kindLabel: track.kindLabel,
                displayName: track.displayName,
                color: track.color,
                isActive,
                isHeld: latestState.isHeld,
                isFlashing: latestState.isFlashing,
                latestEventLabel: latestEvent?.label ?? "Waiting",
                latestEventMeta: latestEvent ? `${latestEvent.token} / ${latestEvent.timeLabel}` : "No event yet",
                statusLabel: isActive ? (latestState.isHeld ? "Held" : "On") : latestEvent ? "Off" : "Waiting",
            };
        });
    }

    function resolveTimelinePadState(events: TimelinePreviewEvent[], currentSeconds: number) {
        let latestEvent: TimelinePreviewEvent | undefined = undefined;
        let latestEventSeconds = Number.NEGATIVE_INFINITY;
        let isOn = false;
        let isHeld = false;

        for (const event of events) {
            const eventSeconds = parseTimelineEventSeconds(event);

            if (!Number.isFinite(eventSeconds) || eventSeconds > currentSeconds + TIMELINE_TIME_EPSILON) {
                continue;
            }

            latestEvent = event;
            latestEventSeconds = eventSeconds;

            if (isTimelineReleaseToken(event.token)) {
                isOn = false;
                isHeld = false;
            } else {
                isOn = true;
                isHeld = isTimelineHoldToken(event.token);
            }
        }

        const isRecentTrigger =
            latestEvent !== undefined &&
            !isTimelineReleaseToken(latestEvent.token) &&
            currentSeconds - latestEventSeconds >= -TIMELINE_TIME_EPSILON &&
            currentSeconds - latestEventSeconds <= TIMELINE_PAD_FLASH_SECONDS;

        return {
            latestEvent,
            isOn,
            isHeld,
            isFlashing: isRecentTrigger,
        };
    }

    function parseTimelineEventSeconds(event: TimelinePreviewEvent): number {
        return Number.parseFloat(event.timestamp);
    }

    function isTimelineHoldToken(token: string): boolean {
        const normalizedToken = token.trim().toLowerCase();

        return normalizedToken === "temp" || normalizedToken === "flash";
    }

    function isTimelineReleaseToken(token: string): boolean {
        const normalizedToken = token.trim().toLowerCase();

        return normalizedToken === "off" || normalizedToken.includes("release");
    }

    function filterTimelineTracks(tracks: TimelinePreview["tracks"], filterValue: string): TimelinePreview["tracks"] {
        const normalizedFilter = filterValue.trim().toLowerCase();

        if (!normalizedFilter) {
            return tracks;
        }

        return tracks.filter((track) => `${track.displayName} ${track.sequenceNumber} ${track.kindLabel}`.toLowerCase().includes(normalizedFilter));
    }

    function createMarkerSearchMatches(tracks: TimelinePreview["tracks"], query: string): TimelineMarkerSearchMatch[] {
        const normalizedQuery = query.trim().toLowerCase();

        if (!normalizedQuery) {
            return [];
        }

        return tracks.flatMap((track) =>
            track.events
                .filter((event) =>
                    [event.label, event.cueName, event.token, event.timestamp, event.timeLabel].some((value) =>
                        String(value ?? "")
                            .toLowerCase()
                            .includes(normalizedQuery),
                    ),
                )
                .map((event) => createMarkerSearchMatch(track.id, event.id)),
        );
    }

    function createMarkerSearchMatch(trackId: string, eventId: string): TimelineMarkerSearchMatch {
        const stableId = `${trackId}-${eventId}`;

        return {
            trackId,
            eventId,
            eventDomId: `timeline-event-${stableId}`,
            rowDomId: `timeline-row-${stableId}`,
        };
    }

    function createMarkerSearchKey(trackId: string, eventId: string): string {
        return `${trackId}::${eventId}`;
    }

    function createCollapsedTimelineTrackIdSet(collapsedTracks: Record<string, boolean>): Set<string> {
        return new Set(Object.entries(collapsedTracks).filter(([, isCollapsed]) => isCollapsed).map(([trackId]) => trackId));
    }

    function setTimelineViewMode(mode: TimelineViewMode) {
        timelineViewMode = mode;
        focusActiveMarkerMatch();
    }

    function isTimelineTrackCollapsed(trackId: string): boolean {
        return collapsedTimelineTrackIds[trackId] === true;
    }

    function toggleTimelineTrack(trackId: string) {
        collapsedTimelineTrackIds = {
            ...collapsedTimelineTrackIds,
            [trackId]: !isTimelineTrackCollapsed(trackId),
        };
    }

    function collapseAllVisibleTimelineTracks() {
        collapsedTimelineTrackIds = filteredTimelineTracks.reduce(
            (collapsedTracks, track) => ({
                ...collapsedTracks,
                [track.id]: true,
            }),
            { ...collapsedTimelineTrackIds },
        );
    }

    function expandAllVisibleTimelineTracks() {
        collapsedTimelineTrackIds = filteredTimelineTracks.reduce(
            (collapsedTracks, track) => ({
                ...collapsedTracks,
                [track.id]: false,
            }),
            { ...collapsedTimelineTrackIds },
        );
    }

    function goToMarkerSearchMatch(direction: "previous" | "next") {
        if (markerSearchMatches.length === 0) {
            return;
        }

        const offset = direction === "next" ? 1 : -1;
        activeMarkerMatchIndex = (activeMarkerMatchIndex + offset + markerSearchMatches.length) % markerSearchMatches.length;
        focusActiveMarkerMatch();
    }

    function handleMarkerSearchKeydown(event: KeyboardEvent) {
        if (event.key !== "Enter") {
            return;
        }

        event.preventDefault();
        goToMarkerSearchMatch(event.shiftKey ? "previous" : "next");
    }

    async function focusActiveMarkerMatch() {
        const match = activeMarkerMatch;

        if (!match || typeof document === "undefined") {
            return;
        }

        collapsedTimelineTrackIds = {
            ...collapsedTimelineTrackIds,
            [match.trackId]: false,
        };

        await tick();

        const targetId = timelineViewMode === "sheet" ? match.rowDomId : match.eventDomId;
        const targetElement = document.getElementById(targetId);

        targetElement?.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center",
        });

        for (const elementId of [match.eventDomId, match.rowDomId]) {
            const element = document.getElementById(elementId);

            if (!element) {
                continue;
            }

            element.classList.remove("marker-focus-pulse");
            void element.clientWidth;
            element.classList.add("marker-focus-pulse");
        }
    }

    function clearTimelineFilters() {
        sequenceFilter = "";
        markerSearchQuery = "";
        activeMarkerMatchIndex = 0;
        activeMarkerFocusKey = "";
    }

    function createBaseSequenceName() {
        const prefix = sequenceNamePrefix.trim();
        const sequenceName = `Sequence ${sequenceNumber}`;

        return prefix ? `${prefix} ${sequenceName}` : sequenceName;
    }

    function createExecutorPreviewRows(
        artifacts: ConversionArtifacts | undefined,
        targetPageNumber: number,
        targetPageSlotStart: number,
        targetBumpPageSlotStart: number,
    ): ExecutorPreviewRow[] {
        if (!artifacts) {
            return [];
        }

        const rows: Array<Omit<ExecutorPreviewRow, "slot" | "address">> = [];
        const executorOffsets: Record<ExecutorPreviewRow["executorSlotGroup"], number> = {
            main: 0,
            bump: 0,
        };

        if (artifacts.uniqueCues.length > 0) {
            rows.push({
                sequenceNumber,
                name: createBaseSequenceName(),
                kind: "Main",
                cueCount: artifacts.uniqueCues.length,
                eventCount: artifacts.uniqueCues.length,
                appearanceName: "Default",
                executorSlotGroup: "main",
            });
        }

        rows.push(
            ...artifacts.regionSequences.flatMap((sequence) => [
                {
                    sequenceNumber: sequence.sequenceNumber,
                    name: sequence.displayName,
                    kind: "Region",
                    cueCount: sequence.cues.length,
                    eventCount: sequence.events.length,
                    appearanceName: sequence.appearanceName ?? "Default",
                    executorSlotGroup: "main" as const,
                },
                ...artifacts.regionLayerSequences
                    .filter((layerSequence) => layerSequence.regionId === sequence.regionId)
                    .map((layerSequence) => ({
                        sequenceNumber: layerSequence.sequenceNumber,
                        name: layerSequence.displayName,
                        kind: "Layer",
                        cueCount: layerSequence.cues.length,
                        eventCount: layerSequence.events.length,
                        appearanceName: layerSequence.appearanceName ?? "Cue appearances",
                        executorSlotGroup: "main" as const,
                    })),
            ]),
            ...artifacts.repeatedSequences.map((sequence) => ({
                sequenceNumber: sequence.sequenceNumber,
                name: sequence.displayName,
                kind: "Repeat",
                cueCount: sequence.cues.length,
                eventCount: sequence.events.length,
                appearanceName: sequence.appearanceName ?? "Default",
                executorSlotGroup: "main" as const,
            })),
            ...artifacts.bumpSequences.map((sequence) => ({
                sequenceNumber: sequence.sequenceNumber,
                name: sequence.displayName,
                kind: "Bump",
                cueCount: sequence.cues.length,
                eventCount: sequence.events.length,
                appearanceName: sequence.appearanceName ?? "Overlay",
                executorSlotGroup: "bump" as const,
            })),
        );

        return rows.map((row) => {
            const slotStart = row.executorSlotGroup === "bump" ? targetBumpPageSlotStart : targetPageSlotStart;
            const slot = slotStart + executorOffsets[row.executorSlotGroup];
            executorOffsets[row.executorSlotGroup] += 1;

            return {
                ...row,
                slot,
                address: `Page ${targetPageNumber}.${slot}`,
            };
        });
    }

    function getMacroPresetSelection(): ExampleMacroPresetSelection {
        return {
            showTime: exportShowTimeMacros,
            timecodeControl: exportTimecodeControlMacros,
        };
    }

    function getTransportMacroOptions(): ReaperMacroGeneratorOptions {
        return {
            oscSlotId: transportOscSlotId,
            oscDataName: transportOscDataName,
            macroNamePrefix: transportMacroNamePrefix,
            outputFileName: transportOutputFileName.trim() || "reaper_transport_macros.xml",
        };
    }

    function readFileAsText(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
                resolve(String(event.target?.result ?? ""));
            };
            reader.onerror = () => {
                reject(reader.error ?? new Error("Unable to read the selected file."));
            };
            reader.readAsText(file);
        });
    }

    function setProcessingState(message: string) {
        isProcessing = true;
        processingStatus = message;
        processingCompleted = false;
    }

    function setExportProcessingState(message: string) {
        isProcessing = true;
        exportStatus = message;
    }

    function openUsageModal() {
        isUsageModalOpen = true;
    }

    function closeUsageModal() {
        isUsageModalOpen = false;
    }

    function handleWindowKeydown(event: KeyboardEvent) {
        if (event.key === "Escape" && isUsageModalOpen) {
            closeUsageModal();
        }
    }

    function handleUsageModalBackdropClick(event: MouseEvent) {
        if (event.target === event.currentTarget) {
            closeUsageModal();
        }
    }

    async function processFile(file: File) {
        pauseTimelinePlayback();
        setTimelineCursorSeconds(0);
        selectedCsvText = "";
        selectedMarkerCount = 0;
        selectedFileName = "";
        selectedFileBaseName = "";
        conversionArtifacts = undefined;
        conversionPreview = undefined;
        exportStatus = "";
        processingCompleted = false;
        setProcessingState("Parsing CSV data...");

        try {
            await delay(100);
            const csvText = await readFileAsText(file);
            const rows = parseReaperMarkerRows(csvText);
            selectedCsvText = csvText;
            selectedMarkerCount = rows.length;
            selectedFileName = file.name;
            selectedFileBaseName = stripFileExtension(file.name);
            fileInput.value = "";
            activeStep = 2;
            processingStatus = `CSV loaded: ${rows.length} rows ready for review.`;
            processingCompleted = true;
            isProcessing = false;
        } catch (error) {
            processingStatus = "Error processing file";
            console.error("Error processing CSV:", error);
            fileInput.value = "";
            isProcessing = false;
        }
    }

    function createCurrentExportBundleFiles(includeTransport = includeReaperTransportMacros) {
        if (!conversionArtifacts) {
            return [];
        }

        return createExportBundleFiles({
            conversionArtifacts,
            sourceFileName: selectedFileBaseName,
            timecodeName,
            macroPresetSelection: getMacroPresetSelection(),
            includeReaperTransportMacros: includeTransport,
            transportMacroOptions: getTransportMacroOptions(),
        });
    }

    function getSelectedZipFileNames() {
        try {
            return createCurrentExportBundleFiles().map((file) => file.name);
        } catch {
            const fileNames = createCurrentExportBundleFiles(false).map((file) => file.name);

            if (includeReaperTransportMacros) {
                fileNames.push(transportOutputFileName.trim() || "reaper_transport_macros.xml");
            }

            return fileNames;
        }
    }

    async function exportSelectedZip() {
        if (!conversionArtifacts) {
            exportStatus = "Upload a CSV file before exporting.";
            return;
        }

        setExportProcessingState("Generating ZIP archive...");

        try {
            await delay(100);
            const exportedAt = new Date();
            const outputFiles = createCurrentExportBundleFiles();
            const zipFileName = createTimestampedZipFileName(conversionArtifacts.outputBaseName, exportedAt);
            const zipBlob = createZipArchiveBlob(outputFiles, exportedAt);

            downloadBlob(zipBlob, zipFileName);

            exportStatus = `ZIP generated: ${zipFileName}`;
            isProcessing = false;
        } catch (error) {
            exportStatus = error instanceof Error ? error.message : "Error generating ZIP archive";
            console.error("Error generating ZIP archive:", error);
            isProcessing = false;
        }
    }

    function handleFileChange(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];

        if (file) {
            void processFile(file);
        }
    }

    function handleDragOver(event: DragEvent) {
        event.preventDefault();
        isDragOver = true;
    }

    function handleDragLeave(event: DragEvent) {
        event.preventDefault();
        if (!uploadArea.contains(event.relatedTarget as Node)) {
            isDragOver = false;
        }
    }

    function handleUploadKeydown(event: KeyboardEvent) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInput?.click();
        }
    }

    function handleDrop(event: DragEvent) {
        event.preventDefault();
        isDragOver = false;

        const file = event.dataTransfer?.files?.[0];

        if (!file) {
            return;
        }

        if (file.type === "text/csv" || file.name.endsWith(".csv")) {
            void processFile(file);
            return;
        }

        processingStatus = "Please select a CSV file.";
    }

    function clearFile() {
        pauseTimelinePlayback();
        setTimelineCursorSeconds(0);
        fileInput.value = "";
        selectedCsvText = "";
        selectedMarkerCount = 0;
        selectedFileName = "";
        selectedFileBaseName = "";
        processingCompleted = false;
        processingStatus = "";
        exportStatus = "";
        isProcessing = false;
        activeStep = 1;
        conversionArtifacts = undefined;
        conversionPreview = undefined;
    }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

<svelte:head>
    <title>Reaper to GrandMA3 Converter</title>
    <meta name="description" content="Convert Reaper CSV marker files to GrandMA3 XML format" />
</svelte:head>

<main class="container">
    <header class="header">
        <h1 class="title">Reaper Markers to GrandMA3</h1>
        <p class="subtitle">Upload a Reaper CSV, review the generated cues, then export XML locally in your browser.</p>
    </header>

    <div class="card wizard-card">
        <nav class="stepper" aria-label="Conversion steps">
            {#each wizardSteps as step}
                <button type="button" class="stepper-item" class:active={activeStep === step.id} on:click={() => (activeStep = step.id)}>
                    <span class="stepper-index">{step.id}</span>
                    <span class="stepper-copy">
                        <span class="stepper-label">{step.label}</span>
                        <span class="stepper-description">{step.description}</span>
                    </span>
                </button>
            {/each}
        </nav>

        {#if activeStep === 1}
            <section class="wizard-panel">
                <div class="upload-section">
                    <label for="file-input" class="upload-label">
                        <div bind:this={uploadArea} class="upload-area" class:has-file={Boolean(selectedFileName)} class:drag-over={isDragOver} class:processing={isProcessing} on:dragover={handleDragOver} on:dragleave={handleDragLeave} on:drop={handleDrop} on:keydown={handleUploadKeydown} role="button" tabindex="0" aria-label="Upload CSV file">
                            {#if isProcessing}
                                <div class="spinner"></div>
                                <span class="upload-text processing-text" aria-live="polite">{processingStatus}</span>
                            {:else}
                                <svg class="upload-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14,2 14,8 20,8"></polyline>
                                    <line x1="16" y1="13" x2="8" y2="13"></line>
                                    <line x1="16" y1="17" x2="8" y2="17"></line>
                                    <polyline points="10,9 9,9 8,9"></polyline>
                                </svg>
                                <span class="upload-text">
                                    {#if selectedFileName}
                                        {selectedFileName}
                                    {:else if isDragOver}
                                        Drop your CSV file here
                                    {:else}
                                        Click to select CSV file or drag & drop
                                    {/if}
                                </span>
                                <span class="upload-hint">Supports .csv files from Reaper</span>
                            {/if}
                        </div>
                    </label>
                    <input id="file-input" type="file" accept=".csv" bind:this={fileInput} on:change={handleFileChange} class="file-input" />
                </div>

                <div class="import-help-row">
                    <button type="button" class="secondary-button" on:click={openUsageModal}>What you can encode</button>
                </div>

                {#if processingStatus && !isProcessing}
                    <p class="status-message" role="status">{processingStatus}</p>
                {/if}

                {#if processingCompleted && selectedFileName}
                    <div class="new-file-section">
                        <button type="button" class="new-file-button" on:click={clearFile}>
                            <svg class="button-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                            Clear File
                        </button>
                    </div>

                    <div class="file-summary">
                        <div>
                            <span class="file-summary-label">Rows</span>
                            <strong>{selectedMarkerCount}</strong>
                        </div>
                        <div>
                            <span class="file-summary-label">Source</span>
                            <strong>{selectedFileName}</strong>
                        </div>
                        <div>
                            <span class="file-summary-label">Ready</span>
                            <strong>Yes</strong>
                        </div>
                    </div>
                {/if}
            </section>
        {:else if activeStep === 2}
            <section class="wizard-panel">
                <div class="panel-header">
                    <div>
                        <div class="panel-kicker">Step 2</div>
                        <h2>Settings</h2>
                        <p>Adjust sequence numbers, import mode, export mode and naming before generating XML.</p>
                    </div>
                    {#if selectedFileName}
                        <div class="panel-badge">Loaded: {selectedFileName}</div>
                    {/if}
                </div>

                {#if conversionPreview?.warnings.length}
                    <div class="warning-card" role="alert">
                        {#each conversionPreview.warnings as warning}
                            <p>{warning}</p>
                        {/each}
                    </div>
                {/if}

                <div class="settings-grid">
                    <div class="input-group">
                        <label for="sequence-number" class="label">
                            <span class="label-text">Sequence Number</span>
                            <span class="label-hint">Target sequence (1-9999)</span>
                        </label>
                        <input id="sequence-number" type="number" min="1" max="9999" step="1" bind:value={sequenceNumber} class="input" />
                    </div>

                    <div class="input-group">
                        <label for="prefix" class="label">
                            <span class="label-text">Prefix</span>
                            <span class="label-hint">Added before repeated and bump names, for example 1 - SD.</span>
                        </label>
                        <input id="prefix" type="text" bind:value={prefix} class="input" />
                    </div>

                    <div class="input-group">
                        <label for="sequence-name-prefix" class="label">
                            <span class="label-text">Sequence Name Prefix</span>
                            <span class="label-hint">Letters added before every generated sequence name</span>
                        </label>
                        <input id="sequence-name-prefix" type="text" bind:value={sequenceNamePrefix} class="input" />
                    </div>

                    <div class="input-group">
                        <label for="import-mode" class="label">
                            <span class="label-text">Import Mode</span>
                            <span class="label-hint">Choose the classic flow or the hybrid regions + markers flow.</span>
                        </label>
                        <select id="import-mode" bind:value={importMode} class="input select-input">
                            <option value="markers-only">Markers only</option>
                            <option value="regions-and-markers">Regions + markers</option>
                        </select>
                    </div>

                    <div class="input-group">
                        <label for="appearance-start-number" class="label">
                            <span class="label-text">Appearance Start ID</span>
                            <span class="label-hint">First id used for generated appearances</span>
                        </label>
                        <input id="appearance-start-number" type="number" min="1" max="9999" step="1" bind:value={appearanceStartNumber} class="input" />
                    </div>

                    <div class="input-group">
                        <label for="speed-master" class="label">
                            <span class="label-text">Speed Master</span>
                            <span class="label-hint">grandMA3 SpeedMaster 3.X, X = 1-15</span>
                        </label>
                        <div class="prefixed-input">
                            <span>3.</span>
                            <input
                                id="speed-master"
                                type="number"
                                min="1"
                                max="15"
                                step="1"
                                bind:value={speedMasterNumber}
                                on:change={syncSpeedMasterNumber}
                                class="input"
                            />
                        </div>
                    </div>

                    <div class="input-group">
                        <label for="timecode-name" class="label">
                            <span class="label-text">Timecode Name</span>
                            <span class="label-hint">Used by the example macro presets, or fall back to the CSV filename</span>
                        </label>
                        <input id="timecode-name" type="text" bind:value={timecodeName} class="input" placeholder="CSV filename fallback" />
                    </div>

                    <div class="input-group" class:disabled={exportMode === "cues-only"}>
                        <label for="timecode-number" class="label">
                            <span class="label-text">Timecode Number</span>
                            <span class="label-hint">Destination timecode object for the generated macro</span>
                        </label>
                        <input id="timecode-number" type="number" min="1" max="9999" step="1" bind:value={timecodeNumber} class="input" disabled={exportMode === "cues-only"} />
                    </div>

                    <div class="input-group">
                        <label for="page-number" class="label">
                            <span class="label-text">Page Number</span>
                            <span class="label-hint">grandMA3 executor page receiving generated sequences</span>
                        </label>
                        <input id="page-number" type="number" min="1" max="9999" step="1" bind:value={pageNumber} class="input" />
                    </div>

                    <div class="input-group">
                        <label for="page-slot-start" class="label">
                            <span class="label-text">Page Slot Start</span>
                            <span class="label-hint">First executor for main, region and repeated sequences.</span>
                        </label>
                        <input id="page-slot-start" type="number" min="101" max="490" step="1" bind:value={pageSlotStart} class="input" />
                    </div>

                    <div class="input-group">
                        <label for="bump-page-slot-start" class="label">
                            <span class="label-text">Bump Page Slot Start</span>
                            <span class="label-hint">First executor for Temp/Flash bump buttons.</span>
                        </label>
                        <input id="bump-page-slot-start" type="number" min="101" max="490" step="1" bind:value={bumpPageSlotStart} class="input" />
                    </div>
                </div>

                <p class="settings-persistence-note">{settingsPersistenceStatus}</p>

                <div class="import-mode-helper section-card" aria-live="polite">
                    <div class="summary-block-header">
                        <h3>Import mode guide</h3>
                        <span>{importMode === "regions-and-markers" ? "Regions + markers selected" : "Markers only selected"}</span>
                    </div>

                    <div class="import-mode-comparison">
                        <article class="import-mode-card" class:active={importMode === "markers-only"}>
                            <div class="import-mode-card-header">
                                <span>Markers only</span>
                                <strong>Flat Reaper marker export</strong>
                            </div>
                            <p>Use this when your CSV is only markers. Region rows are ignored. Empty-color markers become main cues; colored markers create repeated sequences by color.</p>
                            <div class="mode-example-list" aria-label="Markers only examples">
                                <code>Intro, 0, empty color -> main cue</code>
                                <code>SD, 1, 19005190 -> repeated color sequence</code>
                            </div>
                        </article>

                        <article class="import-mode-card" class:active={importMode === "regions-and-markers"}>
                            <div class="import-mode-card-header">
                                <span>Regions + markers</span>
                                <strong>Reaper regions become sequences</strong>
                            </div>
                            <p>Use this when your CSV contains Reaper regions with End or Length. Each region becomes a sequence with automatic start/end cues, and markers inside that time range become additional cues.</p>
                            <div class="mode-example-list" aria-label="Regions and markers examples">
                                <code>R2 Chorus, 10-20s -> region sequence</code>
                                <code>10s / 20s - pre-roll -> Region Start / Region End</code>
                                <code>Hit at 12s -> cue inside R2</code>
                                <code>[R2] Prep at 8s -> forced into R2</code>
                            </div>
                        </article>
                    </div>
                </div>

                <div class="settings-preview-section">
                    <div class="preview-section-header">
                        <div>
                            <span class="panel-kicker">Live preview</span>
                            <h3>Executor assignments</h3>
                        </div>
                        <span>{executorPreviewRows.length} executor assignment(s)</span>
                    </div>

                    <div class="ma-info-strip">
                        <div>
                            <span class="ma-info-label">Main executors</span>
                            <strong>Page {pageNumber}.{pageSlotStart}</strong>
                            <p>Main, region and repeated sequences start here. Row 201-290 is the fader row.</p>
                        </div>
                        <div>
                            <span class="ma-info-label">Bump buttons</span>
                            <strong>Page {pageNumber}.{bumpPageSlotStart}</strong>
                            <p>Temp/Flash bump sequences start here. Row 101-190 is button-only.</p>
                        </div>
                        <code>Assign Sequence ... At Page {pageNumber}.{pageSlotStart}<br />Bumps use Page {pageNumber}.{bumpPageSlotStart}<br />Rows: 101-190 / 201-290 / 301-490</code>
                        <div>
                            <span class="ma-info-label">Speed</span>
                            <strong>Master {resolvedSpeedMaster}</strong>
                            <p>All generated sequences use SpeedMaster {resolvedSpeedMaster}; BPM markers drive this same master.</p>
                        </div>
                    </div>

                    <div class="executor-preview section-card">
                        <div class="summary-block-header">
                            <h3>Executor Page Preview</h3>
                            <span>{executorPreviewRows.length} assignment(s)</span>
                        </div>
                        {#if executorPreviewRows.length}
                            <div class="executor-strip" aria-label="Generated executor assignments">
                                {#each executorPreviewRows as row}
                                    <div class="executor-tile" class:main-executor={row.kind === "Main"} class:bump-executor={row.kind === "Bump"}>
                                        <div class="executor-tile-top">
                                            <span>Seq {row.sequenceNumber}</span>
                                            <span>{row.kind}</span>
                                        </div>
                                        <strong>{row.name}</strong>
                                        <span>{row.address}</span>
                                    </div>
                                {/each}
                            </div>
                        {:else}
                            <p class="inline-empty">Upload a CSV to preview generated executor assignments.</p>
                        {/if}
                    </div>
                </div>

                <div class="syntax-card section-card">
                    <div class="label">
                        <span class="label-text">Marker tags</span>
                        <span class="label-hint">Metadata goes in a leading block, execution goes in a trailing block.</span>
                    </div>
                    <div class="syntax-examples">
                        <code>[BPM_129.5|X_foo] Intro</code>
                        <code>Intro [Temp|Flash]</code>
                        <code>[R2] Prep cue before region</code>
                        <code>[ON_R2|OFF_R1] Arm next region</code>
                        <code>[OFF_LAYER=FX] / [R2][OFF_LAYERS]</code>
                    </div>
                </div>

                <details class="advanced-mode-section section-card">
                    <summary class="section-summary">
                        <span class="label-text">Advanced</span>
                        <span class="label-hint">Additional options</span>
                    </summary>
                    <div class="advanced-settings-sections">
                        <div class="advanced-settings-group">
                            <div class="advanced-settings-title">
                                <strong>Region cues</strong>
                                <span>Boundary and cue numbering options for region sequences.</span>
                            </div>

                            <div class="advanced-settings-grid">
                                <div class="input-group">
                                    <label for="cue-start-number" class="label">
                                        <span class="label-text">Cue Start Number</span>
                                        <span class="label-hint">Starting number for cues (1-9999)</span>
                                    </label>
                                    <input id="cue-start-number" type="number" min="1" max="9999" step="1" bind:value={cueStartNumber} class="input" />
                                </div>

                                <div class="input-group">
                                    <label for="region-end-pre-roll-ms" class="label">
                                        <span class="label-text">Region End pre-roll</span>
                                        <span class="label-hint">Milliseconds before region end unless a later marker takes over</span>
                                    </label>
                                    <input
                                        id="region-end-pre-roll-ms"
                                        type="number"
                                        min={MIN_REGION_END_PRE_ROLL_MS}
                                        max={MAX_REGION_END_PRE_ROLL_MS}
                                        step="50"
                                        bind:value={regionEndPreRollMs}
                                        on:change={syncRegionEndPreRollMs}
                                        class="input"
                                    />
                                </div>
                            </div>
                        </div>

                        <div class="advanced-settings-group">
                            <div class="advanced-settings-title">
                                <strong>Region layers</strong>
                                <span>Pre-roll and automatic Off behavior for layer sequences attached to regions.</span>
                            </div>

                            <div class="advanced-settings-grid layer-off-settings-grid">
                                <label class="macro-group-toggle advanced-toggle">
                                    <input type="checkbox" bind:checked={regionLayerPreRollEnabled} class="macro-checkbox" />
                                    <span>
                                        <span class="label-text">Create layer pre-roll</span>
                                        <span class="label-hint">Create a Layer Pre-Roll cue before the first layer cue</span>
                                    </span>
                                </label>

                                <div class="input-group" class:disabled={!regionLayerPreRollEnabled}>
                                    <label for="region-layer-pre-roll-ms" class="label">
                                        <span class="label-text">Layer pre-roll</span>
                                        <span class="label-hint">Milliseconds before the layer sequence starts</span>
                                    </label>
                                    <input
                                        id="region-layer-pre-roll-ms"
                                        type="number"
                                        min={MIN_REGION_LAYER_PRE_ROLL_MS}
                                        max={MAX_REGION_LAYER_PRE_ROLL_MS}
                                        step="50"
                                        bind:value={regionLayerPreRollMs}
                                        on:change={syncRegionLayerPreRollMs}
                                        class="input"
                                        disabled={!regionLayerPreRollEnabled}
                                    />
                                </div>

                                <label class="macro-group-toggle advanced-toggle">
                                    <input type="checkbox" bind:checked={autoOffRegionLayers} class="macro-checkbox" />
                                    <span>
                                        <span class="label-text">Auto Off region layers</span>
                                        <span class="label-hint">Emit Off events on each layer track at the end of its parent region</span>
                                    </span>
                                </label>
                            </div>
                        </div>
                    </div>
                </details>

                <div class="export-mode-section">
                    <label for="export-mode" class="label">
                        <span class="label-text">Export Mode</span>
                        <span class="label-hint">Choose whether the macro also creates timecode tracks and events.</span>
                    </label>
                    <select id="export-mode" bind:value={exportMode} class="input select-input compact-select">
                        <option value="cues-and-timecode">Cues & Timecode</option>
                        <option value="cues-only">Cues only</option>
                    </select>
                </div>

                <div class="wizard-actions">
                    <button type="button" class="secondary-button" on:click={() => (activeStep = 1)}>Back</button>
                    <button type="button" class="primary-button" on:click={() => (activeStep = 3)} disabled={!conversionArtifacts}>Review summary</button>
                </div>
            </section>
        {:else if activeStep === 3}
            <section class="wizard-panel">
                <div class="panel-header">
                    <div>
                        <div class="panel-kicker">Step 3</div>
                        <h2>Summary</h2>
                        <p>Review the generated cues and macro command export before downloading anything.</p>
                    </div>
                </div>

                {#if conversionPreview && conversionArtifacts}
                    <div class="summary-grid">
                        <article class="summary-stat">
                            <span class="summary-stat-label">Import mode</span>
                            <strong>{conversionPreview.importMode === "regions-and-markers" ? "Regions + markers" : "Markers only"}</strong>
                        </article>
                        <article class="summary-stat">
                            <span class="summary-stat-label">Markers found</span>
                            <strong>{conversionPreview.sourceMarkerCount}</strong>
                        </article>
                        <article class="summary-stat">
                            <span class="summary-stat-label">Regions found</span>
                            <strong>{conversionPreview.regionCount}</strong>
                        </article>
                        <article class="summary-stat">
                            <span class="summary-stat-label">Region cues</span>
                            <strong>{conversionPreview.regionMarkerCount}</strong>
                        </article>
                        <article class="summary-stat">
                            <span class="summary-stat-label">Region layers</span>
                            <strong>{conversionPreview.regionLayerSequenceCount}</strong>
                        </article>
                        <article class="summary-stat">
                            <span class="summary-stat-label">Main cues</span>
                            <strong>{conversionPreview.uniqueCueCount}</strong>
                        </article>
                        <article class="summary-stat">
                            <span class="summary-stat-label">Generated sequences</span>
                            <strong>{conversionPreview.generatedSequenceNames.length}</strong>
                        </article>
                        <article class="summary-stat">
                            <span class="summary-stat-label">Appearances</span>
                            <strong>{conversionPreview.appearanceCount}</strong>
                        </article>
                        <article class="summary-stat">
                            <span class="summary-stat-label">Duration</span>
                            <strong>{conversionPreview.duration}s</strong>
                        </article>
                        <article class="summary-stat">
                            <span class="summary-stat-label">BPM markers</span>
                            <strong>{conversionPreview.bpmEventCount}</strong>
                        </article>
                    </div>

                    {#if conversionPreview.warnings.length}
                        <div class="warning-card">
                            {#each conversionPreview.warnings as warning}
                                <p>{warning}</p>
                            {/each}
                        </div>
                    {/if}

                    {#if timelinePreview}
                        <div class="summary-block timeline-preview-block">
                            <div class="summary-block-header">
                                <h3>Timeline Preview</h3>
                                <span>
                                    {#if timelinePreview.enabled}
                                        {filteredTimelineTracks.length} visible track(s) / {markerSearchQuery.trim() ? `${markerSearchMatches.length} marker match(es)` : `${timelinePreview.eventCount} event(s)`}
                                    {:else}
                                        Cues only
                                    {/if}
                                </span>
                            </div>

                            {#if timelinePreview.enabled && timelinePreview.tracks.length}
                                <div class="timeline-toolbar">
                                    <div class="timeline-view-switch" role="group" aria-label="Timeline view mode">
                                        <button
                                            type="button"
                                            class:active-view={timelineViewMode === "graphic"}
                                            on:click={() => setTimelineViewMode("graphic")}
                                        >
                                            Timeline
                                        </button>
                                        <button type="button" class:active-view={timelineViewMode === "sheet"} on:click={() => setTimelineViewMode("sheet")}>
                                            Table
                                        </button>
                                    </div>

                                    <div class="timeline-filter-grid">
                                        <label class="timeline-filter">
                                            <span>Sequence</span>
                                            <input type="search" bind:value={sequenceFilter} class="input" placeholder="Filter sequence name" />
                                        </label>

                                        <label class="timeline-filter">
                                            <span>Marker</span>
                                            <input
                                                type="search"
                                                bind:value={markerSearchQuery}
                                                on:keydown={handleMarkerSearchKeydown}
                                                class="input"
                                                placeholder="Search marker"
                                            />
                                        </label>

                                        <div class="timeline-search-controls" aria-label="Marker search navigation">
                                            <button type="button" class="secondary-button mini-button" on:click={() => goToMarkerSearchMatch("previous")} disabled={!markerSearchMatches.length}>
                                                Prev
                                            </button>
                                            <span>{markerSearchMatches.length ? `${activeMarkerMatchIndex + 1}/${markerSearchMatches.length}` : "0/0"}</span>
                                            <button type="button" class="secondary-button mini-button" on:click={() => goToMarkerSearchMatch("next")} disabled={!markerSearchMatches.length}>
                                                Next
                                            </button>
                                        </div>
                                    </div>

                                    <div class="timeline-fold-controls">
                                        <button type="button" class="secondary-button mini-button" on:click={collapseAllVisibleTimelineTracks} disabled={!filteredTimelineTracks.length}>
                                            Collapse all
                                        </button>
                                        <button type="button" class="secondary-button mini-button" on:click={expandAllVisibleTimelineTracks} disabled={!filteredTimelineTracks.length}>
                                            Expand all
                                        </button>
                                        <button type="button" class="secondary-button mini-button" on:click={clearTimelineFilters} disabled={!sequenceFilter && !markerSearchQuery}>
                                            Clear filters
                                        </button>
                                    </div>
                                </div>

                                <div class="timeline-simulator" aria-label="Timecode transport simulator">
                                    <div class="timeline-transport">
                                        <div class="timeline-transport-controls">
                                            <button
                                                type="button"
                                                class="timeline-icon-button"
                                                on:click={rewindTimeline}
                                                disabled={!canControlTimeline}
                                                aria-label="Rewind simulated timecode"
                                            >
                                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                                    <path d="M11 6 4 12l7 6V6Z"></path>
                                                    <path d="M20 6l-7 6 7 6V6Z"></path>
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                class="timeline-icon-button timeline-play-button"
                                                class:playing={isTimelinePlaying}
                                                on:click={toggleTimelinePlayback}
                                                disabled={!canControlTimeline}
                                                aria-label={isTimelinePlaying ? "Pause simulated timecode" : "Play simulated timecode"}
                                            >
                                                {#if isTimelinePlaying}
                                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                                        <path d="M8 5h3v14H8V5Z"></path>
                                                        <path d="M13 5h3v14h-3V5Z"></path>
                                                    </svg>
                                                {:else}
                                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                                        <path d="M8 5v14l11-7L8 5Z"></path>
                                                    </svg>
                                                {/if}
                                            </button>
                                            <div class="timeline-clock" aria-live="polite">
                                                <strong>{formatTimelineClock(timelineCursorSeconds)}</strong>
                                                <span>/ {formatTimelineClock(timelineDurationSeconds)}</span>
                                            </div>
                                            <label class="timeline-rate-select">
                                                <span>Speed</span>
                                                <select bind:value={timelinePlaybackRate} on:change={handleTimelinePlaybackRateChange} disabled={!canControlTimeline} aria-label="Playback speed">
                                                    <option value={1}>x1</option>
                                                    <option value={1.5}>x1.5</option>
                                                    <option value={2}>x2</option>
                                                    <option value={4}>x4</option>
                                                    <option value={6}>x6</option>
                                                </select>
                                            </label>
                                        </div>

                                        <label class="timeline-scrub">
                                            <span>Cursor</span>
                                            <input
                                                type="range"
                                                min="0"
                                                max={timelineDurationSeconds}
                                                step="0.001"
                                                value={timelineCursorSeconds}
                                                on:input={handleTimelineScrub}
                                                disabled={!canControlTimeline}
                                                aria-label="Move simulated timecode cursor"
                                            />
                                        </label>
                                    </div>
                                </div>

                                {#if filteredTimelineTracks.length}
                                    {#if timelineViewMode === "graphic"}
                                        <div class="timeline-preview" aria-label="Generated timecode timeline preview">
                                            <div class="timeline-track-list">
                                                <div class="timeline-track-meta timeline-ruler-meta">
                                                    <span>Track</span>
                                                    <strong>{timelinePreview.duration}s</strong>
                                                </div>
                                                {#each filteredTimelineTracks as track}
                                                    {@const isCollapsed = collapsedTimelineTrackIdSet.has(track.id)}
                                                    <div
                                                        class="timeline-track-meta"
                                                        class:collapsed-track={isCollapsed}
                                                        class:timeline-bpm-track={track.kind === "bpm"}
                                                        style={`--timeline-color: ${track.color}; min-height: ${isCollapsed ? 42 : 52 + (track.laneCount - 1) * 28}px;`}
                                                    >
                                                        <button
                                                            type="button"
                                                            class="timeline-track-toggle"
                                                            on:click={() => toggleTimelineTrack(track.id)}
                                                            aria-expanded={!isCollapsed}
                                                            aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${track.displayName}`}
                                                        >
                                                            <span>{isCollapsed ? "+" : "-"}</span>
                                                            <span>{track.kindLabel} / Track {track.trackIndex}</span>
                                                            <strong>{track.displayName}</strong>
                                                            <em>Sequence {track.sequenceNumber}</em>
                                                        </button>
                                                    </div>
                                                {/each}
                                            </div>

                                            <div bind:this={timelineScrollContainer} class="timeline-scroll" role="region" aria-label="Scrollable generated timecode events">
                                                <div class="timeline-content" style={`min-width: ${timelineMinWidth}px;`}>
                                                    <div class="timeline-ruler">
                                                        {#each timelinePreview.ticks as tick}
                                                            <span class:major-tick={tick.isMajor} style={`left: ${tick.positionPercent}%;`}>{tick.label}</span>
                                                        {/each}
                                                    </div>
                                                    <span class="timeline-playhead" style={`left: ${timelineCursorPercent}%;`} aria-hidden="true"></span>

                                                    {#each filteredTimelineTracks as track}
                                                        {@const isCollapsed = collapsedTimelineTrackIdSet.has(track.id)}
                                                        <div
                                                            class="timeline-lane"
                                                            class:collapsed-track={isCollapsed}
                                                            class:timeline-bpm-track={track.kind === "bpm"}
                                                            style={`--timeline-color: ${track.color}; min-height: ${isCollapsed ? 42 : 52 + (track.laneCount - 1) * 28}px;`}
                                                        >
                                                            {#each timelinePreview.ticks as tick}
                                                                <span
                                                                    class="timeline-grid-line"
                                                                    class:major-grid-line={tick.isMajor}
                                                                    style={`left: ${tick.positionPercent}%;`}
                                                                ></span>
                                                            {/each}

                                                            {#if isCollapsed}
                                                                <span class="timeline-collapsed-note">{track.events.length} hidden event(s)</span>
                                                            {:else}
                                                                {#each track.events as event}
                                                                    {@const eventSearchKey = createMarkerSearchKey(track.id, event.id)}
                                                                    {@const markerMatch = markerSearchMatchKeys.has(eventSearchKey)}
                                                                    {@const activeMarkerMatch = activeMarkerMatchKey === eventSearchKey}
                                                                    <span
                                                                        id={`timeline-event-${track.id}-${event.id}`}
                                                                        class="timeline-event"
                                                                        class:derived-event={event.isDerived}
                                                                        class:marker-search-match={markerMatch}
                                                                        class:active-marker-match={activeMarkerMatch}
                                                                        style={`left: ${event.positionPercent}%; top: ${10 + event.laneLevel * 28}px;`}
                                                                        title={`${track.displayName} / ${event.timeLabel} / ${event.token} / ${event.label}`}
                                                                    >
                                                                        <span class="timeline-event-dot"></span>
                                                                        <span class="timeline-event-copy">
                                                                            <strong>{event.label}</strong>
                                                                            <em>{event.token} / {event.timeLabel}</em>
                                                                        </span>
                                                                    </span>
                                                                {/each}
                                                            {/if}
                                                        </div>
                                                    {/each}
                                                </div>
                                            </div>
                                        </div>
                                    {:else}
                                        <div class="timeline-sheet-wrap" role="region" aria-label="Generated timecode event table">
                                            <table class="timeline-sheet">
                                                <thead>
                                                    <tr>
                                                        <th>Lock</th>
                                                        <th>Name</th>
                                                        <th>Track Group</th>
                                                        <th>Track</th>
                                                        <th>Time</th>
                                                        <th>Abs Time</th>
                                                        <th>Fade Override</th>
                                                        <th>Token</th>
                                                        <th>Cue Destination</th>
                                                        <th>Status</th>
                                                        <th>Execute Command</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {#each filteredTimelineTracks as track}
                                                        {@const isCollapsed = collapsedTimelineTrackIdSet.has(track.id)}
                                                        <tr class="timeline-sheet-track-row" style={`--timeline-color: ${track.color};`}>
                                                            <td>
                                                                <button
                                                                    type="button"
                                                                    class="sheet-collapse-button"
                                                                    on:click={() => toggleTimelineTrack(track.id)}
                                                                    aria-expanded={!isCollapsed}
                                                                    aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${track.displayName}`}
                                                                >
                                                                    {isCollapsed ? "+" : "-"}
                                                                </button>
                                                            </td>
                                                            <td colspan="10">
                                                                <strong>{track.displayName}</strong>
                                                                <span>TrackGroup 1 / Track {track.trackIndex} / Sequence {track.sequenceNumber} / {track.events.length} event(s)</span>
                                                            </td>
                                                        </tr>
                                                        {#if !isCollapsed}
                                                            {#each track.events as event}
                                                                {@const eventSearchKey = createMarkerSearchKey(track.id, event.id)}
                                                                {@const markerMatch = markerSearchMatchKeys.has(eventSearchKey)}
                                                                {@const activeMarkerMatch = activeMarkerMatchKey === eventSearchKey}
                                                                <tr
                                                                    id={`timeline-row-${track.id}-${event.id}`}
                                                                    class:marker-search-match={markerMatch}
                                                                    class:active-marker-match={activeMarkerMatch}
                                                                >
                                                                    <td></td>
                                                                    <td>{event.label}</td>
                                                                    <td>TrackGroup 1</td>
                                                                    <td>{track.trackIndex} '{track.displayName}'</td>
                                                                    <td>{event.timeLabel}</td>
                                                                    <td>{event.timeLabel}</td>
                                                                    <td></td>
                                                                    <td>{event.token}</td>
                                                                    <td>{event.cueNumber ? `Cue ${event.cueNumber}${event.cueName ? ` '${event.cueName}'` : ""}` : ""}</td>
                                                                    <td>{event.isDerived ? "Derived" : ""}</td>
                                                                    <td>Yes</td>
                                                                </tr>
                                                            {/each}
                                                        {/if}
                                                    {/each}
                                                </tbody>
                                            </table>
                                        </div>
                                    {/if}

                                    {#if timelinePadRows.length}
                                        <div class="timeline-pad-grid" aria-label="Simulated sequence execution pads">
                                            {#each timelinePadRows as pad}
                                                <article
                                                    class="timeline-pad"
                                                    class:active-pad={pad.isActive}
                                                    class:held-pad={pad.isHeld}
                                                    class:flashing-pad={pad.isFlashing}
                                                    style={`--pad-color: ${pad.color};`}
                                                >
                                                    <div class="timeline-pad-top">
                                                        <span>{pad.kindLabel}</span>
                                                        <span>Seq {pad.sequenceNumber}</span>
                                                    </div>
                                                    <strong>{pad.displayName}</strong>
                                                    <div class="timeline-pad-bottom">
                                                        <span class="timeline-pad-event">{pad.latestEventLabel}</span>
                                                        <span class="timeline-pad-meta">{pad.latestEventMeta}</span>
                                                        <span class="timeline-pad-status">{pad.statusLabel}</span>
                                                    </div>
                                                </article>
                                            {/each}
                                        </div>
                                    {/if}
                                {:else}
                                    <p class="inline-empty">No sequence matches the current filter.</p>
                                {/if}
                            {:else}
                                <p class="inline-empty">{timelinePreview.emptyMessage ?? "No timeline preview is available."}</p>
                            {/if}
                        </div>
                    {/if}

                    <div class="summary-block sequence-sheet-block">
                        <div class="summary-block-header">
                            <h3>Sequence / Executor Sheet</h3>
                            <span>{executorPreviewRows.length} executor assignment(s)</span>
                        </div>
                        {#if executorPreviewRows.length}
                            <div class="summary-table-wrap">
                                <table class="summary-table">
                                    <thead>
                                        <tr>
                                            <th>Sequence</th>
                                            <th>Executor</th>
                                            <th>Cues</th>
                                            <th>Appearance</th>
                                            <th>Timecode</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each executorPreviewRows as row}
                                            <tr>
                                                <td>
                                                    <strong>{row.name}</strong>
                                                    <span>Sequence {row.sequenceNumber} / {row.kind}</span>
                                                </td>
                                                <td>{row.address}</td>
                                                <td>{row.cueCount}</td>
                                                <td>{row.appearanceName}</td>
                                                <td>{exportMode === "cues-and-timecode" ? `${row.eventCount} event(s)` : "Cues only"}</td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                        {:else}
                            <p class="inline-empty">No sequence will be assigned to an executor.</p>
                        {/if}
                    </div>

                    <div class="summary-block">
                        <div class="summary-block-header">
                            <h3>Main cue names</h3>
                            <span>{conversionPreview.uniqueCueCount} cue(s)</span>
                        </div>
                        <div class="chip-list">
                            {#each conversionArtifacts.uniqueCues.slice(0, 8) as cue}
                                <span class="summary-chip">{cue.displayName}</span>
                            {/each}
                            {#if conversionArtifacts.uniqueCues.length > 8}
                                <span class="summary-chip muted">+{conversionArtifacts.uniqueCues.length - 8} more</span>
                            {/if}
                        </div>
                    </div>

                    <div class="summary-block">
                        <div class="summary-block-header">
                            <h3>Primary macro file</h3>
                            <span>{conversionPreview.outputFileNames.length} file(s)</span>
                        </div>
                        <div class="chip-list">
                            {#each conversionPreview.outputFileNames as fileName}
                                <span class="summary-chip file-chip">{fileName}</span>
                            {/each}
                        </div>
                    </div>

                    <div class="wizard-actions">
                        <button type="button" class="secondary-button" on:click={() => (activeStep = 2)}>Back to settings</button>
                        <button type="button" class="primary-button" on:click={() => (activeStep = 4)} disabled={isProcessing}>Continue to Extras</button>
                    </div>
                {:else}
                    <div class="empty-state">
                        Upload a CSV file and review the settings first.
                    </div>
                {/if}
            </section>
        {:else}
            <section class="wizard-panel">
                <div class="panel-header">
                    <div>
                        <div class="panel-kicker">Step 4</div>
                        <h2>Extras</h2>
                        <p>Optional exports and reference syntax for the marker parser.</p>
                    </div>
                </div>

                <div class="section-card macro-presets-card">
                    <div class="label">
                        <span class="label-text">Example macro presets</span>
                        <span class="label-hint">Optional standalone export, separate from the CSV converter.</span>
                    </div>

                    <div class="macro-group">
                        <label class="macro-group-toggle">
                            <input type="checkbox" bind:checked={exportShowTimeMacros} class="macro-checkbox" />
                            <div>
                                <div class="macro-group-title">{showTimePresetGroup?.label}</div>
                                <div class="macro-group-description">{showTimePresetGroup?.description}</div>
                            </div>
                        </label>
                        <div class="macro-preset-list">
                            {#each showTimePresetGroup?.presets ?? [] as preset}
                                <code>{preset.label}</code>
                            {/each}
                        </div>
                    </div>

                    <div class="macro-group">
                        <label class="macro-group-toggle">
                            <input type="checkbox" bind:checked={exportTimecodeControlMacros} class="macro-checkbox" />
                            <div>
                                <div class="macro-group-title">{timecodeControlPresetGroup?.label}</div>
                                <div class="macro-group-description">{timecodeControlPresetGroup?.description}</div>
                            </div>
                        </label>
                        <div class="macro-preset-list">
                            {#each timecodeControlPresetGroup?.presets ?? [] as preset}
                                <code>{preset.label}</code>
                            {/each}
                        </div>
                    </div>

                    {#if (exportShowTimeMacros || exportTimecodeControlMacros) && !resolvedExampleMacroTimecodeName}
                        <p class="transport-note">Import a CSV file or provide a timecode name before including example macros.</p>
                    {/if}
                </div>

                <div class="section-card macro-presets-card">
                    <div class="label">
                        <span class="label-text">REAPER transport macros</span>
                        <span class="label-hint">Standalone grandMA3 macro library for OSC transport control.</span>
                    </div>

                    <label class="macro-group-toggle standalone-toggle">
                        <input type="checkbox" bind:checked={includeReaperTransportMacros} class="macro-checkbox" />
                        <div>
                            <div class="macro-group-title">Include REAPER transport macros</div>
                            <div class="macro-group-description">Adds the OSC transport macro library to the final ZIP.</div>
                        </div>
                    </label>

                    <div class="input-group">
                        <label for="transport-osc-slot-id" class="label">
                            <span class="label-text">OSC Slot ID</span>
                            <span class="label-hint">Numeric line ID used by SendOSC</span>
                        </label>
                        <input id="transport-osc-slot-id" type="number" min="1" step="1" bind:value={transportOscSlotId} class="input" />
                    </div>

                    <div class="input-group">
                        <label for="transport-osc-data-name" class="label">
                            <span class="label-text">OSC Data Name</span>
                            <span class="label-hint">Display-only label for grandMA3 and docs</span>
                        </label>
                        <input id="transport-osc-data-name" type="text" bind:value={transportOscDataName} class="input" />
                    </div>

                    <div class="input-group">
                        <label for="transport-macro-name-prefix" class="label">
                            <span class="label-text">Macro Name Prefix</span>
                            <span class="label-hint">Prepended to the eight generated macro names</span>
                        </label>
                        <input id="transport-macro-name-prefix" type="text" bind:value={transportMacroNamePrefix} class="input" />
                    </div>

                    <div class="input-group">
                        <label for="transport-output-file-name" class="label">
                            <span class="label-text">Output File Name</span>
                            <span class="label-hint">Downloaded XML filename</span>
                        </label>
                        <input id="transport-output-file-name" type="text" bind:value={transportOutputFileName} class="input" />
                    </div>

                    <p class="transport-note">
                        <strong>{transportOscDataName}</strong> is display-only. The generated <code>SendOSC</code> commands always use the numeric slot ID.
                    </p>
                </div>

                <div class="section-card zip-export-card">
                    <div class="label">
                        <span class="label-text">ZIP export</span>
                        <span class="label-hint">One timestamped archive with the main macro and selected extras.</span>
                    </div>

                    <div class="chip-list zip-file-list">
                        {#each selectedZipFileNames as fileName}
                            <span class="summary-chip file-chip">{fileName}</span>
                        {/each}
                    </div>

                    {#if exportStatus}
                        <p class="status-message export-status" role="status">{exportStatus}</p>
                    {/if}

                    <button type="button" class="macro-export-button" on:click={exportSelectedZip} disabled={isProcessing || !conversionArtifacts}>
                        Download ZIP
                    </button>
                </div>

                <div class="wizard-actions">
                    <button type="button" class="secondary-button" on:click={() => (activeStep = 3)} disabled={!conversionArtifacts}>Back to summary</button>
                </div>
            </section>
        {/if}
    </div>

    {#if isUsageModalOpen}
        <div class="modal-backdrop" role="presentation" on:click={handleUsageModalBackdropClick}>
            <div class="usage-modal" role="dialog" aria-modal="true" aria-labelledby="usage-modal-title">
                <div class="modal-header">
                    <div>
                        <div class="panel-kicker">Marker syntax</div>
                        <h2 id="usage-modal-title">What you can encode</h2>
                        <p>Use square brackets at the start or end of the marker name.</p>
                    </div>
                    <button type="button" class="modal-close-button" on:click={closeUsageModal} aria-label="Close marker syntax help">Close</button>
                </div>

                <div class="usage-grid">
                    <div class="usage-item wide">
                        <div class="usage-title">Import modes</div>
                        <code>Markers only: marker rows only / Regions + markers: region rows become sequences</code>
                        <p><code>Markers only</code> is a flat cue export. <code>Regions + markers</code> uses Reaper regions with End or Length as separate grandMA3 sequences, adds start/end cues, then places markers inside those regions as cues.</p>
                    </div>
                    <div class="usage-item">
                        <div class="usage-title">Main cues</div>
                        <code>Intro</code>
                        <p>Empty color stays in the main sequence.</p>
                    </div>
                    <div class="usage-item">
                        <div class="usage-title">Repeated sequences</div>
                        <code>SD</code>
                        <p>Any color creates one repeated sequence per distinct color.</p>
                    </div>
                    <div class="usage-item">
                        <div class="usage-title">Bump overlays</div>
                        <code>[Temp] HIT</code>
                        <p><code>Temp</code> and <code>Flash</code> create bump sequences for overlays.</p>
                    </div>
                    <div class="usage-item">
                        <div class="usage-title">Bump release</div>
                        <code>[Temp|Release_250] / [TempRelease]</code>
                        <p><code>Release_...</code> sets the timed OffCue in milliseconds; <code>TempRelease</code> or <code>FlashRelease</code> derives it from the latest unmatched bump.</p>
                    </div>
                    <div class="usage-item">
                        <div class="usage-title">Cue timing</div>
                        <code>[FadeFromX_0.5|FadeToX_1.2] Verse</code>
                        <p><code>Fade</code> and <code>Delay</code> modifiers are emitted on the cue macro line.</p>
                    </div>
                    <div class="usage-item">
                        <div class="usage-title">BPM markers</div>
                        <code>[BPM_129.5] Chorus</code>
                        <p>Creates a dedicated BPM sequence and drives the configured Speed Master.</p>
                    </div>
                    <div class="usage-item">
                        <div class="usage-title">Execution token</div>
                        <code>Intro [Go+]</code>
                        <p>The trailing block can override the cue execution action.</p>
                    </div>
                    <div class="usage-item">
                        <div class="usage-title">Regions</div>
                        <code>R1 / R2 / [R2] Prep cue</code>
                        <p>Hybrid mode uses regions as sequences. Each region gets <code>Region Start</code> and <code>Region End</code> cues; a leading <code>[R2]</code> tag assigns a marker to that region sequence, even before the region starts.</p>
                    </div>
                    <div class="usage-item">
                        <div class="usage-title">Region layers</div>
                        <code>[LAYER=FX] Impact / [R2][LAYER=Voix] Pré-roll</code>
                        <p><code>LAYER=...</code> creates a parallel sequence attached to the containing or targeted region.</p>
                    </div>
                    <div class="usage-item">
                        <div class="usage-title">Region layer Off</div>
                        <code>[OFF_LAYER=FX] / [OFF_LAYERS] / [R2][OFF_LAYER=Voix]</code>
                        <p><code>OFF_LAYER</code> emits an Off event on one layer track; <code>OFF_LAYERS</code> emits Off events on every layer of the containing or targeted region.</p>
                    </div>
                    <div class="usage-item">
                        <div class="usage-title">Global markers</div>
                        <code>[GLOBAL] Cue</code>
                        <p><code>[GLOBAL]</code> or <code>[MAIN]</code> keeps a marker in the main sequence even inside a region.</p>
                    </div>
                    <div class="usage-item">
                        <div class="usage-title">Region arm/disarm</div>
                        <code>[ON_R2] / [OFF_R1]</code>
                        <p><code>ON</code> arms cue 1 on a region, <code>OFF</code> stops the previous region sequence.</p>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <footer class="footer">
        <p>Made with Svelte - View <a target="_blank" href="https://github.com/mokabyls/reaper2ma">Source on GitHub</a></p>
        <p>&copy; 2025 - 2026 mokabyls</p>
    </footer>
</main>

<style>
    :global(:root) {
        color-scheme: dark;
        --bg-gradient-start: #030303;
        --bg-gradient-end: #121318;
        --text-primary: #f2f2f3;
        --text-secondary: #a3a5ad;
        --text-white: #ffffff;
        --card-bg: #111216;
        --card-border: #3a3b42;
        --upload-bg: #1c1d22;
        --upload-hover: #282a30;
        --upload-success: #102b1b;
        --upload-processing: #2f2613;
        --border-light: #373941;
        --border-hover: #666973;
        --accent-blue: #f5d000;
        --accent-green: #00d45a;
        --accent-orange: #f59e0b;
        --accent-red: #ef4444;
        --accent-red-dark: #b91c1c;
        --input-bg: #050505;
        --shadow-light: rgba(0, 0, 0, 0.36);
        --shadow-medium: rgba(0, 0, 0, 0.6);
        --info-bg: #18191f;
        --info-border: #44464e;
        --step-bg: #202127;
        --note-bg: #201c10;
        --note-border: #f5d000;
        --ma-yellow: #f5d000;
        --ma-green: #00d45a;
        --ma-cyan: #20c7d8;
        --ma-row: #24252b;
        --ma-row-alt: #1b1c21;
    }

    :global(body) {
        margin: 0;
        padding: 0;
        font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 180px),
            linear-gradient(135deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%);
        min-height: 100vh;
        color: var(--text-primary);
        transition:
            background 0.3s ease,
            color 0.3s ease;
    }

    .container {
        max-width: 1280px;
        margin: 0 auto;
        padding: 2rem 1rem;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }

    .header {
        text-align: left;
        color: var(--text-white);
        border: 1px solid var(--card-border);
        background: #1b1c21;
        padding: 0.9rem 1rem;
        box-shadow: 0 10px 30px var(--shadow-light);
    }

    .title {
        font-size: 1.35rem;
        font-weight: 800;
        margin: 0 0 0.25rem 0;
        letter-spacing: 0.01em;
    }

    .subtitle {
        font-size: 0.92rem;
        color: var(--text-secondary);
        margin: 0;
    }

    .card {
        background: var(--card-bg);
        border-radius: 6px;
        padding: 1rem;
        box-shadow: 0 10px 30px var(--shadow-medium);
        border: 1px solid var(--card-border);
        transition:
            background 0.3s ease,
            border 0.3s ease;
    }

    .wizard-card {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .stepper {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.75rem;
    }

    .stepper-item {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.9rem 1rem;
        border: 1px solid var(--border-light);
        border-radius: 14px;
        background: var(--upload-bg);
        color: var(--text-primary);
        text-align: left;
        cursor: pointer;
        transition:
            transform 0.2s ease,
            border-color 0.2s ease,
            box-shadow 0.2s ease,
            background 0.2s ease;
    }

    .stepper-item:hover {
        transform: translateY(-1px);
        border-color: var(--accent-blue);
        box-shadow: 0 8px 18px var(--shadow-light);
    }

    .stepper-item.active {
        border-color: var(--accent-blue);
        background: var(--upload-hover);
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.12);
    }

    .stepper-index {
        width: 30px;
        height: 30px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        background: var(--accent-blue);
        color: var(--text-white);
        font-weight: 700;
    }

    .stepper-copy {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        min-width: 0;
    }

    .stepper-label {
        font-size: 0.96rem;
        font-weight: 700;
    }

    .stepper-description {
        font-size: 0.82rem;
        color: var(--text-secondary);
        line-height: 1.35;
    }

    .wizard-panel {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }

    .panel-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
    }

    .panel-header h2 {
        margin: 0.1rem 0 0.35rem;
        font-size: 1.45rem;
    }

    .panel-header p {
        margin: 0;
        color: var(--text-secondary);
    }

    .panel-kicker {
        font-size: 0.78rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--accent-blue);
    }

    .panel-badge {
        align-self: center;
        padding: 0.45rem 0.75rem;
        border-radius: 999px;
        background: var(--step-bg);
        border: 1px solid var(--border-light);
        color: var(--text-secondary);
        font-size: 0.85rem;
        white-space: nowrap;
    }

    .wizard-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
    }

    .primary-button,
    .secondary-button {
        border: 0;
        border-radius: 10px;
        padding: 0.8rem 1.1rem;
        font-weight: 700;
        cursor: pointer;
        transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            opacity 0.2s ease,
            background 0.2s ease;
    }

    .primary-button {
        background: linear-gradient(135deg, var(--accent-blue), #4f46e5);
        color: var(--text-white);
        box-shadow: 0 6px 16px rgba(79, 70, 229, 0.24);
    }

    .primary-button:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 8px 18px rgba(79, 70, 229, 0.32);
    }

    .secondary-button {
        background: var(--step-bg);
        color: var(--text-primary);
        border: 1px solid var(--border-light);
    }

    .secondary-button:hover:not(:disabled) {
        transform: translateY(-1px);
        border-color: var(--accent-blue);
    }

    .primary-button:disabled,
    .secondary-button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
        box-shadow: none;
        transform: none;
    }

    .file-summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.75rem;
    }

    .file-summary > div {
        padding: 0.85rem 1rem;
        border-radius: 12px;
        background: var(--step-bg);
        border: 1px solid var(--border-light);
    }

    .file-summary-label {
        display: block;
        margin-bottom: 0.2rem;
        color: var(--text-secondary);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    .summary-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 0.75rem;
    }

    .summary-stat {
        padding: 1rem;
        border-radius: 14px;
        border: 1px solid var(--border-light);
        background: var(--step-bg);
    }

    .summary-stat-label {
        display: block;
        color: var(--text-secondary);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 0.35rem;
    }

    .summary-stat strong {
        display: block;
        font-size: 1.5rem;
        line-height: 1.1;
        color: var(--text-primary);
        font-variant-numeric: tabular-nums;
    }

    .summary-block {
        padding: 1rem;
        border-radius: 14px;
        border: 1px solid var(--border-light);
        background: color-mix(in srgb, var(--upload-bg) 78%, transparent);
    }

    .summary-block-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 0.75rem;
    }

    .summary-block-header h3 {
        margin: 0;
        font-size: 1.02rem;
    }

    .summary-block-header span {
        color: var(--text-secondary);
        font-size: 0.85rem;
    }

    .chip-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .summary-chip {
        display: inline-flex;
        align-items: center;
        padding: 0.4rem 0.65rem;
        border-radius: 999px;
        background: var(--step-bg);
        border: 1px solid var(--border-light);
        color: var(--text-primary);
        font-size: 0.85rem;
        white-space: nowrap;
    }

    .summary-chip.muted {
        color: var(--text-secondary);
    }

    .summary-chip.file-chip {
        font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
    }

    .warning-card,
    .empty-state {
        padding: 1rem;
        border-radius: 14px;
        border: 1px solid var(--note-border);
        background: var(--note-bg);
        color: var(--text-primary);
    }

    .warning-card p {
        margin: 0;
    }

    .warning-card p + p {
        margin-top: 0.5rem;
    }

    .empty-state {
        text-align: center;
    }

    .upload-section {
        margin-bottom: 2rem;
    }

    .import-help-row {
        display: flex;
        justify-content: center;
        margin: -0.75rem 0 1.5rem;
    }

    .status-message {
        margin: -0.5rem 0 1.5rem;
        padding: 0.85rem 1rem;
        border-radius: 12px;
        background: var(--step-bg);
        border: 1px solid var(--border-light);
        color: var(--text-primary);
        text-align: center;
        font-size: 0.95rem;
    }

    .upload-label {
        display: block;
        cursor: pointer;
        transition: transform 0.2s ease;
    }

    .upload-label:hover {
        transform: translateY(-2px);
    }

    .upload-area {
        border: 3px dashed var(--border-light);
        border-radius: 12px;
        padding: 3rem 2rem;
        text-align: center;
        background: var(--upload-bg);
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
    }

    .upload-area:hover {
        border-color: var(--accent-blue);
        background: var(--upload-hover);
    }

    .upload-area.has-file {
        border-color: var(--accent-green);
        background: var(--upload-success);
        border-style: solid;
    }

    .upload-area.drag-over {
        border-color: var(--accent-blue);
        background: var(--upload-hover);
        transform: scale(1.02);
        box-shadow: 0 0 20px rgba(102, 126, 234, 0.3);
    }

    .upload-area.processing {
        border-color: var(--accent-orange);
        background: var(--upload-processing);
        pointer-events: none;
    }

    .upload-icon {
        color: var(--text-secondary);
        margin-bottom: 1rem;
        transition: color 0.3s ease;
    }

    .upload-area:hover .upload-icon {
        color: var(--accent-blue);
    }

    .upload-area.has-file .upload-icon {
        color: var(--accent-green);
    }

    .upload-text {
        display: block;
        font-size: 1.1rem;
        font-weight: 500;
        margin-bottom: 0.5rem;
        color: var(--text-primary);
    }

    .upload-hint {
        font-size: 0.9rem;
        color: var(--text-secondary);
        display: block;
    }

    .processing-text {
        color: var(--accent-orange) !important;
        font-weight: 600;
    }

    .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--border-light);
        border-top: 3px solid var(--accent-orange);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 1rem;
    }

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }

    .file-input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
    }

    .new-file-section {
        margin: 1.5rem 0;
        text-align: center;
    }

    .new-file-button {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1.5rem;
        background: linear-gradient(135deg, var(--accent-red), var(--accent-red-dark));
        color: var(--text-white);
        border: none;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 2px 4px var(--shadow-light);
    }

    .new-file-button:hover {
        background: linear-gradient(135deg, var(--accent-red-dark), #b91c1c);
        transform: translateY(-1px);
        box-shadow: 0 4px 8px var(--shadow-medium);
    }

    .new-file-button:active {
        transform: translateY(0);
    }

    .button-icon {
        flex-shrink: 0;
    }

    .export-mode-section,
    .advanced-mode-section {
        margin-top: 1.5rem;
    }

    .section-card {
        border: 1px solid var(--border-light);
        border-radius: 12px;
        padding: 1rem;
        background: color-mix(in srgb, var(--upload-bg) 82%, transparent);
        transition:
            border-color 0.2s ease,
            background 0.2s ease,
            box-shadow 0.2s ease;
    }

    .section-card:hover {
        border-color: var(--border-hover);
    }

    .syntax-card {
        margin-top: 1.5rem;
    }

    .import-mode-helper {
        margin-top: 1rem;
    }

    .import-mode-comparison {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.75rem;
    }

    .import-mode-card {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-width: 0;
        padding: 0.9rem;
        border: 1px solid var(--border-light);
        border-radius: 6px;
        background: #17181d;
    }

    .import-mode-card.active {
        border-color: var(--ma-yellow);
        background: #202019;
        box-shadow: inset 0 0 0 1px rgba(245, 208, 0, 0.28);
    }

    .import-mode-card-header {
        display: flex;
        justify-content: space-between;
        gap: 0.75rem;
        align-items: baseline;
    }

    .import-mode-card-header span {
        color: var(--ma-yellow);
        font-size: 0.76rem;
        font-weight: 800;
        text-transform: uppercase;
    }

    .import-mode-card-header strong {
        color: var(--text-primary);
        font-size: 0.86rem;
        text-align: right;
    }

    .import-mode-card p {
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.86rem;
        line-height: 1.45;
    }

    .mode-example-list {
        display: grid;
        gap: 0.45rem;
    }

    .mode-example-list code {
        display: block;
        padding: 0.5rem 0.6rem;
        border: 1px solid var(--border-light);
        border-radius: 4px;
        background: #111216;
        color: var(--ma-cyan);
        font-size: 0.8rem;
        line-height: 1.35;
        overflow-wrap: anywhere;
    }

    .syntax-examples {
        display: grid;
        gap: 0.75rem;
        margin-top: 0.75rem;
    }

    .syntax-examples code {
        display: block;
        padding: 0.75rem 1rem;
        border-radius: 8px;
        background: var(--step-bg);
        border: 1px solid var(--border-light);
        color: var(--text-primary);
        font-size: 0.9rem;
        overflow-x: auto;
    }

    .macro-presets-card {
        margin-top: 1.5rem;
    }

    .macro-group {
        padding: 1rem 0 0;
        border-top: 1px solid var(--border-light);
        margin-top: 1rem;
    }

    .macro-group:first-of-type {
        border-top: 0;
        padding-top: 0;
        margin-top: 0;
    }

    .macro-group-toggle {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        cursor: pointer;
    }

    .standalone-toggle {
        padding: 0.85rem 0;
        border-top: 1px solid var(--border-light);
        border-bottom: 1px solid var(--border-light);
        margin: 1rem 0;
    }

    .advanced-toggle {
        align-self: start;
        padding: 0.4rem 0;
    }

    .macro-checkbox {
        width: 18px;
        height: 18px;
        margin-top: 0.2rem;
        accent-color: var(--accent-blue);
        flex-shrink: 0;
    }

    .macro-group-title {
        font-weight: 700;
        color: var(--text-primary);
    }

    .macro-group-description {
        color: var(--text-secondary);
        font-size: 0.9rem;
        margin-top: 0.15rem;
    }

    .macro-preset-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin: 0.75rem 0 0 1.5rem;
    }

    .macro-preset-list code {
        padding: 0.45rem 0.6rem;
        border-radius: 8px;
        background: var(--step-bg);
        border: 1px solid var(--border-light);
        color: var(--text-primary);
        font-size: 0.86rem;
    }

    .macro-export-button {
        margin-top: 1.25rem;
        padding: 0.8rem 1.1rem;
        border: 0;
        border-radius: 10px;
        background: linear-gradient(135deg, var(--accent-blue), #4f46e5);
        color: var(--text-white);
        font-weight: 700;
        cursor: pointer;
        transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            opacity 0.2s ease;
        box-shadow: 0 6px 16px rgba(79, 70, 229, 0.24);
    }

    .macro-export-button:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 8px 18px rgba(79, 70, 229, 0.32);
    }

    .macro-export-button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
        box-shadow: none;
    }

    .zip-export-card {
        margin-top: 1.5rem;
    }

    .zip-file-list {
        margin-top: 0.75rem;
    }

    .export-status {
        margin: 1rem 0 0;
        text-align: left;
    }

    .transport-note {
        margin: 0.9rem 0 0;
        padding: 0.75rem 0.9rem;
        border-radius: 10px;
        background: var(--note-bg);
        border: 1px solid var(--note-border);
        color: var(--text-primary);
        font-size: 0.95rem;
        line-height: 1.5;
    }

    .modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 20;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.25rem;
        background: rgba(15, 23, 42, 0.58);
        backdrop-filter: blur(4px);
    }

    .usage-modal {
        width: min(920px, 100%);
        max-height: min(760px, calc(100vh - 2.5rem));
        overflow: auto;
        border-radius: 14px;
        border: 1px solid var(--card-border);
        background: var(--card-bg);
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.32);
        padding: 1.25rem;
    }

    .modal-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1rem;
    }

    .modal-header h2 {
        margin: 0.1rem 0 0.35rem;
        font-size: 1.35rem;
    }

    .modal-header p {
        margin: 0;
        color: var(--text-secondary);
    }

    .modal-close-button {
        border: 1px solid var(--border-light);
        border-radius: 8px;
        background: var(--upload-bg);
        color: var(--text-primary);
        cursor: pointer;
        flex-shrink: 0;
        font-weight: 700;
        padding: 0.65rem 0.85rem;
        transition:
            border-color 0.2s ease,
            background 0.2s ease,
            transform 0.2s ease;
    }

    .modal-close-button:hover {
        border-color: var(--accent-blue);
        background: var(--upload-hover);
        transform: translateY(-1px);
    }

    .usage-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.75rem;
        margin-top: 0.75rem;
    }

    .usage-item {
        padding: 0.9rem 1rem;
        border-radius: 10px;
        background: var(--step-bg);
        border: 1px solid var(--border-light);
    }

    .usage-item.wide {
        grid-column: 1 / -1;
    }

    .usage-title {
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 0.5rem;
    }

    .usage-item code {
        display: block;
        padding: 0.55rem 0.7rem;
        border-radius: 8px;
        background: color-mix(in srgb, var(--upload-bg) 72%, transparent);
        border: 1px solid var(--border-light);
        color: var(--text-primary);
        font-size: 0.86rem;
        overflow-x: auto;
        margin-bottom: 0.55rem;
    }

    .usage-item p {
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.9rem;
        line-height: 1.4;
    }

    .section-summary {
        list-style: none;
        cursor: pointer;
        position: relative;
        padding-right: 2rem;
    }

    .section-summary::-webkit-details-marker {
        display: none;
    }

    .section-summary::after {
        content: "";
        position: absolute;
        right: 0.5rem;
        top: 50%;
        width: 0.55rem;
        height: 0.55rem;
        border-right: 2px solid var(--text-secondary);
        border-bottom: 2px solid var(--text-secondary);
        transform: translateY(-65%) rotate(45deg);
        transition: transform 0.2s ease;
    }

    .advanced-mode-section[open] .section-summary::after {
        transform: translateY(-25%) rotate(225deg);
    }

    .advanced-mode-section > div {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--border-light);
    }

    .advanced-settings-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
    }

    .advanced-settings-sections {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }

    .advanced-settings-group + .advanced-settings-group {
        padding-top: 1.25rem;
        border-top: 1px solid var(--border-light);
    }

    .advanced-settings-title {
        margin-bottom: 0.85rem;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
    }

    .advanced-settings-title strong {
        color: var(--text-primary);
        font-size: 0.92rem;
        text-transform: uppercase;
        letter-spacing: 0;
    }

    .advanced-settings-title span {
        color: var(--text-secondary);
        font-size: 0.84rem;
    }

    .layer-off-settings-grid {
        align-items: start;
    }

    .settings-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 2rem;
    }

    .settings-persistence-note {
        margin: 0.65rem 0 1.5rem;
        color: var(--text-secondary);
        font-size: 0.82rem;
    }

    .input-group {
        display: flex;
        flex-direction: column;
    }

    .input-group.disabled {
        opacity: 0.5;
        pointer-events: none;
    }

    .label {
        margin-bottom: 0.5rem;
        display: block;
    }

    .label-text {
        font-weight: 600;
        color: var(--text-primary);
        font-size: 0.95rem;
        display: block;
        margin-bottom: 0.25rem;
    }

    .label-hint {
        font-size: 0.8rem;
        color: var(--text-secondary);
        display: block;
        font-weight: normal;
    }

    .input {
        padding: 0.75rem 1rem;
        border: 2px solid var(--border-light);
        border-radius: 8px;
        font-size: 1rem;
        transition: all 0.2s ease;
        background: var(--input-bg);
        color: var(--text-primary);
    }

    .input:focus {
        outline: none;
        border-color: var(--accent-blue);
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .input:hover {
        border-color: var(--border-hover);
    }

    .footer {
        text-align: center;
        color: rgba(255, 255, 255, 0.8);
        font-size: 0.9rem;
        margin-top: auto;
        padding-top: 1rem;
    }

    @media (max-width: 640px) {
        .container {
            padding: 1rem;
        }

        .title {
            font-size: 2rem;
        }

        .card {
            padding: 1.5rem;
        }

        .stepper,
        .summary-grid,
        .file-summary {
            grid-template-columns: 1fr;
        }

        .panel-header,
        .wizard-actions,
        .summary-block-header,
        .modal-header {
            flex-direction: column;
            align-items: flex-start;
        }

        .modal-backdrop {
            padding: 0.75rem;
        }

        .usage-modal {
            max-height: calc(100vh - 1.5rem);
            padding: 1rem;
        }

        .settings-grid,
        .advanced-settings-grid {
            grid-template-columns: 1fr;
            gap: 1.5rem;
        }

        .usage-grid {
            grid-template-columns: 1fr;
        }

        .upload-area {
            padding: 2rem 1rem;
        }

        .stepper-item {
            padding: 0.85rem 0.9rem;
        }
    }

    /* Success animation */
    @keyframes success {
        0% {
            transform: scale(1);
        }
        50% {
            transform: scale(1.05);
        }
        100% {
            transform: scale(1);
        }
    }

    .upload-area.has-file {
        animation: success 0.6s ease-out;
    }

    /* Focus styles for accessibility */
    .upload-label:focus-within .upload-area {
        outline: 2px solid #667eea;
        outline-offset: 2px;
    }

    .header,
    .card,
    .section-card,
    .summary-block,
    .summary-stat,
    .warning-card,
    .empty-state,
    .file-summary > div,
    .usage-modal,
    .usage-item,
    .upload-area {
        border-radius: 6px;
    }

    .header {
        border-left: 4px solid var(--ma-yellow);
    }

    .wizard-card {
        gap: 1rem;
    }

    .stepper {
        gap: 0.5rem;
    }

    .stepper-item {
        border-radius: 4px;
        padding: 0.7rem 0.75rem;
        background: #191a1f;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }

    .stepper-item:hover {
        transform: none;
        border-color: var(--ma-yellow);
        box-shadow: inset 0 0 0 1px rgba(245, 208, 0, 0.26);
    }

    .stepper-item.active {
        background: #23231c;
        border-color: var(--ma-yellow);
        box-shadow:
            inset 0 0 0 1px rgba(245, 208, 0, 0.42),
            0 0 14px rgba(245, 208, 0, 0.08);
    }

    .stepper-index {
        width: 24px;
        height: 24px;
        border-radius: 3px;
        background: #303136;
        color: var(--text-secondary);
        font-size: 0.82rem;
    }

    .stepper-item.active .stepper-index {
        background: var(--ma-yellow);
        color: #080808;
    }

    .stepper-label,
    .panel-header h2,
    .summary-block-header h3,
    .label-text,
    .macro-group-title {
        letter-spacing: 0;
    }

    .stepper-description {
        font-size: 0.76rem;
    }

    .primary-button,
    .macro-export-button {
        border: 1px solid #f6d83a;
        border-radius: 4px;
        background: var(--ma-yellow);
        color: #090909;
        box-shadow: none;
    }

    .primary-button:hover:not(:disabled),
    .macro-export-button:hover:not(:disabled) {
        transform: none;
        background: #ffe359;
        box-shadow: 0 0 0 3px rgba(245, 208, 0, 0.13);
    }

    .secondary-button,
    .modal-close-button {
        border-radius: 4px;
        background: #222329;
    }

    .new-file-button {
        border-radius: 4px;
        background: #3a1515;
        border: 1px solid var(--accent-red);
        box-shadow: none;
    }

    .new-file-button:hover {
        background: #4b1a1a;
        box-shadow: none;
    }

    .upload-section {
        margin-bottom: 1.2rem;
    }

    .upload-label:hover,
    .upload-area.drag-over {
        transform: none;
    }

    .upload-area {
        border-width: 2px;
        padding: 2.4rem 1.5rem;
        background:
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(180deg, #1b1c21, #121318);
        background-size: 44px 100%, auto;
    }

    .upload-area.drag-over {
        box-shadow: 0 0 0 3px rgba(245, 208, 0, 0.14);
    }

    .upload-area.has-file {
        box-shadow: inset 0 0 0 1px rgba(0, 212, 90, 0.35);
    }

    .upload-icon {
        color: var(--ma-yellow);
    }

    .upload-area.has-file .upload-icon,
    .upload-area:hover .upload-icon {
        color: var(--ma-green);
    }

    .upload-label:focus-within .upload-area {
        outline: 2px solid var(--ma-yellow);
    }

    .settings-grid {
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 0.85rem;
        align-items: start;
    }

    .input-group {
        min-width: 0;
    }

    .label {
        margin-bottom: 0.35rem;
    }

    .label-text {
        font-size: 0.84rem;
        text-transform: uppercase;
    }

    .label-hint {
        min-height: 2.1em;
        font-size: 0.76rem;
        line-height: 1.35;
    }

    .input {
        width: 100%;
        box-sizing: border-box;
        border-width: 1px;
        border-radius: 4px;
        padding: 0.62rem 0.7rem;
        font-size: 0.92rem;
        font-variant-numeric: tabular-nums;
    }

    .input:focus {
        border-color: var(--ma-yellow);
        box-shadow: 0 0 0 2px rgba(245, 208, 0, 0.2);
    }

    .prefixed-input {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: stretch;
    }

    .prefixed-input span {
        display: inline-flex;
        align-items: center;
        padding: 0 0.65rem;
        border: 1px solid var(--border-light);
        border-right: 0;
        border-radius: 4px 0 0 4px;
        background: #24252b;
        color: var(--ma-yellow);
        font-weight: 800;
        font-variant-numeric: tabular-nums;
    }

    .prefixed-input .input {
        border-radius: 0 4px 4px 0;
    }

    .select-input {
        appearance: none;
        background:
            linear-gradient(45deg, transparent 50%, var(--ma-yellow) 50%) calc(100% - 18px) 50% / 6px 6px no-repeat,
            linear-gradient(135deg, var(--ma-yellow) 50%, transparent 50%) calc(100% - 12px) 50% / 6px 6px no-repeat,
            var(--input-bg);
        padding-right: 2rem;
    }

    .compact-select {
        max-width: 260px;
    }

    .settings-preview-section {
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
        margin-top: 0.5rem;
        padding: 1rem;
        border: 1px solid #4b4d55;
        border-left: 4px solid var(--ma-yellow);
        border-radius: 6px;
        background: #0d0e12;
    }

    .preview-section-header {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 1rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid var(--border-light);
    }

    .preview-section-header h3 {
        margin: 0.15rem 0 0;
        font-size: 1.02rem;
    }

    .preview-section-header > span {
        color: var(--text-secondary);
        font-size: 0.85rem;
    }

    .macro-checkbox {
        accent-color: var(--ma-yellow);
    }

    .ma-info-strip {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(220px, 1fr) minmax(0, 1fr);
        gap: 0.75rem;
        align-items: stretch;
    }

    .ma-info-strip > div,
    .ma-info-strip code {
        border: 1px solid var(--border-light);
        border-radius: 4px;
        background: #17181d;
        padding: 0.85rem;
        min-width: 0;
    }

    .ma-info-strip code {
        display: flex;
        align-items: center;
        color: var(--ma-cyan);
        font-size: 0.88rem;
        line-height: 1.45;
        overflow-wrap: anywhere;
    }

    .ma-info-strip strong {
        display: block;
        color: var(--ma-green);
        margin: 0.1rem 0 0.35rem;
        font-variant-numeric: tabular-nums;
    }

    .ma-info-strip p {
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.82rem;
        line-height: 1.4;
    }

    .ma-info-label {
        display: block;
        color: var(--ma-yellow);
        font-size: 0.72rem;
        font-weight: 800;
        text-transform: uppercase;
    }

    .executor-preview {
        margin-top: 0;
    }

    .executor-strip {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 0.5rem;
    }

    .executor-tile {
        min-height: 92px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 0.45rem;
        padding: 0.65rem;
        border: 1px solid #4b4d55;
        border-top: 3px solid var(--ma-yellow);
        border-radius: 4px;
        background: linear-gradient(180deg, #2b2c33, #18191e);
    }

    .executor-tile.main-executor {
        border-top-color: var(--ma-green);
    }

    .executor-tile.bump-executor {
        border-top-color: var(--accent-orange);
    }

    .executor-tile-top {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
        color: var(--text-secondary);
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
    }

    .executor-tile strong {
        display: -webkit-box;
        overflow: hidden;
        color: var(--text-primary);
        font-size: 0.92rem;
        line-height: 1.25;
        line-clamp: 2;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
    }

    .executor-tile > span {
        color: var(--ma-green);
        font-size: 0.78rem;
        font-weight: 700;
    }

    .inline-empty {
        margin: 0;
        color: var(--text-secondary);
    }

    .timeline-preview-block {
        overflow: hidden;
    }

    .timeline-toolbar {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 0.75rem;
        align-items: end;
        margin-bottom: 0.85rem;
    }

    .timeline-view-switch {
        display: inline-flex;
        overflow: hidden;
        border: 1px solid var(--border-light);
        border-radius: 4px;
        background: #111216;
    }

    .timeline-view-switch button {
        min-height: 36px;
        padding: 0 0.75rem;
        border: 0;
        border-right: 1px solid var(--border-light);
        background: transparent;
        color: var(--text-secondary);
        font-weight: 800;
        cursor: pointer;
    }

    .timeline-view-switch button:last-child {
        border-right: 0;
    }

    .timeline-view-switch button.active-view {
        background: var(--ma-yellow);
        color: #090909;
    }

    .timeline-filter-grid {
        display: grid;
        grid-template-columns: minmax(160px, 1fr) minmax(160px, 1fr) auto;
        gap: 0.5rem;
        align-items: end;
        min-width: 0;
    }

    .timeline-filter {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
    }

    .timeline-filter span {
        color: var(--ma-yellow);
        font-size: 0.68rem;
        font-weight: 800;
        text-transform: uppercase;
    }

    .timeline-search-controls,
    .timeline-fold-controls {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        min-height: 36px;
    }

    .timeline-search-controls span {
        min-width: 54px;
        color: var(--text-secondary);
        font-size: 0.78rem;
        font-variant-numeric: tabular-nums;
        text-align: center;
    }

    .mini-button {
        min-height: 36px;
        padding: 0 0.62rem;
        font-size: 0.78rem;
        white-space: nowrap;
    }

    .mini-button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .timeline-simulator {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        margin-bottom: 0.85rem;
        padding: 0.75rem;
        border: 1px solid #3f4149;
        border-left: 3px solid var(--ma-yellow);
        border-radius: 4px;
        background: #0d0e12;
    }

    .timeline-transport {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 0.8rem;
        align-items: center;
        min-width: 0;
    }

    .timeline-transport-controls {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        min-width: 0;
    }

    .timeline-icon-button {
        width: 38px;
        height: 38px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 38px;
        border: 1px solid var(--border-light);
        border-radius: 4px;
        background: #222329;
        color: var(--text-primary);
        cursor: pointer;
        transition:
            border-color 0.15s ease,
            background 0.15s ease,
            color 0.15s ease,
            box-shadow 0.15s ease;
    }

    .timeline-icon-button svg {
        width: 19px;
        height: 19px;
        fill: currentColor;
    }

    .timeline-icon-button:hover:not(:disabled),
    .timeline-icon-button:focus-visible {
        border-color: var(--ma-yellow);
        color: var(--ma-yellow);
        outline: none;
        box-shadow: 0 0 0 2px rgba(245, 208, 0, 0.16);
    }

    .timeline-icon-button.playing {
        border-color: var(--ma-yellow);
        background: var(--ma-yellow);
        color: #090909;
    }

    .timeline-icon-button:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }

    .timeline-clock {
        min-width: 138px;
        display: inline-flex;
        align-items: baseline;
        gap: 0.35rem;
        color: var(--text-secondary);
        font-size: 0.84rem;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }

    .timeline-clock strong {
        color: var(--ma-green);
        font-size: 1rem;
    }

    .timeline-rate-select {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        min-width: 0;
    }

    .timeline-rate-select span {
        color: var(--ma-yellow);
        font-size: 0.68rem;
        font-weight: 800;
        text-transform: uppercase;
    }

    .timeline-rate-select select {
        height: 34px;
        min-width: 74px;
        border: 1px solid var(--border-light);
        border-radius: 4px;
        background:
            linear-gradient(45deg, transparent 50%, var(--ma-yellow) 50%) calc(100% - 15px) 50% / 5px 5px no-repeat,
            linear-gradient(135deg, var(--ma-yellow) 50%, transparent 50%) calc(100% - 10px) 50% / 5px 5px no-repeat,
            #050505;
        color: var(--text-primary);
        font-size: 0.82rem;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        padding: 0 1.45rem 0 0.55rem;
        appearance: none;
    }

    .timeline-rate-select select:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }

    .timeline-scrub {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 0.65rem;
        align-items: center;
        min-width: 0;
    }

    .timeline-scrub span {
        color: var(--ma-yellow);
        font-size: 0.68rem;
        font-weight: 800;
        text-transform: uppercase;
    }

    .timeline-scrub input {
        width: 100%;
        accent-color: var(--ma-yellow);
        cursor: pointer;
    }

    .timeline-scrub input:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }

    .timeline-preview {
        display: grid;
        grid-template-columns: minmax(180px, 250px) minmax(0, 1fr);
        border: 1px solid var(--border-light);
        border-radius: 4px;
        background: #090a0d;
        overflow: hidden;
    }

    .timeline-track-list {
        border-right: 1px solid #404149;
        background: #14151a;
        min-width: 0;
    }

    .timeline-track-meta {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 0.18rem;
        min-width: 0;
        padding: 0.5rem 0.65rem;
        border-bottom: 1px solid #33343b;
        border-left: 3px solid var(--timeline-color);
        background: #191a20;
    }

    .timeline-track-meta.collapsed-track {
        background: #111217;
    }

    .timeline-track-toggle {
        all: unset;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        grid-template-rows: auto auto auto;
        column-gap: 0.45rem;
        align-items: center;
        min-width: 0;
        cursor: pointer;
    }

    .timeline-track-toggle > span:first-child {
        grid-row: 1 / 4;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border: 1px solid color-mix(in srgb, var(--timeline-color) 70%, #111216);
        border-radius: 3px;
        color: var(--timeline-color);
        font-size: 1rem;
        font-weight: 900;
        line-height: 1;
        text-transform: none;
    }

    .timeline-track-toggle:focus-visible > span:first-child {
        outline: 2px solid var(--ma-yellow);
        outline-offset: 2px;
    }

    .timeline-ruler-meta {
        min-height: 36px;
        border-left-color: var(--ma-yellow);
        background: #2a2b31;
    }

    .timeline-track-meta span {
        overflow: hidden;
        color: var(--text-secondary);
        font-size: 0.68rem;
        font-weight: 800;
        line-height: 1.15;
        text-overflow: ellipsis;
        text-transform: uppercase;
        white-space: nowrap;
    }

    .timeline-track-meta strong {
        overflow: hidden;
        color: var(--text-primary);
        font-size: 0.82rem;
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .timeline-track-meta em {
        overflow: hidden;
        color: var(--ma-green);
        font-size: 0.72rem;
        font-style: normal;
        font-variant-numeric: tabular-nums;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .timeline-scroll {
        min-width: 0;
        overflow-x: auto;
        background: #0b0c10;
    }

    .timeline-scroll:focus {
        outline: 2px solid var(--ma-yellow);
        outline-offset: -2px;
    }

    .timeline-content {
        position: relative;
    }

    .timeline-ruler {
        position: relative;
        height: 36px;
        border-bottom: 1px solid #33343b;
        background:
            linear-gradient(180deg, #303139, #25262d),
            #25262d;
    }

    .timeline-ruler span {
        position: absolute;
        top: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        border-left: 1px solid rgba(255, 255, 255, 0.22);
        color: var(--text-secondary);
        font-size: 0.7rem;
        font-variant-numeric: tabular-nums;
        padding-left: 0.35rem;
        transform: translateX(-1px);
        white-space: nowrap;
    }

    .timeline-ruler span.major-tick {
        border-left-color: var(--ma-yellow);
        color: var(--ma-yellow);
        font-weight: 800;
    }

    .timeline-playhead {
        position: absolute;
        top: 0;
        bottom: 0;
        z-index: 3;
        width: 0;
        border-left: 2px solid var(--ma-yellow);
        pointer-events: none;
        transform: translateX(-1px);
    }

    .timeline-playhead::before {
        content: "";
        position: absolute;
        top: 0;
        left: -6px;
        width: 10px;
        height: 10px;
        border: 1px solid #090909;
        border-radius: 2px;
        background: var(--ma-yellow);
        box-shadow: 0 0 12px rgba(245, 208, 0, 0.6);
        transform: rotate(45deg);
    }

    .timeline-lane {
        position: relative;
        border-bottom: 1px solid #33343b;
        background: #15161b;
        overflow: visible;
    }

    .timeline-lane.collapsed-track,
    .timeline-lane.collapsed-track:nth-child(odd) {
        background:
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            #101115;
        background-size: 28px 100%, auto;
        overflow: hidden;
    }

    .timeline-lane:nth-child(odd) {
        background: #1a1b20;
    }

    .timeline-collapsed-note {
        position: absolute;
        top: 50%;
        left: 0.7rem;
        color: var(--text-secondary);
        font-size: 0.72rem;
        font-weight: 800;
        transform: translateY(-50%);
        text-transform: uppercase;
    }

    .timeline-grid-line {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 1px;
        background: rgba(255, 255, 255, 0.08);
        transform: translateX(-1px);
    }

    .timeline-grid-line.major-grid-line {
        background: rgba(245, 208, 0, 0.32);
    }

    .timeline-event {
        position: absolute;
        z-index: 2;
        display: inline-flex;
        align-items: flex-start;
        gap: 0.3rem;
        max-width: 168px;
        color: var(--text-primary);
        transform: translateX(-7px);
    }

    .timeline-event-dot {
        width: 12px;
        height: 12px;
        margin-top: 4px;
        flex: 0 0 12px;
        border: 1px solid #08090c;
        background: var(--timeline-color);
        box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.18),
            0 0 12px color-mix(in srgb, var(--timeline-color) 45%, transparent);
        transform: rotate(45deg);
    }

    .timeline-event-copy {
        min-width: 0;
        max-width: 144px;
        padding: 0.2rem 0.36rem;
        border: 1px solid color-mix(in srgb, var(--timeline-color) 55%, #111216);
        border-radius: 3px;
        background: rgba(13, 14, 18, 0.92);
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
    }

    .timeline-event-copy strong,
    .timeline-event-copy em {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .timeline-event-copy strong {
        color: var(--text-primary);
        font-size: 0.72rem;
        line-height: 1.1;
    }

    .timeline-event-copy em {
        color: var(--text-secondary);
        font-size: 0.64rem;
        font-style: normal;
        font-variant-numeric: tabular-nums;
        line-height: 1.15;
        margin-top: 0.12rem;
    }

    .timeline-event.derived-event .timeline-event-dot {
        background: #8f929b;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
    }

    .timeline-event.derived-event .timeline-event-copy {
        border-style: dashed;
        border-color: #6f737d;
    }

    .timeline-event.marker-search-match .timeline-event-dot {
        width: 15px;
        height: 15px;
        flex-basis: 15px;
        background: #ffffff;
        box-shadow:
            0 0 0 2px var(--ma-yellow),
            0 0 18px rgba(245, 208, 0, 0.75);
    }

    .timeline-event.marker-search-match .timeline-event-copy {
        border-color: var(--ma-yellow);
        background: #221f09;
    }

    .timeline-event.active-marker-match {
        z-index: 4;
        transform: translateX(-7px) scale(1.13);
    }

    .timeline-event.active-marker-match .timeline-event-dot {
        background: var(--ma-green);
        box-shadow:
            0 0 0 2px #ffffff,
            0 0 24px rgba(0, 212, 90, 0.85);
    }

    :global(.marker-focus-pulse) {
        animation: marker-search-pulse 0.9s ease-out;
    }

    .timeline-bpm-track {
        border-left-color: var(--timeline-color);
    }

    .timeline-sheet-wrap {
        overflow: auto;
        max-height: min(68vh, 720px);
        border: 1px solid var(--border-light);
        border-radius: 4px;
        background: #050505;
    }

    .timeline-sheet {
        width: 100%;
        min-width: 1220px;
        border-collapse: collapse;
        color: var(--text-primary);
        font-size: 0.86rem;
        font-variant-numeric: tabular-nums;
    }

    .timeline-sheet th,
    .timeline-sheet td {
        padding: 0.42rem 0.55rem;
        border-right: 1px solid #050505;
        border-bottom: 1px solid #111216;
        text-align: left;
        vertical-align: middle;
        white-space: nowrap;
    }

    .timeline-sheet th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: #202124;
        color: #d2d2d5;
        font-size: 0.76rem;
        font-weight: 800;
        text-transform: none;
    }

    .timeline-sheet tbody tr:nth-child(even) td {
        background: #232329;
    }

    .timeline-sheet tbody tr:nth-child(odd) td {
        background: #050505;
    }

    .timeline-sheet td:nth-child(5),
    .timeline-sheet td:nth-child(6),
    .timeline-sheet td:nth-child(8),
    .timeline-sheet td:nth-child(9),
    .timeline-sheet td:nth-child(11) {
        text-align: right;
    }

    .timeline-sheet-track-row td {
        border-left: 3px solid var(--timeline-color);
        background: #15161b !important;
        color: var(--text-secondary);
    }

    .timeline-sheet-track-row strong,
    .timeline-sheet-track-row span {
        display: inline-block;
        margin-right: 0.65rem;
    }

    .timeline-sheet-track-row strong {
        color: var(--text-primary);
    }

    .sheet-collapse-button {
        width: 24px;
        height: 24px;
        border: 1px solid color-mix(in srgb, var(--timeline-color) 70%, #111216);
        border-radius: 3px;
        background: #101115;
        color: var(--timeline-color);
        font-weight: 900;
        cursor: pointer;
    }

    .timeline-sheet tr.marker-search-match td {
        background: #241f06 !important;
        box-shadow: inset 0 0 0 1px rgba(245, 208, 0, 0.42);
    }

    .timeline-sheet tr.active-marker-match td {
        background: #113019 !important;
        color: #ffffff;
        box-shadow: inset 0 0 0 2px var(--ma-green);
    }

    .timeline-pad-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(122px, 1fr));
        gap: 0.55rem;
        margin-top: 0.85rem;
    }

    .timeline-pad {
        --pad-color: var(--ma-yellow);
        position: relative;
        min-width: 0;
        min-height: 122px;
        aspect-ratio: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 0.45rem;
        box-sizing: border-box;
        padding: 0.65rem;
        border: 1px solid #3f4149;
        border-top: 4px solid #5a5d66;
        border-radius: 4px;
        background:
            linear-gradient(180deg, #22242a, #101115 72%),
            #111216;
        color: #b8bbc3;
        filter: saturate(0.18) brightness(0.82);
        overflow: hidden;
        transition:
            border-color 0.22s ease,
            box-shadow 0.22s ease,
            filter 0.22s ease,
            background 0.22s ease;
    }

    .timeline-pad::after {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 0;
        border-radius: inherit;
        background:
            radial-gradient(circle at 50% 28%, color-mix(in srgb, var(--pad-color) 46%, transparent), transparent 62%),
            linear-gradient(180deg, color-mix(in srgb, var(--pad-color) 22%, transparent), transparent 64%);
        opacity: 0;
        pointer-events: none;
    }

    .timeline-pad > * {
        position: relative;
        z-index: 1;
    }

    .timeline-pad.active-pad {
        border-color: color-mix(in srgb, var(--pad-color) 72%, #ffffff);
        border-top-color: var(--pad-color);
        background:
            linear-gradient(180deg, color-mix(in srgb, var(--pad-color) 34%, #26272d), #17181d 72%),
            #17181d;
        box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--pad-color) 52%, transparent),
            0 0 18px color-mix(in srgb, var(--pad-color) 38%, transparent);
        color: var(--text-primary);
        filter: saturate(1) brightness(1.12);
    }

    .timeline-pad.held-pad {
        box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--pad-color) 64%, transparent),
            0 0 22px color-mix(in srgb, var(--pad-color) 44%, transparent);
    }

    .timeline-pad.flashing-pad {
        animation: none;
    }

    .timeline-pad.flashing-pad::after {
        animation: timeline-pad-flash 1.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .timeline-pad-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.35rem;
        color: var(--text-secondary);
        font-size: 0.66rem;
        font-weight: 800;
        line-height: 1.1;
        text-transform: uppercase;
    }

    .timeline-pad-top span,
    .timeline-pad-bottom span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .timeline-pad strong {
        display: -webkit-box;
        overflow: hidden;
        color: #b8bbc3;
        font-size: 0.86rem;
        line-height: 1.18;
        line-clamp: 2;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
    }

    .timeline-pad.active-pad strong {
        color: var(--text-primary);
    }

    .timeline-pad-bottom {
        display: grid;
        gap: 0.18rem;
        min-width: 0;
    }

    .timeline-pad-event {
        color: #aeb1b9;
        font-size: 0.72rem;
        font-weight: 700;
    }

    .timeline-pad.active-pad .timeline-pad-event {
        color: var(--text-primary);
    }

    .timeline-pad-meta {
        color: #757983;
        font-size: 0.66rem;
        font-variant-numeric: tabular-nums;
    }

    .timeline-pad.active-pad .timeline-pad-meta {
        color: var(--text-secondary);
    }

    .timeline-pad-status {
        color: #737780;
        font-size: 0.68rem;
        font-weight: 800;
        text-transform: uppercase;
    }

    .timeline-pad.active-pad .timeline-pad-status {
        color: var(--ma-green);
    }

    @keyframes marker-search-pulse {
        0% {
            filter: brightness(1.8);
            transform: scale(1.18);
        }
        100% {
            filter: brightness(1);
        }
    }

    @keyframes timeline-pad-flash {
        0% {
            opacity: 0.74;
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pad-color) 65%, transparent);
        }
        42% {
            opacity: 0.42;
            box-shadow: inset 0 0 24px color-mix(in srgb, var(--pad-color) 30%, transparent);
        }
        100% {
            opacity: 0;
            box-shadow: inset 0 0 0 transparent;
        }
    }

    .summary-grid {
        grid-template-columns: repeat(9, minmax(0, 1fr));
        gap: 0.5rem;
    }

    .summary-stat {
        padding: 0.75rem;
        background: var(--ma-row-alt);
    }

    .summary-stat-label {
        font-size: 0.7rem;
        letter-spacing: 0;
    }

    .summary-stat strong {
        font-size: 1.15rem;
    }

    .summary-block {
        background: #18191e;
    }

    .summary-table-wrap {
        overflow-x: auto;
        border: 1px solid var(--border-light);
        border-radius: 4px;
    }

    .summary-table {
        width: 100%;
        min-width: 760px;
        border-collapse: collapse;
        font-size: 0.88rem;
    }

    .summary-table th,
    .summary-table td {
        padding: 0.62rem 0.7rem;
        border-bottom: 1px solid #33343b;
        text-align: left;
        vertical-align: top;
    }

    .summary-table th {
        background: #2b2c33;
        color: var(--ma-yellow);
        font-size: 0.72rem;
        text-transform: uppercase;
        white-space: nowrap;
    }

    .summary-table tr:nth-child(even) td {
        background: var(--ma-row-alt);
    }

    .summary-table tr:nth-child(odd) td {
        background: var(--ma-row);
    }

    .summary-table tbody tr:hover td {
        background: #303139;
    }

    .summary-table td:first-child {
        min-width: 240px;
    }

    .summary-table td strong,
    .summary-table td span {
        display: block;
    }

    .summary-table td strong {
        margin-bottom: 0.2rem;
        color: var(--text-primary);
    }

    .summary-table td span {
        color: var(--text-secondary);
        font-size: 0.78rem;
    }

    .summary-chip,
    .macro-preset-list code,
    .syntax-examples code,
    .usage-item code,
    .transport-note,
    .status-message,
    .panel-badge {
        border-radius: 4px;
    }

    .summary-chip {
        background: #24252b;
    }

    .warning-card {
        border-color: var(--accent-orange);
        background: #241906;
    }

    .transport-note {
        border-color: var(--accent-orange);
        background: #201805;
    }

    .modal-backdrop {
        background: rgba(0, 0, 0, 0.72);
    }

    .usage-modal {
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.58);
    }

    .footer {
        color: var(--text-secondary);
    }

    .footer a {
        color: var(--ma-yellow);
    }

    @media (max-width: 1080px) {
        .settings-grid,
        .summary-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .ma-info-strip {
            grid-template-columns: 1fr;
        }
    }

    @media (max-width: 760px) {
        .container {
            padding: 0.75rem;
        }

        .header,
        .card {
            padding: 0.85rem;
        }

        .title {
            font-size: 1.2rem;
        }

        .subtitle {
            font-size: 0.84rem;
        }

        .stepper {
            grid-template-columns: 1fr 1fr;
        }

        .stepper-description {
            display: none;
        }

        .settings-grid,
        .advanced-settings-grid,
        .import-mode-comparison,
        .summary-grid,
        .file-summary,
        .usage-grid {
            grid-template-columns: 1fr;
        }

        .import-mode-card-header {
            flex-direction: column;
            align-items: flex-start;
        }

        .import-mode-card-header strong {
            text-align: left;
        }

        .label-hint {
            min-height: 0;
        }

        .panel-header,
        .wizard-actions,
        .summary-block-header,
        .preview-section-header,
        .modal-header {
            flex-direction: column;
            align-items: stretch;
        }

        .compact-select {
            max-width: none;
        }

        .executor-strip {
            grid-template-columns: 1fr;
        }

        .timeline-toolbar,
        .timeline-filter-grid,
        .timeline-transport {
            grid-template-columns: 1fr;
            align-items: stretch;
        }

        .timeline-view-switch,
        .timeline-search-controls,
        .timeline-fold-controls,
        .timeline-transport-controls {
            width: 100%;
        }

        .timeline-clock {
            margin-left: auto;
            min-width: 0;
        }

        .timeline-transport-controls {
            flex-wrap: wrap;
        }

        .timeline-rate-select {
            margin-left: auto;
        }

        .timeline-scrub {
            grid-template-columns: 1fr;
            gap: 0.35rem;
        }

        .timeline-view-switch button,
        .timeline-search-controls .mini-button,
        .timeline-fold-controls .mini-button {
            flex: 1;
        }

        .timeline-preview {
            grid-template-columns: minmax(132px, 38vw) minmax(0, 1fr);
        }

        .timeline-track-meta {
            padding: 0.45rem 0.5rem;
        }

        .timeline-track-meta strong {
            font-size: 0.76rem;
        }

        .timeline-event {
            max-width: 118px;
        }

        .timeline-event-copy {
            max-width: 96px;
        }

        .timeline-event-copy em {
            display: none;
        }

        .timeline-pad-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .timeline-pad {
            min-height: 112px;
        }

        .summary-table {
            min-width: 680px;
        }
    }
</style>
