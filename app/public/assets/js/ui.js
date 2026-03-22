/* ========================================================================== */
/* ui.js                                                                      */
/* ========================================================================== */
/*
 * Purpose
 * -------
 * Shared UI helper functions for the local README-video editor GUI.
 *
 * Responsibilities
 * ----------------
 * - Write status and output messages into the interface
 * - Control the render progress bar and its lightweight frontend animation
 * - Synchronize action-button disabled states
 * - Update panel captions, selection text and editor visibility
 * - Mirror video title and subtitle values into sidebar inputs
 *
 * Notes
 * -----
 * - This module is intentionally limited to UI updates and lightweight
 *   presentation state.
 * - All functions operate on shared `dom` references and the mutable `state`
 *   object.
 * - No backend requests are performed here.
 *
 * Change log
 * ----------
 * 2026-03-14
 * - Added structured module header and industrial-style section comments
 * - Removed unused imports unrelated to UI rendering
 * - Exported all shared UI helper functions for use from `index.js`
 */
/* ========================================================================== */

import {state, UI_TEXT} from "./state.js";
import {dom} from "./dom.js";
import { updateInspectorInfo } from "./project-inspector.js";

/* -------------------------------------------------------------------------- */
/* Status and output helpers                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Writes one status message into the left control panel.
 *
 * @param {string} message
 * @param {boolean} isError
 */
export function setStatus(message, isError = false) {
  if (!dom.statusText) return;

  dom.statusText.textContent = message;
  dom.statusText.className = isError ? "small text-danger" : "small text-secondary";
}

/**
 * Writes one process log into the log panel.
 *
 * @param {string} text
 */
export function setOutput(text) {
  if (!dom.outputBox) return;

  dom.outputBox.textContent = text;
}

/* -------------------------------------------------------------------------- */
/* Render progress helpers                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Updates the visual render progress bar and percentage label.
 *
 * @param {number} value
 */
export function setRenderProgress(value) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  state.renderProgressValue = safeValue;

  if (dom.renderProgressBar) {
    dom.renderProgressBar.style.width = `${safeValue}%`;
    dom.renderProgressBar.setAttribute("aria-valuenow", String(safeValue));
    dom.renderProgressBar.classList.toggle(
      "progress-bar-striped",
      safeValue > 0 && safeValue < 100
    );
    dom.renderProgressBar.classList.toggle(
      "progress-bar-animated",
      safeValue > 0 && safeValue < 100
    );
  }

  if (dom.renderProgressLabel) {
    dom.renderProgressLabel.textContent = `${safeValue}%`;
  }
}

/**
 * Starts a lightweight frontend progress animation for the full video render.
 * The animation approaches 90% and waits there until the backend request ends.
 */
export function startRenderProgressAnimation() {
  stopRenderProgressAnimation();
  setRenderProgress(4);

  state.renderProgressTimer = window.setInterval(() => {
    const currentValue = state.renderProgressValue;

    if (currentValue >= 90) {
      return;
    }

    const nextStep =
      currentValue < 20 ? 6 : currentValue < 50 ? 4 : currentValue < 75 ? 2 : 1;

    setRenderProgress(Math.min(90, currentValue + nextStep));
  }, 400);
}

/**
 * Stops the active frontend progress animation.
 */
export function stopRenderProgressAnimation() {
  if (state.renderProgressTimer === null) return;

  window.clearInterval(state.renderProgressTimer);
  state.renderProgressTimer = null;
}

/**
 * Resets the render progress UI back to 0%.
 */
export function resetRenderProgress() {
  stopRenderProgressAnimation();
  setRenderProgress(0);
}

/* -------------------------------------------------------------------------- */
/* UI state synchronization                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Enables or disables the primary action buttons.
 */
export function syncActionButtonsState() {
  if (dom.renderButton) {
    dom.renderButton.disabled = state.isRequestRunning;
  }

  if (dom.previewButton) {
    dom.previewButton.disabled = state.isRequestRunning;
  }
}

/**
 * Sets the center panel caption.
 *
 * @param {string} text
 */
export function setPanelCaption(text) {
  if (!dom.panelCaption) return;
  dom.panelCaption.textContent = text;
}

/**
 * Sets the selection info line in the panel header.
 *
 * @param {string} text
 */
export function setSelectionInfo(text) {
  if (!dom.selectionInfo) return;
  dom.selectionInfo.textContent = text;
}

/**
 * Opens one right-sidebar Bootstrap tab if the Bootstrap Tab API is available.
 * Fails silently when Bootstrap is not loaded or the target tab is missing.
 *
 * @param {HTMLElement | null | undefined} tabElement
 */
function openRightSidebarTab(tabElement) {
  if (!tabElement) return;

  const bootstrapTabApi = window.bootstrap?.Tab;
  if (!bootstrapTabApi?.getOrCreateInstance) return;

  bootstrapTabApi.getOrCreateInstance(tabElement).show();
}

/**
 * Shows or hides the JSON editor and keeps the right-sidebar tab selection in sync.
 * When the editor is shown, the "Gewählte Section" tab must become active.
 *
 * @param {boolean} isVisible
 */
export function toggleJsonEditor(isVisible) {
  dom.jsonEditor?.classList.toggle("d-none", !isVisible);

  if (isVisible) {
    openRightSidebarTab(dom.selectedSectionTab);
  }
}

/**
 * Shows or hides the segment placeholder.
 * When the placeholder is shown, the Clip tab should become active again.
 *
 * @param {boolean} isVisible
 */
export function toggleVideoPlaceholder(isVisible) {
  dom.videoPlaceholder?.classList.toggle("d-none", !isVisible);

  if (isVisible) {
    openRightSidebarTab(dom.clipTab);
  }
}

/**
 * Sets the current file name shown above the JSON editor.
 *
 * @param {string} fileName
 */
export function setJsonFileName(fileName) {
  if (!dom.jsonFileName) return;
  dom.jsonFileName.textContent = fileName;
}

/**
 * Fills the JSON editor form with metadata for one selected asset.
 *
 * @param {{json?: Record<string, any>}} asset
 */
export function fillJsonForm(asset) {
  const json = asset?.json && typeof asset.json === "object" ? asset.json : {};
  if (!Object.keys(json).length) return;

  if (dom.fieldSrc) dom.fieldSrc.value = json.src;
  if (dom.fieldTitle) dom.fieldTitle.value = json.title;
  if (dom.fieldDuration) dom.fieldDuration.value = json.duration ?? json.durationSeconds ?? "";
  if (dom.fieldTransition) dom.fieldTransition.value = json.transition;
  if (dom.fieldZoom) dom.fieldZoom.value = json.zoom;
  if (dom.fieldPan) dom.fieldPan.value = json.pan;
  if (dom.fieldCaption) dom.fieldCaption.value = json.caption;
}

/**
 * Builds one selection label for the currently opened asset editor.
 *
 * @param {{fileName?: string}} asset
 * @returns {string}
 */
export function buildAssetSelectionInfo(asset) {
  return `Bild: ${asset?.fileName || ""}`;
}

/**
 * Writes the current video title value into the sidebar field.
 *
 * @param {string} value
 */
function setVideoTitleInput(value) {
  state.videoTitle = value;

  if (!dom.videoTitleInput) return;
  dom.videoTitleInput.value = value;
}

/**
 * Writes the current video subtitle value into the sidebar field.
 *
 * @param {string} value
 */
function setVideoSubtitleInput(value) {
  state.videoSubtitle = value;

  if (!dom.videoSubtitleInput) return;
  dom.videoSubtitleInput.value = value;
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
 * Applies the current video title in local UI state only.
 */
export function applyVideoTitle() {
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
export function applyVideoSubtitle() {
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
 * Applies a reduced log strategy for the full video render.
 * Only start and finish messages remain in the left log panel.
 *
 * @param {string} phase
 */
export function setVideoRenderLogPhase(phase) {
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

/* -------------------------------------------------------------------------- */
/* GUI action pipelines                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Applies the success state of one GUI action.
 *
 * @param {string} successMessage
 * @param {any} result
 * @param {(result: any) => void | undefined} onSuccess
 */
export function finalizeGuiActionSuccess(successMessage, result, onSuccess) {
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
export function finalizeGuiActionError(actionName, error) {
  setStatus(`${actionName} fehlgeschlagen`, true);
  setOutput(String(error?.message || error));
}

/**
 * Resets the runtime state after one GUI action.
 */
export function resetGuiActionState() {
  state.isRequestRunning = false;
  state.activeAction = null;
  syncActionButtonsState();
}
