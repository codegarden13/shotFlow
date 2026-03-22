/* ========================================================================== */
/* index.js                                                                   */
/* ========================================================================== */
/*
 * Purpose
 * -------
 * Main frontend orchestration module for the local README-video editor GUI.
 *
 * Responsibilities
 * ----------------
 * - Coordinate UI state, DOM updates and backend actions
 * - Load normalized shot, segment and audio metadata into frontend runtime state
 * - Drive the asset editor, stage preview, render actions and timeline sync
 * - Register cross-module UI events during bootstrap
 * - Glue together helper modules such as `state.js`, `dom.js`, `api.js`,
 *   `video-timeline.js`, `audio-timeline-host.js`, `inspector.js` and `assets.js`
 *
 * Notes
 * -----
 * - This file remains the orchestration layer and should avoid owning low-level
 *   DOM, persistence or rendering details directly.
 * - Runtime data is split into three main streams:
 *   - raw project config for editor inputs from `requestVideoConfig()`
 *   - resolved project / shot config for runtime rendering from `requestVideoConfig()`
 *   - audio metadata from `requestAudioMetadata()`
 *   - UI-only interaction state from `state.js`
 * - Project switching intentionally performs a full editor reload so asset rail,
 *   timelines, inspector and stage stay in sync with the selected project.
 * - Project-level video settings are now persisted through
 *   
 *   project-config frontend module over time.
 *
 * Change log
 * ----------
 * 2026-03-14
 * - Added structured module header
 * - Cleaned import formatting and section spacing
 * - Kept runtime behavior unchanged during refactor
 *
 * 2026-03-15
 * - Implemented `inspector.js` and `assets.js`
 * - Moved audio metadata loading into bootstrap instead of top-level execution
 * - Tightened comments and removed stale host-runtime wording
 *
 * 2026-03-16
 * - Tightened bootstrap flow around audio-timeline initialization
 * - Cleaned action, event and bootstrap section wording
 * - Split initial timeline rendering into dedicated video/audio orchestration helpers
 *
 * 2026-03-17
 * - Added project-config persistence wiring for title and subtitle actions
 * - Added project-selection reload flow so right-rail assets update correctly
 * - Refined module notes to better describe orchestration boundaries
 *
 * - Added right-sidebar tab-state orchestration for clip vs. selected-section UI
 * - Kept film metadata always visible while selected-section stays disabled until selection
 */
/* ========================================================================== */

import {dom} from "./assets/js/dom.js";
import {
  buildRenderOptions,
  requestPreviewFrame,
  requestSaveVideoConfig,
  requestVideoConfig,
  requestVideoRender,
  requestProjects,
  requestSaveProjectConfig,
} from "./assets/js/api.js";

import {
  applyProjectConfigToInputs,
  getProjectConfigPayload,
} from "./assets/js/ui.config.js";

import {
  finalizeGuiActionError,
  finalizeGuiActionSuccess,
  resetGuiActionState,
  setOutput,
  setRenderProgress,
  setStatus,
  setVideoRenderLogPhase,
  startRenderProgressAnimation,
  stopRenderProgressAnimation,
  syncActionButtonsState,
} from "./assets/js/ui.js";

import {UI_TEXT, state} from "./assets/js/state.js";

import {registerVideoTimelineEvents,renderVideoTimeline,updateVideoPlayhead,} from "./assets/js/video-timeline.js";

import {updateInspectorInfo} from "./assets/js/project-inspector.js";

import {buildAssetsFromShots} from "./assets/js/assets-builder.js";

import {registerAssetEvents } from "./assets/js/assets.js"

import {buildSegmentsFromShots,} from "./assets/js/video-timeline.js";

import {renderAudioTimelineHost,updateAudioTimelineHostPlayhead,} from "./assets/js/audio-timeline/audio-timeline-host.js";

import {
  loadLatestRenderedVideo,
  registerRenderedVideoEvents,
  resetRenderedVideoStage,
} from "./assets/js/video-stage.js";

import {
  resetProjectSelectionState,
  rebuildEditorAfterProjectReload,
  registerProjectSelectEvents,
} from "./assets/js/project-reloader.js";

import {loadAudioMetadata} from "./assets/js/audio.js";

//TODO Re-Use method mit / ausbau / Standard so wie rca
console.log("[BUILD MARKER] index.js 2026-03-21 A");


/* -------------------------------------------------------------------------- */
/* Right sidebar tab helpers                                                  */
/* -------------------------------------------------------------------------- */

const clipTabEl = document.getElementById("clipTab");
const selectedSectionTabEl = document.getElementById("selectedSectionTab");

/**
 * Returns the Bootstrap tab API from the global runtime if available.
 *
 * @returns {any | null}
 */
function getBootstrapTabApi() {
  return globalThis.bootstrap?.Tab || null;
}

/**
 * Shows one sidebar tab when Bootstrap tab support is available.
 *
 * @param {HTMLElement | null} tabElement
 */
function showSidebarTab(tabElement) {
  const TabApi = getBootstrapTabApi();
  if (!TabApi || !tabElement) return;

  TabApi.getOrCreateInstance(tabElement).show();
}

/**
 * Keeps the selected-section tab disabled until a clip is actively selected.
 */
function disableSelectedSectionTab() {
  if (!selectedSectionTabEl) return;

  selectedSectionTabEl.classList.add("disabled");
  selectedSectionTabEl.setAttribute("aria-disabled", "true");
  showSidebarTab(clipTabEl);
}

/**
 * Enables the selected-section tab and switches to it.
 */
function enableSelectedSectionTab() {
  if (!selectedSectionTabEl) return;

  selectedSectionTabEl.classList.remove("disabled");
  selectedSectionTabEl.removeAttribute("aria-disabled");
  showSidebarTab(selectedSectionTabEl);
}

/**
 * Synchronizes the right-sidebar tabs with the current clip selection state.
 */
function syncRightSidebarTabs() {
  if (state.activeAssetId) {
    enableSelectedSectionTab();
    return;
  }

  disableSelectedSectionTab();
}

function getSelectedProjectName() {
  return dom.videoShotsSelect?.value || "";
}

/**
 * Returns the raw project config for editor inputs when available.
 * Falls back to the resolved config so older API responses continue to work.
 *
 * @param {any} response
 * @returns {any}
 */
function getEditorProjectConfig(response) {
  return response?.rawProjectConfig || response?.projectConfig || {};
}

function getConfiguredProjectConfig() {
  return state.rawProjectConfig && typeof state.rawProjectConfig === "object"
    ? state.rawProjectConfig
    : {project: {}, shots: []};
}

function readProjectConfigFromInputs() {
  return getProjectConfigPayload()?.project || {};
}

function normalizeDurationValue(value) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) && nextValue >= 0 ? nextValue : 0;
}

function normalizeProjectDurations(project) {
  return {
    ...project,
    targetDurationSeconds: normalizeDurationValue(project?.targetDurationSeconds),
    introDurationSeconds: normalizeDurationValue(project?.introDurationSeconds),
    outroDurationSeconds: normalizeDurationValue(project?.outroDurationSeconds),
  };
}

function getConfiguredShots() {
  return Array.isArray(getConfiguredProjectConfig()?.shots)
    ? getConfiguredProjectConfig().shots
    : [];
}

function calculateShotsDurationSeconds(shots) {
  return (Array.isArray(shots) ? shots : []).reduce(
    (sum, shot) => sum + normalizeDurationValue(shot?.durationSeconds),
    0,
  );
}

function retimeShotsToMainDuration(shots, project) {
  const targetDurationSeconds = normalizeDurationValue(project?.targetDurationSeconds);
  const normalizedShots = Array.isArray(shots) ? structuredClone(shots) : [];

  if (!targetDurationSeconds || normalizedShots.length === 0) {
    return normalizedShots;
  }

  const currentTotalDurationSeconds = calculateShotsDurationSeconds(normalizedShots);
  if (currentTotalDurationSeconds <= 0) {
    return normalizedShots;
  }

  const durationScale = targetDurationSeconds / currentTotalDurationSeconds;
  let assignedDurationSeconds = 0;

  return normalizedShots.map((shot, index) => {
    const isLastShot = index === normalizedShots.length - 1;
    const currentDurationSeconds = normalizeDurationValue(shot?.durationSeconds);
    const nextDurationSeconds = isLastShot
      ? Math.max(0.01, targetDurationSeconds - assignedDurationSeconds)
      : Math.max(0.01, currentDurationSeconds * durationScale);

    assignedDurationSeconds += nextDurationSeconds;

    return {
      ...shot,
      durationSeconds: nextDurationSeconds,
    };
  });
}

async function reloadCurrentProjectData() {
  await loadInitialEditorData();
  resetProjectSelectionState();
  rebuildEditorAfterProjectReload();
}

/**
 * Persists the current project-level configuration.
 */
async function saveCurrentProjectConfig() {
  const payload = getProjectConfigPayload();
  await requestSaveProjectConfig(payload);
}


/**
 * Saves the current project config on field exit.
 *
 * @param {string} successMessage
 * @returns {Promise<void>}
 */
async function saveProjectConfigOnBlur(successMessage) {
  try {
    await saveCurrentProjectConfig();
    setStatus(successMessage);
  } catch (error) {
    console.error(error);
    setStatus("Projekt-Settings konnten nicht gespeichert werden.", true);
    setOutput(String(error?.message || error));
  }
}

async function handleDurationBlur(successMessage) {
  try {
    const currentConfig = getConfiguredProjectConfig();
    const projectConfig = {
      ...(currentConfig?.project || {}),
      ...readProjectConfigFromInputs(),
    };
    const normalizedProject = normalizeProjectDurations(projectConfig);
    const retimedShots = retimeShotsToMainDuration(
      getConfiguredShots(),
      normalizedProject,
    );
    const nextConfig = {
      ...currentConfig,
      project: normalizedProject,
      shots: retimedShots,
    };

    await requestSaveVideoConfig(nextConfig);
    await reloadCurrentProjectData();
    setStatus(successMessage);
  } catch (error) {
    console.error(error);
    setStatus("Dauern konnten nicht gespeichert werden.", true);
    setOutput(String(error?.message || error));
  }
}

function registerProjectFieldSaveEvent(element, eventName, successMessage) {
  element?.addEventListener(eventName, () => {
    void saveProjectConfigOnBlur(successMessage);
  });
}

function registerDurationFieldBlurEvent(element, successMessage) {
  element?.addEventListener("blur", () => {
    void handleDurationBlur(successMessage);
  });
}

function registerBlurProjectFieldSaves(fields) {
  fields.forEach(({element, successMessage}) => {
    registerProjectFieldSaveEvent(element, "blur", successMessage);
  });
}

function registerChangeProjectFieldSaves(fields) {
  fields.forEach(({element, successMessage}) => {
    registerProjectFieldSaveEvent(element, "change", successMessage);
  });
}

function renderProjectOptions(projects, activeProject) {
  if (!dom.videoShotsSelect) return;

  dom.videoShotsSelect.innerHTML = projects
    .map((project) => {
      const selected = project === activeProject ? " selected" : "";
      return `<option value="${project}"${selected}>${project}</option>`;
    })
    .join("");
}

async function loadProjectOptions() {
  const data = await requestProjects();
  renderProjectOptions(data.projects || [], data.activeProject || "Project-test");
}


/* -------------------------------------------------------------------------- */
/* FORMAT HELPERS                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Computes the current frame number from the current timeline position.
 *
 * @returns {number}
 */
function getCurrentFrame() {
  return Math.max(0, Math.round(state.currentTime));
}

/**
 * Builds an array of unassigned asset objects from available files and assigned assets.
 */
function buildUnassignedAssets(availableFiles, assignedAssets) {
  const assignedFileNames = new Set(
    assignedAssets.map((asset) => asset.fileName)
  );

  return availableFiles
    .filter((fileName) => !assignedFileNames.has(fileName))
    .map((fileName, index) => ({
      id: `unassigned-${index}-${fileName}`,
      fileName,
      thumb: `/video-shots/${encodeURIComponent(fileName)}`,
      assigned: false,
      json: {
        src: fileName,
        title: fileName,
        duration: 3,
        durationSeconds: 3,
        transition: "",
        zoom: 1,
        pan: "center",
        caption: "",
        assigned: false,
      },
    }));
}

/**
 * Combines assigned and unassigned assets into a single array.
 */
function buildAssets(assignedAssets, availableFiles) {
  const unassignedAssets = buildUnassignedAssets(availableFiles, assignedAssets);
  return [...assignedAssets, ...unassignedAssets];
}

/**
 * Loads shot and project-config data from `/api/video-config` into runtime state.
 */
async function loadVideoConfigAndBuildState() {
  const response = await requestVideoConfig();
  const shots = response?.shots || [];
  const editorProjectConfig = getEditorProjectConfig(response);

  console.log("[rca] video-config response", response);
  console.log("[rca] rawProjectConfig", response?.rawProjectConfig);
  console.log("[rca] projectConfig", response?.projectConfig);
  console.log(
    "[rca] editor title/subtitle",
    editorProjectConfig?.project?.title,
    editorProjectConfig?.project?.subtitle,
  );

  state.rawProjectConfig = editorProjectConfig || null;
  state.projectConfig = response?.projectConfig || editorProjectConfig || null;
  state.shots = shots;

  // --- Build assets from configured shots
  const assignedAssets = buildAssetsFromShots(shots);

  // --- Merge with all available image files (unassigned assets)
  const availableFiles = response?.files || response?.images || [];

  state.assets = buildAssets(assignedAssets, availableFiles);

  console.log("[segments] input count", shots?.length);
console.log("[segments] input", shots);

  state.segments = buildSegmentsFromShots(
    shots.filter((shot) => shot?.assigned !== false)
  );

  applyProjectConfigToInputs(editorProjectConfig);
}




/**
 * Loads all core editor data required for the initial bootstrap.
 */
async function loadInitialEditorData() {
  await loadVideoConfigAndBuildState();
  await loadAudioMetadata();
}

/**
 * Registers all top-level UI events required by the editor runtime.
 */
function registerUiEvents() {
  registerVideoTimelineEvents();
  registerAssetEvents();
  registerActionEvents();
  registerVideoMetaEvents();
  registerRenderedVideoEvents();
  registerProjectSelectEvents();

  dom.assetList?.addEventListener("click", () => {
    queueMicrotask(syncRightSidebarTabs);
  });

  dom.backToSegmentButton?.addEventListener("click", () => {
    queueMicrotask(syncRightSidebarTabs);
  });
}

/**
 * Re-renders both timeline rows using the current runtime state.
 */
function renderEditorTimelines() {
  renderVideoTimeline();
  renderAudioTimelineHost();
}

/**
 * Resets both visible timeline playheads to the start position.
 */
function resetEditorPlayheads() {
  updateVideoPlayhead(0);
  updateAudioTimelineHostPlayhead(0);
}

/**
 * Executes one async GUI action with shared loading, success and error handling.
 * This helper is currently used for preview rendering and remains available for
 * future extracted action modules.
 *
 * @param {{
 *   actionName: string,
 *   startMessage: string,
 *   initialOutput: string,
 *   successMessage: string,
 *   run: () => Promise<any>,
 *   onSuccess?: (result: any) => void,
 * }} options
 */
async function runGuiAction({
  actionName,
  startMessage,
  initialOutput,
  successMessage,
  run,
  onSuccess,
}) {
  if (state.isRequestRunning) return;

  state.isRequestRunning = true;
  state.activeAction = actionName;
  syncActionButtonsState();

  setStatus(startMessage);
  setOutput(initialOutput);

  try {
    const result = await run();
    finalizeGuiActionSuccess(successMessage, result, onSuccess);
  } catch (error) {
    finalizeGuiActionError(actionName, error);
  } finally {
    resetGuiActionState();
  }
}

/**
 * Starts one exact preview-frame render for the current playhead position.
 */
async function startPreviewFrameRender() {
  const payload = {
    ...buildRenderOptions(),
    frame: getCurrentFrame(),
    outputName: "current-frame",
  };

  await runGuiAction({
    actionName: UI_TEXT.previewActionName,
    startMessage: UI_TEXT.previewStartMessage,
    initialOutput: UI_TEXT.previewInitialOutput,
    successMessage: UI_TEXT.previewSuccessMessage,
    run: () => requestPreviewFrame(payload),
  });
}

/**
 * Starts the full video render.
 * The render keeps the left log intentionally compact: only start, success
 * and the real error text are shown.
 */
async function startVideoRender() {
  if (state.isRequestRunning) return;

  state.isRequestRunning = true;
  state.activeAction = UI_TEXT.videoActionName;
  syncActionButtonsState();

  setStatus(UI_TEXT.videoStartMessage);
  setVideoRenderLogPhase("start");
  startRenderProgressAnimation();

  try {
    const result = await requestVideoRender(buildRenderOptions());
    const renderUrl = String(result?.publicUrl || "").trim();

    stopRenderProgressAnimation();
    setRenderProgress(100);
    setStatus(UI_TEXT.videoSuccessMessage);
    setVideoRenderLogPhase("success");

    if (renderUrl) {
      loadLatestRenderedVideo(renderUrl);
    } else {
      resetRenderedVideoStage();
      setOutput("Render abgeschlossen, aber keine Preview-URL vom Backend erhalten.");
    }
  } catch (error) {
    stopRenderProgressAnimation();
    setRenderProgress(0);
    setStatus(`${UI_TEXT.videoActionName} fehlgeschlagen`, true);
    setOutput(String(error?.message || error || "Videorendering fehlgeschlagen."));
  } finally {
    state.isRequestRunning = false;
    state.activeAction = null;
    syncActionButtonsState();
  }
}

/* -------------------------------------------------------------------------- */
/* Event registration                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Registers preview and full-render button events.
 */
function registerActionEvents() {
  dom.previewButton?.addEventListener("click", startPreviewFrameRender);
  dom.renderButton?.addEventListener("click", startVideoRender);
  dom.renderFormat?.addEventListener("change", updateInspectorInfo);
  dom.renderLook?.addEventListener("change", updateInspectorInfo);
  dom.renderDraft?.addEventListener("change", updateInspectorInfo);
}

/**
 * Registers the sidebar project/video metadata fields.
 *
 * Project-level settings are persisted automatically whenever the user leaves
 * a changed input field. The old explicit title/subtitle action buttons are no
 * longer wired here.
 */
function registerVideoMetaEvents() {
  registerBlurProjectFieldSaves([
    {element: dom.videoTitleInput, successMessage: "Videotitel gespeichert."},
    {element: dom.videoSubtitleInput, successMessage: "Videosubtitel gespeichert."},
    {element: dom.videoIntroTextInput, successMessage: "Intro-Text gespeichert."},
    {element: dom.videoAudioStartSecondsInput, successMessage: "Audio-Start gespeichert."},
    {element: dom.videoOutroTextInput, successMessage: "Outro-Text gespeichert."},
    {element: dom.videoLayerColorInput, successMessage: "Layer-Farbe gespeichert."},
    {element: dom.videoWidthInput, successMessage: "Videobreite gespeichert."},
  ]);

  registerDurationFieldBlurEvent(dom.videoTargetDurationSecondsInput, "Zieldauer gespeichert.");
  registerDurationFieldBlurEvent(dom.videoIntroDurationInput, "Intro-Dauer gespeichert.");
  registerDurationFieldBlurEvent(dom.videoOutroDurationInput, "Outro-Dauer gespeichert.");

  registerChangeProjectFieldSaves([
    {element: dom.videoAspectRatioInput, successMessage: "Seitenverhältnis gespeichert."},
    {element: dom.videoTemplateInput, successMessage: "Template gespeichert."},
  ]);
}
/* -------------------------------------------------------------------------- */
/* BOOTSTRAP                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Rebuilds the visible editor panels after the initial data load.
 */
function rebuildInitialEditorView() {
  resetProjectSelectionState();
  rebuildEditorAfterProjectReload();
}

/**
 * Rebuilds the initial visible editor state after all core data sources have
 * been loaded into runtime state.
 */
function finalizeInitialLoad() {
  rebuildInitialEditorView();
  setStatus(UI_TEXT.shotsLoaded);
  setOutput("Assets geladen. Nicht zugeordnete Bilder sind grau markiert.");
}

/**
 * Applies the error state for the initial data load.
 *
 * @param {unknown} error
 */
function failInitialLoad(error) {
  setStatus(UI_TEXT.loadingError, true);
  setOutput(String(error?.message || error));
}

/**
 * Initializes the frontend application.
 */
async function init() {
  console.log("[rca] init:start");

  await fetch("/api/dev-log/reset", {method: "POST"});
  console.log("[rca] init:after-reset");

  await loadProjectOptions();
  console.log("[rca] init:after-project-options");

  syncActionButtonsState();
  registerUiEvents();
  console.log("[rca] init:after-register");

  disableSelectedSectionTab();

  try {
    console.log("[rca] init:before-loadInitialEditorData");
    await loadInitialEditorData();
    console.log("[rca] init:after-loadInitialEditorData");

    finalizeInitialLoad();
  } catch (error) {
    console.error("[rca] init:error", error);
    failInitialLoad(error);
  }
}

init();
