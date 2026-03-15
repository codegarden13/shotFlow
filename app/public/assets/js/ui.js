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

import {state} from "./state.js";
import {dom} from "./dom.js";

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
 * Shows or hides the JSON editor.
 *
 * @param {boolean} isVisible
 */
export function toggleJsonEditor(isVisible) {
  dom.jsonEditor?.classList.toggle("d-none", !isVisible);
}

/**
 * Shows or hides the segment placeholder.
 *
 * @param {boolean} isVisible
 */
export function toggleVideoPlaceholder(isVisible) {
  dom.videoPlaceholder?.classList.toggle("d-none", !isVisible);
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
 * Writes the current video title value into the sidebar field.
 *
 * @param {string} value
 */
export function setVideoTitleInput(value) {
  state.videoTitle = value;

  if (!dom.videoTitleInput) return;
  dom.videoTitleInput.value = value;
}

/**
 * Writes the current video subtitle value into the sidebar field.
 *
 * @param {string} value
 */
export function setVideoSubtitleInput(value) {
  state.videoSubtitle = value;

  if (!dom.videoSubtitleInput) return;
  dom.videoSubtitleInput.value = value;
}
