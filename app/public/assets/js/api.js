/* ========================================================================== */
/* api.js   (api client)                                                                  */
/* ========================================================================== */
/*
 * Purpose
 * -------
 * Frontend API helpers for the local README-video editor GUI.
 *
 * Responsibilities
 * ----------------
 * - Build request payloads from the current UI state
 * - Send JSON requests to the backend API
 * - Enforce the shared `{ok: true}` response contract
 * - Expose one focused helper per backend endpoint
 *
 * Notes
 * -----
 * - All requests return parsed JSON payloads.
 * - Non-OK backend responses are converted into thrown `Error` instances.
 * - This module only contains request wiring, not UI orchestration.
 *
 * Change log
 * ----------
 * 2026-03-15
 * - Refactored module into generic helpers, payload helpers and endpoint calls
 * - Added GET helper for future metadata endpoints
 * - Kept public exports minimal and explicit for `index.js`
 *
 * 2026-03-21
 * - Extended `requestAudioMetadata()` to map beat-sync UI fields from the backend
 */
/* ========================================================================== */

import {dom} from "./dom.js";
//import {buildDefaultProjectTitle} from "./video-config-shape.js";

/* -------------------------------------------------------------------------- */
/* Generic request helpers                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Parses one backend response and enforces the shared success contract.
 *
 * @param {Response} response
 * @param {string} url
 * @returns {Promise<any>}
 */
async function parseJsonResponse(response, url) {
  const data = await response.json();

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Request failed: ${url}`);
  }

  return data;
}

/**
 * Runs one JSON request.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 * //TODO:prüfen ob sich daraus ein graph für analyse bauen lässt was wir die oft aufgerufen
 */
async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  return parseJsonResponse(response, url);
}

/**
 * Runs one JSON GET request.
 *
 * @param {string} url
 * @returns {Promise<any>}
 */
async function getJson(url) {
  return requestJson(url);
}

/**
 * Runs one JSON POST request.
 *
 * @param {string} url
 * @param {any} payload
 * @returns {Promise<any>}
 */
async function postJson(url, payload) {
  return requestJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

/* -------------------------------------------------------------------------- */
/* UI-derived request payload helpers                                         */
/* -------------------------------------------------------------------------- */

/**
 * Builds the shared render options payload from the current UI state.
 *
 * @returns {{format: string, look: string, draft: boolean}}
 */
export function buildRenderOptions() {
  return {
    format: dom.renderFormat?.value || "standard",
    look: dom.renderLook?.value || "default",
    draft: Boolean(dom.renderDraft?.checked),
  };
}

/* -------------------------------------------------------------------------- */
/* Endpoint-specific request helpers                                          */
/* -------------------------------------------------------------------------- */

/**
 * Loads shot and project-config data for the active project.
 *
 * @returns {Promise<any>}
 */
export async function requestVideoConfig() {
  return getJson("/api/video-config");
}

/**
 * Loads normalized audio metadata from the backend.
 *
 * @returns {Promise<any>}
 */
export async function requestAudioMetadata() {
  const data = await getJson("/api/audio-metadata");

  return {
    hasAudio: Boolean(data?.hasAudio),
    durationSeconds: Number(data?.durationSeconds ?? 0),
    beatCount: Number(data?.beatCount ?? 0),
    transients: Array.isArray(data?.transients) ? data.transients : [],
    waveform: Array.isArray(data?.waveform) ? data.waveform : [],
    filename: String(data?.filename || "music.mp3"),
    beatsFilename: String(data?.beatsFilename || "music-beats.json"),
    beatSyncEnabled: Boolean(data?.beatSyncEnabled),
    beatSyncStep: Number(data?.beatSyncStep ?? 1),
    beatSyncActive: Boolean(data?.beatSyncActive),
    loopMode: String(data?.loopMode || "Loop / frei"),
  };
}

/**
 * Saves one shot configuration entry to the backend.
 *
 * @param {Record<string, any>} payload
 * @returns {Promise<any>}
 */
export async function requestSaveShot(payload) {
  return postJson("/api/video-config/shot", payload);
}

/**
 * Requests one exact preview frame from the backend.
 *
 * @param {{format: string, look: string, draft: boolean, frame: number, outputName: string}} payload
 * @returns {Promise<any>}
 */
export async function requestPreviewFrame(payload) {
  return postJson("/api/preview-frame", payload);
}

/**
 * Requests a full MP4 render from the backend.
 *
 * @param {{format: string, look: string, draft: boolean}} payload
 * @returns {Promise<any>}
 */
export async function requestVideoRender(payload) {
  return postJson("/api/render", payload);
}

/**
 * Loads all selectable project folders for the project dropdown.
 *
 * @returns {Promise<any>}
 */
export async function requestProjects() {
  return getJson("/api/projects");
}

/**
 * Selects one project as the active backend runtime project.
 *
 * @param {string} project
 * @returns {Promise<any>}
 */
export async function requestSelectProject(project) {
  return postJson("/api/project/select", {project});
}

/**
 * Saves project-level video metadata for the active project.
 *
 * @param {Record<string, any>} payload
 * @returns {Promise<any>}
 */
export async function requestSaveProjectConfig(payload) {
  return postJson("/api/video-config/project", payload);
}

/**
 * Saves one complete `video.config.json` payload for the active project.
 *
 * @param {{project?: any, shots?: any[]}|Record<string, any>} payload
 * @returns {Promise<any>}
 */
export async function requestSaveVideoConfig(payload) {
  return postJson("/api/video-config", payload);
}
