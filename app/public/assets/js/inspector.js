/* ========================================================================== */
/* inspector.js                                                               */
/* ========================================================================== */
/*
 * Purpose
 * -------
 * Inspector metadata helpers for video editor GUI.
 *
 * Responsibilities
 * ----------------
 * - Derive compact video, render and audio summaries from runtime state
 * - Format inspector values for the left sidebar
 * - Write computed metadata into the dedicated DOM fields
 *
 * Notes
 * -----
 * - Current audio and beat-sync values still use conservative defaults until
 *   real media analysis is wired in.
 * - This module intentionally exposes only the public helpers that other
 *   modules should call.
 *
 * Change log
 * ----------
 * 2026-03-15
 * - Added explicit imports for `dom` and `state`
 * - Exported the inspector update helpers for `index.js`
 * - Kept internal formatting and counting helpers private to this module
 */
/* ========================================================================== */

import {dom} from "./dom.js";
import {state} from "./state.js";
import {getTotalDuration} from "./timeline.js";

/* -------------------------------------------------------------------------- */
/* Inspector defaults                                                         */
/* -------------------------------------------------------------------------- */

const VIDEO_TIMING = {
  introFrames: 60,
  outroFrames: 60,
  fps: 30,
  width: 1920,
  height: 1080,
};

const AUDIO_DEFAULTS = {
  fileName: "music.mp3",
  beatFileName: "music-beats.json",
};

/* -------------------------------------------------------------------------- */
/* Format helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Formats one frame count as a human-readable duration string.
 *
 * @param {number} frameCount
 * @returns {string}
 */
export function formatFramesAsDuration(frameCount) {
  const safeFrames = Math.max(0, Number(frameCount) || 0);
  const seconds = safeFrames / VIDEO_TIMING.fps;
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = Math.floor(seconds % 60);

  return `${String(minutes).padStart(2, "0")}:${String(remainderSeconds).padStart(2, "0")}`;
}

/**
 * Formats one boolean as `Ja` or `Nein`.
 *
 * @param {boolean} value
 * @returns {string}
 */
function formatBoolean(value) {
  return value ? "Ja" : "Nein";
}

/**
 * Writes one text value into a DOM node if it exists.
 *
 * @param {HTMLElement | null | undefined} element
 * @param {string} value
 */
function setInfoText(element, value) {
  if (!element) return;
  element.textContent = value;
}

/* -------------------------------------------------------------------------- */
/* Inspector helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Returns the current number of assigned shots.
 *
 * @returns {number}
 */
function getAssignedShotCount() {
  return state.assets.filter((asset) => asset.assigned).length;
}

/**
 * Returns the current number of assigned shots that contain captions.
 *
 * @returns {number}
 */
function getCaptionShotCount() {
  return state.assets.filter(
    (asset) => asset.assigned && String(asset.json.caption || "").trim()
  ).length;
}

/**
 * Returns the current number of assigned shots that contain transitions.
 *
 * @returns {number}
 */
function getTransitionShotCount() {
  return state.assets.filter(
    (asset) => asset.assigned && String(asset.json.transition || "").trim()
  ).length;
}







/**
 * Returns the total render duration in frames.
 *
 * @returns {number}
 */
function getTotalVideoFrames() {
  return VIDEO_TIMING.introFrames + getTotalDuration() + VIDEO_TIMING.outroFrames;
}

/**
 * Returns the normalized aspect ratio label.
 *
 * @returns {string}
 */
function getAspectRatioLabel() {
  return "16:9";
}

/**
 * Returns whether the project currently includes background audio.
 *
 * @returns {boolean}
 */
function hasAudioTrack() {
  return true;
}

/**
 * Returns whether beat-sync is currently active.
 *
 * @returns {boolean}
 */
function isBeatSyncActive() {
  return false;
}

/**
 * Returns the current render look summary.
 *
 * @returns {string}
 */
function getRenderLookSummary() {
  const format = dom.renderFormat?.value || "standard";
  const look = dom.renderLook?.value || "default";
  return `${format} / ${look}`;
}

/**
 * Returns the current output file name shown in the inspector.
 *
 * @returns {string}
 */
function getOutputFileName() {
  return "demo.mp4";
}

/**
 * Returns a lightweight render duration estimate.
 *
 * @returns {string}
 */
function getEstimatedRenderDuration() {
  const totalFrames = getTotalVideoFrames();

  if (totalFrames < 450) return "kurz";
  if (totalFrames < 900) return "mittel";
  return "lang";
}



/**
 * Updates the left inspector panel with current video, render and audio info.
 */
export function updateInspectorInfo() {
  const totalFrames = getTotalVideoFrames();
  const totalDuration = formatFramesAsDuration(totalFrames);
  const assignedShots = getAssignedShotCount();
  const captionShots = getCaptionShotCount();
  const transitionShots = getTransitionShotCount();
  const audioDuration = formatFramesAsDuration(totalFrames);
  const musicVsVideo = `${audioDuration} / ${formatFramesAsDuration(totalFrames)}`;

  setInfoText(dom.videoInfoTotalFrames, String(totalFrames));
  setInfoText(dom.videoInfoDuration, totalDuration);
  setInfoText(dom.videoInfoFps, String(VIDEO_TIMING.fps));
  setInfoText(dom.videoInfoResolution, `${VIDEO_TIMING.width}×${VIDEO_TIMING.height}`);
  setInfoText(dom.videoInfoAspectRatio, getAspectRatioLabel());
  setInfoText(dom.videoInfoShots, String(assignedShots));
  setInfoText(dom.videoInfoCaptionShots, String(captionShots));
  setInfoText(dom.videoInfoTransitionShots, String(transitionShots));
  setInfoText(
    dom.videoInfoIntroOutro,
    `${VIDEO_TIMING.introFrames} / ${VIDEO_TIMING.outroFrames} Frames`
  );

  setInfoText(dom.renderInfoTemplateLook, getRenderLookSummary());
  setInfoText(dom.renderInfoEstimatedDuration, getEstimatedRenderDuration());
  setInfoText(dom.renderInfoOutputFile, getOutputFileName());

  setInfoText(dom.audioInfoPresent, formatBoolean(hasAudioTrack()));
  setInfoText(dom.audioInfoFile, AUDIO_DEFAULTS.fileName);
  setInfoText(dom.audioInfoDuration, audioDuration);
  setInfoText(dom.audioInfoMusicVsVideo, musicVsVideo);
  setInfoText(dom.audioInfoBeatFile, AUDIO_DEFAULTS.beatFileName);
  setInfoText(dom.audioInfoBeatCount, "–");
  setInfoText(dom.audioInfoBeatSyncActive, formatBoolean(isBeatSyncActive()));
  setInfoText(dom.audioInfoLoopMode, "Loop / frei");
}



