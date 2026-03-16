
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
 * - Load normalized shot/config data into frontend runtime state
 * - Drive the asset editor, stage preview and render actions
 * - Glue together helper modules such as `state.js`, `dom.js`, `api.js`,
 *   `timeline.js`, `inspector.js` and `assets.js`
 *
 * Notes
 * -----
 * - This file still contains multiple concerns and should continue to be split
 *   into smaller modules over time.
 * - Audio metadata is loaded during bootstrap and cached in `state.audio`.
 * - The main orchestrator responsibilities remain:
 *   - `init()`
 *   - `loadVideoConfigData()`
 *   - `startVideoRender()`
 *   - `startPreviewFrameRender()`
 *   - `registerActionEvents()`
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
 */

import {dom} from "./assets/js/dom.js";

import {
  buildRenderOptions,
  requestAudioMetadata,
  requestPreviewFrame,
  requestVideoConfig,
  requestVideoRender,
} from "./assets/js/api.js";



import {
  resetRenderProgress,
  setOutput,
  setRenderProgress,
  setStatus,
  setVideoSubtitleInput,
  setVideoTitleInput,
  startRenderProgressAnimation,
  stopRenderProgressAnimation,
  syncActionButtonsState,
} from "./assets/js/ui.js";
import {UI_TEXT, state} from "./assets/js/state.js";
import {
  applyRenderedPreview,
  renderTimeline,
  registerTimelineEvents,
  updatePlayhead,
} from "./assets/js/timeline.js";
import {updateInspectorInfo} from "./assets/js/inspector.js";
import {
  buildAssetsFromShots,
  buildSegmentsFromShots,
  renderAssetList,
  showSegmentView,
  registerAssetEvents,
} from "./assets/js/assets.js";

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
 * Returns the normalized sidebar title value.
 *
 * @returns {string}
 */
function getPendingVideoTitle() {
  return String(dom.videoTitleInput?.value || "").trim();
}

/**
 * Returns the normalized sidebar subtitle value.
 *
 * @returns {string}
 */
function getPendingVideoSubtitle() {
  return String(dom.videoSubtitleInput?.value || "").trim();
}


/**
 * Loads all timeline and asset data into the runtime state.
 */
async function loadVideoConfigData() {
  const shots = await requestVideoConfig();

  state.assets = buildAssetsFromShots(shots);
  state.segments = buildSegmentsFromShots(shots.filter((shot) => Boolean(shot.assigned)));
}


/**
 * Loads normalized audio metadata into the shared runtime state.
 * If the backend audio endpoint is unavailable, the editor stays usable and
 * falls back to an empty audio state.
 */
async function loadAudioMetadata() {
  try {
    state.audio = await requestAudioMetadata();
  } catch (error) {
    console.error(error);
    state.audio = {
      hasAudio: false,
      durationSeconds: 0,
      beatCount: 0,
      transients: [],
      waveform: [],
    };
  }
}


/* -------------------------------------------------------------------------- */
/* ACTION PIPELINES                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Applies the success state of one GUI action.
 *
 * @param {string} successMessage
 * @param {any} result
 * @param {(result: any) => void | undefined} onSuccess
 */
function finalizeGuiActionSuccess(successMessage, result, onSuccess) {
  if (typeof onSuccess === "function") {
    onSuccess(result);
  }

  setStatus(successMessage);

  if (result !== undefined) {
    setOutput(result?.output || result?.publicUrl || `${successMessage}.`);
    return;
  }

  setOutput(`${successMessage}.`);
}

/**
 * Applies the error state of one GUI action.
 *
 * @param {string} actionName
 * @param {unknown} error
 */
function finalizeGuiActionError(actionName, error) {
  setStatus(`${actionName} fehlgeschlagen`, true);
  setOutput(String(error?.message || error));
}

/**
 * Resets the runtime state after one GUI action.
 */
function resetGuiActionState() {
  state.isRequestRunning = false;
  state.activeAction = null;
  syncActionButtonsState();
}

/**
 * Applies a reduced log strategy for the full video render.
 * Only start and finish messages remain in the left log panel.
 *
 * @param {string} phase
 */
function setVideoRenderLogPhase(phase) {
  if (phase === "start") {
    setOutput("Videorendering gestartet.");
    return;
  }

  if (phase === "success") {
    setOutput("Videorendering abgeschlossen.");
    return;
  }

  if (phase === "error") {
    setOutput("Videorendering fehlgeschlagen.");
  }
}

/**
 * Executes one async GUI action with shared loading, success and error handling.
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
    onSuccess: applyRenderedPreview,
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
    await requestVideoRender(buildRenderOptions());

    stopRenderProgressAnimation();
    setRenderProgress(100);
    setStatus(UI_TEXT.videoSuccessMessage);
    setVideoRenderLogPhase("success");
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
/* EVENT REGISTRATION                                                         */
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
 * Applies the current video title in local UI state only.
 */
function applyVideoTitle() {
  const nextValue = getPendingVideoTitle();

  if (!nextValue) {
    setStatus(UI_TEXT.videoTitleMissing, true);
    return;
  }

  setVideoTitleInput(nextValue);
  updateInspectorInfo();
  setStatus(UI_TEXT.videoTitleSaved);
  setOutput(`Video Title: ${nextValue}`);
}

/**
 * Applies the current video subtitle in local UI state only.
 */
function applyVideoSubtitle() {
  const nextValue = getPendingVideoSubtitle();

  if (!nextValue) {
    setStatus(UI_TEXT.videoSubtitleMissing, true);
    return;
  }

  setVideoSubtitleInput(nextValue);
  updateInspectorInfo();
  setStatus(UI_TEXT.videoSubtitleSaved);
  setOutput(`Video Subtitle: ${nextValue}`);
}
/**
 * Registers the sidebar video-meta actions.
 */
function registerVideoMetaEvents() {
  dom.setVideoTitleButton?.addEventListener("click", applyVideoTitle);
  dom.setVideoSubtitleButton?.addEventListener("click", applyVideoSubtitle);
}

/* -------------------------------------------------------------------------- */
/* BOOTSTRAP                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Applies the ready state after the initial data load.
 */
function finalizeInitialLoad() {
  renderTimeline();
  renderAssetList();
  showSegmentView();
  updatePlayhead(0);
  resetRenderProgress();
  updateInspectorInfo();
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
  syncActionButtonsState();
  registerTimelineEvents();
  registerAssetEvents();
  registerActionEvents();
  registerVideoMetaEvents();

  try {
    await loadVideoConfigData();
    await loadAudioMetadata();
    finalizeInitialLoad();
  } catch (error) {
    failInitialLoad(error);
  }
}

init();