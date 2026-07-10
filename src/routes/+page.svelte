<script lang="ts">
    import {
        convertReaperCsvToArtifacts,
        createConversionPreview,
        createReaperTransportMacroOutputFile,
        createConversionOutputFiles,
        createExampleMacroPresetOutputFiles,
        downloadTextFile,
        exampleMacroPresetGroups,
        parseReaperMarkerRows,
        resolveExampleMacroTimecodeName,
        stripFileExtension,
        type ConversionArtifacts,
        type ConversionPreview,
        type ConversionSettings,
        type ImportMode,
        type ExportMode,
        type ExampleMacroPresetSelection,
        type ReaperMacroGeneratorOptions,
    } from "$lib/reaper2ma/index.js";

    let fileInput: HTMLInputElement;
    let uploadArea: HTMLElement;
    let activeStep = 1;
    let selectedCsvText = "";
    let selectedMarkerCount = 0;
    let sequenceNumber = 101;
    let appearanceStartNumber = 1;
    let sequenceNamePrefix = "MA";
    let timecodeNumber = 1;
    let pageNumber = 1;
    let pageSlotStart = 201;
    let cueStartNumber = 1;
    let speedMaster = "3.4";
    let prefix = "1";
    let importMode: ImportMode = "markers-only";
    let exportMode: ExportMode = "cues-and-timecode";
    let timecodeName = "";
    let exportShowTimeMacros = false;
    let exportTimecodeControlMacros = false;
    let transportOscSlotId = 1;
    let transportOscDataName = "REAPER";
    let transportMacroNamePrefix = "REAPER - ";
    let transportOutputFileName = "reaper_transport_macros.xml";
    let isDragOver = false;
    let isProcessing = false;
    let processingStatus = "";
    let processingCompleted = false;
    let selectedFileName = "";
    let selectedFileBaseName = "";
    let resolvedExampleMacroTimecodeName = "";
    let conversionSettings: ConversionSettings = {
        sequenceNumber,
        appearanceStartNumber,
        sequenceNamePrefix,
        timecodeNumber,
        pageNumber,
        pageSlotStart,
        cueStartNumber,
        speedMaster,
        prefix,
        importMode,
        exportMode,
    };
    let conversionArtifacts: ConversionArtifacts | undefined = undefined;
    let conversionPreview: ConversionPreview | undefined = undefined;

    const showTimePresetGroup = exampleMacroPresetGroups.find((group) => group.id === "show-time");
    const timecodeControlPresetGroup = exampleMacroPresetGroups.find((group) => group.id === "timecode-control");
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

    $: resolvedExampleMacroTimecodeName = resolveExampleMacroTimecodeName(timecodeName, selectedFileBaseName);
    $: conversionSettings = {
        sequenceNumber,
        appearanceStartNumber,
        sequenceNamePrefix,
        timecodeNumber,
        pageNumber,
        pageSlotStart,
        cueStartNumber,
        speedMaster,
        prefix,
        importMode,
        exportMode,
    };
    $: conversionArtifacts =
        selectedCsvText && selectedFileName
            ? convertReaperCsvToArtifacts(selectedCsvText, selectedFileName, conversionSettings)
            : undefined;
    $: conversionPreview = conversionArtifacts ? createConversionPreview(conversionArtifacts, selectedMarkerCount) : undefined;

    const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
            outputFileName: transportOutputFileName,
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

    async function processFile(file: File) {
        selectedCsvText = "";
        selectedMarkerCount = 0;
        selectedFileName = "";
        selectedFileBaseName = "";
        conversionArtifacts = undefined;
        conversionPreview = undefined;
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
            processingStatus = `✅ CSV loaded: ${rows.length} rows ready for review.`;
            processingCompleted = true;
            isProcessing = false;
        } catch (error) {
            processingStatus = "❌ Error processing file";
            console.error("Error processing CSV:", error);
            fileInput.value = "";
            isProcessing = false;
        }
    }

    async function exportConversionArtifacts() {
        if (!conversionArtifacts) {
            processingStatus = "Upload a CSV file before exporting.";
            processingCompleted = false;
            return;
        }

        setProcessingState("Generating macro XML...");

        try {
            await delay(100);

            for (const outputFile of createConversionOutputFiles(conversionArtifacts)) {
                downloadTextFile(outputFile.content, outputFile.name);
            }

            processingStatus = "✅ Macro generated successfully!";
            processingCompleted = true;
            isProcessing = false;
        } catch (error) {
            processingStatus = "❌ Error processing file";
            console.error("Error generating conversion artifacts:", error);
            fileInput.value = "";
            isProcessing = false;
        }
    }

    async function exportExampleMacros() {
        const files = createExampleMacroPresetOutputFiles({
            sourceFileName: selectedFileBaseName,
            timecodeName,
            selection: getMacroPresetSelection(),
        });

        if (files.length === 0) {
            processingStatus = "Select at least one example macro group and provide a timecode name or import a CSV file.";
            processingCompleted = false;
            return;
        }

        setProcessingState("Generating example macro presets...");

        try {
            await delay(100);

            for (const outputFile of files) {
                downloadTextFile(outputFile.content, outputFile.name);
            }

            processingStatus = "✅ Example macros generated successfully!";
            processingCompleted = true;
            setTimeout(() => {
                isProcessing = false;
                processingStatus = "";
            }, 500);
        } catch (error) {
            processingStatus = "❌ Error generating example macros";
            console.error("Error generating example macros:", error);
            setTimeout(() => {
                isProcessing = false;
                processingStatus = "";
            }, 3000);
        }
    }

    async function exportReaperTransportMacros() {
        setProcessingState("Generating REAPER transport macros...");

        try {
            await delay(100);
            const outputFile = createReaperTransportMacroOutputFile(getTransportMacroOptions());

            downloadTextFile(outputFile.content, outputFile.name);

            processingStatus = "✅ REAPER transport macros generated successfully!";
            processingCompleted = true;
            setTimeout(() => {
                isProcessing = false;
                processingStatus = "";
            }, 500);
        } catch (error) {
            processingStatus = error instanceof Error ? `❌ ${error.message}` : "❌ Error generating REAPER transport macros";
            console.error("Error generating REAPER transport macros:", error);
            setTimeout(() => {
                isProcessing = false;
                processingStatus = "";
            }, 3000);
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
        fileInput.value = "";
        selectedCsvText = "";
        selectedMarkerCount = 0;
        selectedFileName = "";
        selectedFileBaseName = "";
        processingCompleted = false;
        processingStatus = "";
        isProcessing = false;
        activeStep = 1;
        conversionArtifacts = undefined;
        conversionPreview = undefined;
    }
</script>

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
                                        ✅ {selectedFileName}
                                    {:else if isDragOver}
                                        📁 Drop your CSV file here
                                    {:else}
                                        📂 Click to select CSV file or drag & drop
                                    {/if}
                                </span>
                                <span class="upload-hint">Supports .csv files from Reaper</span>
                            {/if}
                        </div>
                    </label>
                    <input id="file-input" type="file" accept=".csv" bind:this={fileInput} on:change={handleFileChange} class="file-input" />
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
                            <span class="label-hint">e.g. Song Number</span>
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
                        <div class="label">
                            <span class="label-text">Import Mode</span>
                            <span class="label-hint">Choose the classic flow or the hybrid regions + markers flow.</span>
                        </div>
                        <div class="radio-group vertical">
                            <label class="radio-label">
                                <input type="radio" bind:group={importMode} value="markers-only" class="radio-input" />
                                <span class="radio-text">Markers only</span>
                            </label>
                            <label class="radio-label">
                                <input type="radio" bind:group={importMode} value="regions-and-markers" class="radio-input" />
                                <span class="radio-text">Regions + markers</span>
                            </label>
                        </div>
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
                            <span class="label-hint">Assigned to every created sequence and used by BPM tags, e.g. 3.4</span>
                        </label>
                        <input id="speed-master" type="text" bind:value={speedMaster} class="input" inputmode="text" />
                    </div>

                    <div class="input-group">
                        <label for="timecode-name" class="label">
                            <span class="label-text">Timecode Name</span>
                            <span class="label-hint">Used by the example macro presets, or fall back to the CSV filename</span>
                        </label>
                        <input id="timecode-name" type="text" bind:value={timecodeName} class="input" placeholder="Leave empty to use the imported CSV name" />
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
                            <span class="label-hint">Page receiving the generated sequence assignments</span>
                        </label>
                        <input id="page-number" type="number" min="1" max="9999" step="1" bind:value={pageNumber} class="input" />
                    </div>

                    <div class="input-group">
                        <label for="page-slot-start" class="label">
                            <span class="label-text">Page Slot Start</span>
                            <span class="label-hint">First executor slot used for generated sequences</span>
                        </label>
                        <input id="page-slot-start" type="number" min="1" max="9999" step="1" bind:value={pageSlotStart} class="input" />
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
                        <code>[ON_R2|OFF_R1] Arm next region</code>
                    </div>
                </div>

                <details class="advanced-mode-section section-card">
                    <summary class="section-summary">
                        <span class="label-text">Advanced</span>
                        <span class="label-hint">Additional options</span>
                    </summary>
                    <div>
                        <label for="cue-start-number" class="label">
                            <span class="label-text">Cue Start Number</span>
                            <span class="label-hint">Starting number for cues (1-9999)</span>
                        </label>
                        <input id="cue-start-number" type="number" min="1" max="9999" step="1" bind:value={cueStartNumber} class="input" />
                    </div>
                </details>

                <div class="export-mode-section">
                    <div class="label">
                        <span class="label-text">Export Mode</span>
                    </div>
                    <div class="radio-group">
                        <label class="radio-label">
                            <input type="radio" bind:group={exportMode} value="cues-and-timecode" class="radio-input" />
                            <span class="radio-text">Cues & Timecode</span>
                        </label>
                        <label class="radio-label">
                            <input type="radio" bind:group={exportMode} value="cues-only" class="radio-input" />
                            <span class="radio-text">Cues Only</span>
                        </label>
                    </div>
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
                            <span class="summary-stat-label">Markers in regions</span>
                            <strong>{conversionPreview.regionMarkerCount}</strong>
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
                            <h3>Generated sequence names</h3>
                            <span>{conversionPreview.generatedSequenceNames.length} sequence(s)</span>
                        </div>
                        <div class="chip-list">
                            {#each conversionPreview.generatedSequenceNames.slice(0, 8) as name}
                                <span class="summary-chip">{name}</span>
                            {/each}
                            {#if conversionPreview.generatedSequenceNames.length > 8}
                                <span class="summary-chip muted">+{conversionPreview.generatedSequenceNames.length - 8} more</span>
                            {/if}
                        </div>
                    </div>

                    <div class="summary-block">
                        <div class="summary-block-header">
                            <h3>Files to download</h3>
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
                        <button type="button" class="primary-button" on:click={exportConversionArtifacts} disabled={isProcessing}>Generate macro XML</button>
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

                    <button
                        type="button"
                        class="macro-export-button"
                        on:click={exportExampleMacros}
                        disabled={isProcessing || (!exportShowTimeMacros && !exportTimecodeControlMacros) || !resolvedExampleMacroTimecodeName}
                    >
                        Generate selected example macros
                    </button>
                </div>

                <div class="section-card macro-presets-card">
                    <div class="label">
                        <span class="label-text">REAPER transport macros</span>
                        <span class="label-hint">Standalone grandMA3 macro library for OSC transport control.</span>
                    </div>

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

                    <button type="button" class="macro-export-button" on:click={exportReaperTransportMacros} disabled={isProcessing}>
                        Generate REAPER transport macros
                    </button>
                </div>

                <div class="usage-card section-card">
                    <div class="label">
                        <span class="label-text">What you can encode</span>
                        <span class="label-hint">Use square brackets at the start or end of the marker name.</span>
                    </div>
                    <div class="usage-grid">
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
                            <code>R1 / R2</code>
                            <p>Hybrid mode uses regions as sequences and assigns each marker to the deepest region that contains it.</p>
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

                <div class="wizard-actions">
                    <button type="button" class="secondary-button" on:click={() => (activeStep = 3)} disabled={!conversionArtifacts}>Back to summary</button>
                </div>
            </section>
        {/if}
    </div>

    <footer class="footer">
        <p>Made with Svelte - View <a target="_blank" href="https://github.com/hrueger/reaper2ma">Source on GitHub</a></p>
        <p>&copy; 2025 - 2026 Hannes Rüger</p>
    </footer>
</main>

<style>
    :global(:root) {
        /* Light theme variables */
        --bg-gradient-start: #667eea;
        --bg-gradient-end: #764ba2;
        --text-primary: #333;
        --text-secondary: #666;
        --text-white: white;
        --card-bg: white;
        --card-border: rgba(255, 255, 255, 0.2);
        --upload-bg: #fafafa;
        --upload-hover: #f0f4ff;
        --upload-success: #f0fdf4;
        --upload-processing: #fffbeb;
        --border-light: #e5e7eb;
        --border-hover: #9ca3af;
        --accent-blue: #667eea;
        --accent-green: #22c55e;
        --accent-orange: #f59e0b;
        --accent-red: #ef4444;
        --accent-red-dark: #dc2626;
        --input-bg: white;
        --shadow-light: rgba(0, 0, 0, 0.1);
        --shadow-medium: rgba(0, 0, 0, 0.2);
        --info-bg: rgba(255, 255, 255, 0.95);
        --info-border: rgba(255, 255, 255, 0.3);
        --step-bg: #f8fafc;
        --note-bg: #f0f9ff;
        --note-border: #0ea5e9;
    }

    :global(:root) {
        color-scheme: light dark;
    }

    @media (prefers-color-scheme: dark) {
        :global(:root) {
            /* Dark theme variables */
            --bg-gradient-start: #1e1b4b;
            --bg-gradient-end: #312e81;
            --text-primary: #e5e7eb;
            --text-secondary: #9ca3af;
            --text-white: #f9fafb;
            --card-bg: #1f2937;
            --card-border: rgba(75, 85, 99, 0.3);
            --upload-bg: #374151;
            --upload-hover: #1e3a8a;
            --upload-success: #064e3b;
            --upload-processing: #451a03;
            --border-light: #4b5563;
            --border-hover: #6b7280;
            --accent-blue: #818cf8;
            --accent-green: #34d399;
            --accent-orange: #fbbf24;
            --accent-red: #f87171;
            --accent-red-dark: #ef4444;
            --input-bg: #374151;
            --shadow-light: rgba(0, 0, 0, 0.3);
            --shadow-medium: rgba(0, 0, 0, 0.5);
            --info-bg: rgba(31, 41, 55, 0.95);
            --info-border: rgba(75, 85, 99, 0.3);
            --step-bg: #4b5563;
            --note-bg: #1e3a8a;
            --note-border: #3b82f6;
        }
    }

    :global(body) {
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        background: linear-gradient(135deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%);
        min-height: 100vh;
        color: var(--text-primary);
        transition:
            background 0.3s ease,
            color 0.3s ease;
    }

    .container {
        max-width: 980px;
        margin: 0 auto;
        padding: 2rem 1rem;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        gap: 2rem;
    }

    .header {
        text-align: center;
        color: var(--text-white);
        margin-bottom: 1rem;
    }

    .title {
        font-size: 2.5rem;
        font-weight: 700;
        margin: 0 0 0.5rem 0;
        text-shadow: 0 2px 4px var(--shadow-light);
    }

    .subtitle {
        font-size: 1.1rem;
        opacity: 0.9;
        margin: 0;
        font-weight: 300;
    }

    .card {
        background: var(--card-bg);
        border-radius: 16px;
        padding: 1.5rem;
        box-shadow: 0 10px 30px var(--shadow-medium);
        backdrop-filter: blur(10px);
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

    .usage-card {
        margin-top: 1rem;
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

    .radio-group {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
        margin-top: 0.75rem;
    }

    .radio-group.vertical {
        grid-template-columns: 1fr;
    }

    .radio-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        border: 2px solid var(--border-light);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        background: var(--upload-bg);
    }

    .radio-label:hover {
        border-color: var(--accent-blue);
        background: var(--upload-hover);
    }

    .radio-input {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: var(--accent-blue);
    }

    .radio-text {
        color: var(--text-primary);
        font-size: 0.95rem;
        font-weight: 500;
    }

    .radio-label:has(.radio-input:checked) {
        border-color: var(--accent-blue);
        background: var(--upload-hover);
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .settings-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 2rem;
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
        .summary-block-header {
            flex-direction: column;
            align-items: flex-start;
        }

        .radio-group {
            grid-template-columns: 1fr;
        }

        .settings-grid {
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
</style>
