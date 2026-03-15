/* ========================================================================== */
/* assets.js                                                                  */
/* ========================================================================== */
/*
 * Purpose
 * -------
 * Asset rail and JSON editor logic for the local README-video editor GUI.
 *
 * Responsibilities
 * ----------------
 * - Render the right-side asset list
 * - Resolve assets from runtime state by id
 * - Drive the JSON editor / asset-detail mode in the center panel
 * - Persist shot edits and merge saved backend responses back into runtime state
 * - Keep timeline and inspector state synchronized after asset changes
 *
 * Notes
 * -----
 * - This module expects higher-level orchestration helpers such as
 *   `buildShotSavePayload()`, `buildAssetsFromShots()`, `buildSegmentsFromShots()`,
 *   `renderTimeline()`, `updateInspectorInfo()`, `openAssetEditor()`,
 *   `saveActiveAssetBeforeSwitch()`, `getAssetActiveClass()`, `getTotalDuration()`
 *   and `updatePlayhead()` to remain available in the current frontend runtime.
 * - Keep this module focused on asset/editor concerns, not render orchestration.
 *
 * Change log
 * ----------
 * 2026-03-15
 * - Added structured module header and consistent section layout
 * - Exported the main asset/editor helpers for use from `index.js`
 * - Kept card rendering internal while cleaning spacing and comments
 */
/* ========================================================================== */

//
import {dom} from "./dom.js";


import {SHOT_DEFAULTS, state, UI_TEXT} from "./state.js";
import {requestSaveShot} from "./api.js";


import {
  setJsonFileName,
  setPanelCaption,
  setSelectionInfo,
  toggleJsonEditor,
  toggleVideoPlaceholder,
} from "./ui.js";


import {updatePlayhead, renderTimeline,getTotalDuration} from "./timeline.js";






/**
 * Returns the active CSS class for one asset card.
 *
 * @param {string} assetId
 * @returns {string}
 */
function getAssetActiveClass(assetId) {
  return assetId === state.activeAssetId ? "active" : "";
}



/**
 * Builds a save payload from the current JSON editor form state.
 *
 * @param {any} asset
 * @returns {Record<string, any> | null}
 */
function buildShotSavePayload(asset) {
  if (!asset) return null;

  return {
    id: asset.id,
    src: dom.fieldSrc?.value || asset.json.src || asset.fileName,
    title: dom.fieldTitle?.value || "",
    headline: dom.fieldTitle?.value || "",
    duration: Number(dom.fieldDuration?.value || SHOT_DEFAULTS.duration),
    transition: dom.fieldTransition?.value || SHOT_DEFAULTS.transition,
    zoom: Number(dom.fieldZoom?.value || SHOT_DEFAULTS.zoom),
    pan: dom.fieldPan?.value || SHOT_DEFAULTS.pan,
    caption: dom.fieldCaption?.value || SHOT_DEFAULTS.caption,
  };
}



/**
 * Maps normalized shot data to asset-rail entries.
 *
 * @param {any[]} shots
 * @returns {Array<{id: string, assigned: boolean, fileName: string, thumb: string, json: object}>}
 */
export function buildAssetsFromShots(shots) {
  return shots.map((shot, index) => ({
    id: shot.id || `asset-${index + 1}`,
    assigned: Boolean(shot.assigned),
    fileName: String(shot.src || `shot-${index + 1}.png`).split("/").pop(),
    thumb: shot.previewUrl || toPreviewUrl(shot.src),
    json: {
      src: shot.src || "",
      title: shot.title || shot.headline || "",
      duration: Number(shot.duration ?? shot.durationInFrames ?? SHOT_DEFAULTS.duration),
      transition: shot.transition || SHOT_DEFAULTS.transition,
      zoom: shot.zoom ?? SHOT_DEFAULTS.zoom,
      pan: shot.pan || SHOT_DEFAULTS.pan,
      caption: shot.caption || SHOT_DEFAULTS.caption,
    },
  }));
}



/* -------------------------------------------------------------------------- */
/* DATA MAPPERS                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Maps normalized shot data to timeline segments.
 *
 * @param {any[]} shots
 * @returns {Array<{id: string, label: string, start: number, end: number, image: string}>}
 */
export function buildSegmentsFromShots(shots) {
  let currentStart = 0;

  return shots.map((shot, index) => {
    const duration = Number(shot.duration ?? shot.durationInFrames ?? SHOT_DEFAULTS.duration);
    const segment = {
      id: shot.id || `segment-${index + 1}`,
      label: shot.title || shot.headline || `Shot ${index + 1}`,
      start: currentStart,
      end: currentStart + duration,
      image: shot.previewUrl || toPreviewUrl(shot.src),
    };

    currentStart += duration;
    return segment;
  });
}



/* -------------------------------------------------------------------------- */
/* Asset lookup and rendering                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Finds one asset by id.
 *
 * @param {string} assetId
 * @returns {any | undefined}
 */
export function findAssetById(assetId) {
  return state.assets.find((entry) => entry.id === assetId);
}

/**
 * Builds the HTML markup for one asset card.
 *
 * @param {{id: string, fileName: string, thumb: string, json: {title: string}, assigned: boolean}} asset
 * @returns {string}
 */
function renderAssetCard(asset) {
  const activeClass = getAssetActiveClass(asset.id);
  const assignedClass = asset.assigned ? "" : "unassigned";
  const assignedBadge = asset.assigned
    ? '<span class="badge text-bg-primary">Shot</span>'
    : '<span class="badge text-bg-secondary">Nicht zugeordnet</span>';

  return `
    <article class="asset-item ${activeClass} ${assignedClass}" data-asset-id="${asset.id}">
      <div class="asset-thumb-shell">
        <img class="asset-thumb" src="${asset.thumb}" alt="${asset.fileName}" />
        <div class="asset-overlay"></div>
        <div class="asset-badge">${assignedBadge}</div>
      </div>
      <div class="p-3">
        <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
          <div class="fw-semibold">${asset.fileName}</div>
        </div>
        <div class="small text-secondary">${asset.json.title || "Ohne Titel"}</div>
      </div>
    </article>
  `;
}

/**
 * Renders the right-side asset list.
 */
export function renderAssetList() {
  if (!dom.assetList) return;
  dom.assetList.innerHTML = state.assets.map(renderAssetCard).join("");
}


/**
 * Maps one local image source into the public preview URL served by Express.
 *
 * @param {string} src
 * @returns {string}
 */
export function toPreviewUrl(src = "") {
  const fileName = String(src || "").split("/").pop();
  return fileName ? `/video-shots/${encodeURIComponent(fileName)}` : "";
}


/* -------------------------------------------------------------------------- */
/* Editor helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Fills the JSON editor form with metadata for one selected asset.
 *
 * @param {{json: Record<string, any>}} asset
 */
export function fillJsonForm(asset) {
  if (!asset?.json) return;

  if (dom.fieldSrc) dom.fieldSrc.value = asset.json.src;
  if (dom.fieldTitle) dom.fieldTitle.value = asset.json.title;
  if (dom.fieldDuration) dom.fieldDuration.value = asset.json.duration;
  if (dom.fieldTransition) dom.fieldTransition.value = asset.json.transition;
  if (dom.fieldZoom) dom.fieldZoom.value = asset.json.zoom;
  if (dom.fieldPan) dom.fieldPan.value = asset.json.pan;
  if (dom.fieldCaption) dom.fieldCaption.value = asset.json.caption;
}

/**
 * Switches the center panel into JSON editor mode for one asset.
 *
 * @param {string} assetId
 */
export async function showAssetEditor(assetId) {
  if (state.isRequestRunning) return;

  const asset = findAssetById(assetId);
  if (!asset) return;

  if (state.activeAssetId && state.activeAssetId !== assetId) {
    await saveActiveAssetBeforeSwitch(assetId);
  }

  const nextAsset = findAssetById(assetId);
  if (!nextAsset) return;

  openAssetEditor(nextAsset);
}



/**
 * Applies the selected asset to the JSON editor UI.
 *
 * @param {any} asset
 */
function openAssetEditor(asset) {
  state.activeAssetId = asset.id;
  renderAssetList();
  fillJsonForm(asset);
  setJsonFileName(asset.fileName);
  toggleJsonEditor(true);
  toggleVideoPlaceholder(false);
  setPanelCaption(UI_TEXT.assetModeCaption);
  setSelectionInfo(`Bild: ${asset.fileName}`);
}


/**
 * Switches the center panel back to segment mode.
 */
export function showSegmentView() {
  state.activeAssetId = null;
  renderAssetList();
  toggleJsonEditor(false);
  toggleVideoPlaceholder(true);
  setPanelCaption(UI_TEXT.segmentModeCaption);
  updatePlayhead((state.currentTime / getTotalDuration()) * 100);
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Saves the currently selected asset before switching to another asset.
 *
 * @returns {Promise<void>}
 */
export async function persistActiveAssetIfNeeded() {
  if (!state.activeAssetId) return;

  const activeAsset = findAssetById(state.activeAssetId);
  const payload = buildShotSavePayload(activeAsset);

  if (!payload) return;

  const response = await requestSaveShot(payload);
  mergeSavedAsset(response.shot);
}

/**
 * Replaces or appends one saved asset in local runtime state.
 *
 * @param {any} savedShot
 */
export function mergeSavedAsset(savedShot) {
  const nextAsset = buildAssetsFromShots([savedShot])[0];
  const existingIndex = state.assets.findIndex(
    (asset) => asset.fileName === nextAsset.fileName
  );

  if (existingIndex >= 0) {
    state.assets[existingIndex] = nextAsset;
  } else {
    state.assets.push(nextAsset);
  }

  state.segments = buildSegmentsFromShots(
    state.assets
      .filter((asset) => asset.assigned)
      .map((asset) => ({
        id: asset.id,
        title: asset.json.title,
        duration: asset.json.duration,
        transition: asset.json.transition,
        zoom: asset.json.zoom,
        pan: asset.json.pan,
        caption: asset.json.caption,
        src: asset.json.src,
        previewUrl: asset.thumb,
        assigned: asset.assigned,
      }))
  );

  updateInspectorInfo();
  renderTimeline();
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Registers asset-rail interaction events.
 */
export function registerAssetEvents() {
  dom.assetList?.addEventListener("click", async (event) => {
    const card = event.target.closest("[data-asset-id]");
    if (!card) return;
    await showAssetEditor(card.dataset.assetId);
  });

  dom.backToSegmentButton?.addEventListener("click", showSegmentView);
}
