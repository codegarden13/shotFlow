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
 * - Normalize duration handling around canonical `durationSeconds`
 *
 * Notes
 * -----
 * - This module expects higher-level orchestration helpers such as
 *   `buildShotSavePayload()`, `buildAssetsFromShots()`, `buildSegmentsFromShots()`,
 *   `renderVideoTimeline()`, `updateInspectorInfo()`, `openAssetEditor()`,
 *   `persistActiveAssetIfNeeded()`, `getTotalDuration()`
 *   and `updateVideoPlayhead()` to remain available in the current frontend runtime.
 * - Keep this module focused on asset/editor concerns, not render orchestration.
 *
 * Change log
 * ----------
 * 2026-03-20
 * - Refactored duration handling around canonical `durationSeconds`
 * - Removed legacy shot-duration fallbacks from asset/timeline mapping
 * - Split asset-to-shot normalization into smaller helpers
 * - Treated shots from `video.config.json` as assigned by default unless explicitly false
 *
 * 2026-03-17
 * - Made the `Nicht zugeordnet` badge directly clickable for quick assignment
 * - Split asset-card interaction targets into card-open vs. assign-trigger paths
 * - Added immediate assign-on-click persistence so unassigned assets become
 *   configured shots without opening the editor first
 * - Fixed editor-save payloads so assets opened from the rail are persisted as
 *   assigned shots in `video.config.json`
 * - Hardened quick-assign badge flow so local state stays assigned even when
 *   backend responses omit the `assigned` flag
 * - Fixed quick-assign follow-up clicks by opening newly assigned assets
 *   directly instead of re-entering the save-before-switch editor path
 *  - Forced an immediate asset-list rerender after quick-assign so later
 *    assignments become visible without a manual refresh
 */
/* ========================================================================== */

import {
  buildAssetAssignPayload,
  buildShotSavePayload,
  persistAssetIfNeeded,
} from "./asset-persistence.js";
import {renderAssetList} from "./asset-renderer.js";
import {registerAssetDnD} from "./asset-dnd.js";
import {dom} from "./dom.js";
import {SHOT_DEFAULTS, state, UI_TEXT} from "./state.js";
import {
  buildAssetSelectionInfo,
  fillJsonForm,
  setJsonFileName,
  setPanelCaption,
  setSelectionInfo,
  toggleJsonEditor,
  toggleVideoPlaceholder,
} from "./ui.js";
import {
  getTotalDuration,
  renderVideoTimeline,
  updateVideoPlayhead,
  buildSegmentsFromShots,
} from "./video-timeline.js";

import {updateInspectorInfo} from "./project-inspector.js";
import buildAssetsFromShots from "./assets-builder.js";



/**
 * Resolves whether one shot should be treated as assigned.
 * Canonical configured shots from `video.config.json` are assigned by default.
 * Only an explicit `false` keeps a shot unassigned.
 *
 * @param {any} shot
 * @returns {boolean}
 */
function isConfiguredShotAssigned(shot) {
  return shot?.assigned !== false;
}

/**
 * Returns the canonical editor JSON payload for one shot.
 *
 * @param {any} shot
 * @param {boolean} assigned
 * @returns {object}
 */
function buildAssetJsonFromShot(shot, assigned) {
  const src = String(shot?.src || "").trim();
  const title = String(shot?.title || "").trim();
  const durationSeconds = getShotDurationSeconds(shot);

  return {
    src,
    title,
    duration: durationSeconds,
    durationSeconds,
    transition: shot?.transition || SHOT_DEFAULTS.transition,
    zoom: shot?.zoom ?? SHOT_DEFAULTS.zoom,
    pan: shot?.pan || SHOT_DEFAULTS.pan,
    caption: shot?.caption || SHOT_DEFAULTS.caption,
    assigned,
  };
}

/**
 * Returns the normalized JSON payload stored on one asset.
 *
 * @param {any} asset
 * @returns {Record<string, any>}
 */
function getAssetJson(asset) {
  return asset?.json && typeof asset.json === "object" ? asset.json : {};
}

/**
 * Normalizes one saved backend shot before it is merged into local asset state.
 *
 * @param {any} savedShot
 * @returns {object}
 */
function buildNormalizedSavedShot(savedShot) {
  return {
    ...savedShot,
    durationSeconds: getShotDurationSeconds(savedShot),
    assigned: true,
  };
}

/**
 * Maps one normalized editor asset back to one assigned shot.
 *
 * @param {any} asset
 * @returns {object}
 */
function mapAssignedAssetToShot(asset) {
  const json = getAssetJson(asset);
  const durationSeconds = getShotDurationSeconds(json);

  return {
    id: asset.id,
    title: json.title,
    durationSeconds,
    transition: json.transition,
    zoom: json.zoom,
    pan: json.pan,
    caption: json.caption,
    src: json.src,
    previewUrl: asset.thumb,
    assigned: true,
  };
}

/**
 * Returns all currently assigned shots from runtime assets.
 *
 * @returns {any[]}
 */
function getAssignedShotsFromAssets() {
  return state.assets
    .filter((asset) => asset.assigned)
    .map(mapAssignedAssetToShot);
}



function buildAssignedSegmentsFromAssets() {
  return buildSegmentsFromShots(getAssignedShotsFromAssets());
}

function syncAssetsAndSegments() {
  state.segments = buildAssignedSegmentsFromAssets();

  updateInspectorInfo();
  renderVideoTimeline();
  renderAssetList();
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




/* -------------------------------------------------------------------------- */
/* Editor helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Builds the editor-aware save payload for the currently opened asset.
 * This overlays current form values onto the normalized persistence payload.
 *
 * @param {any} asset
 * @returns {Record<string, any> | null}
 */
function buildEditorSavePayload(asset) {
  const payload = buildShotSavePayload(asset);
  if (!payload) return null;

  const durationSeconds = Number(dom.fieldDuration?.value || payload.durationSeconds || SHOT_DEFAULTS.duration);

  return {
    ...payload,
    src: dom.fieldSrc?.value || payload.src,
    title: dom.fieldTitle?.value || payload.title,
    headline: dom.fieldTitle?.value || payload.headline,
    durationSeconds,
    transition: dom.fieldTransition?.value || payload.transition || SHOT_DEFAULTS.transition,
    zoom: Number(dom.fieldZoom?.value || payload.zoom || SHOT_DEFAULTS.zoom),
    pan: dom.fieldPan?.value || payload.pan || SHOT_DEFAULTS.pan,
    caption: dom.fieldCaption?.value || payload.caption || SHOT_DEFAULTS.caption,
    assigned: true,
  };
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
    await persistActiveAssetIfNeeded();
  }

  const nextAsset = findAssetById(assetId);
  if (!nextAsset) return;

  openAssetEditor(nextAsset);
}


/**
 * Opens the right-sidebar Bootstrap tab for the selected section/editor.
 * Falls back silently when Bootstrap's Tab API is unavailable.
 */
function openSelectedSectionTab() {
  const selectedSectionTab = dom.selectedSectionTab;
  if (!selectedSectionTab) return;

  const bootstrapTabApi = window.bootstrap?.Tab;
  if (!bootstrapTabApi?.getOrCreateInstance) return;

  bootstrapTabApi.getOrCreateInstance(selectedSectionTab).show();
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
  openSelectedSectionTab();
  toggleJsonEditor(true);
  toggleVideoPlaceholder(false);
  setPanelCaption(UI_TEXT.assetModeCaption);
  setSelectionInfo(buildAssetSelectionInfo(asset));
}


/**
 * Opens one asset directly after it has already been persisted/merged.
 *
 * This bypasses the normal editor-switch save path, which is useful for the
 * quick-assign badge flow where the clicked asset has just been assigned and
 * merged into local state.
 *
 * @param {string} assetId
 */
function openAssignedAssetById(assetId) {
  const asset = findAssetById(assetId);
  if (!asset) return;

  openAssetEditor(asset);
}


/**
 * Switches the center panel back to segment mode.
 */
export function showSegmentView() {
  state.activeAssetId = null;
  renderAssetList();
  const clipTab = dom.clipTab;
  const bootstrapTabApi = window.bootstrap?.Tab;
  if (clipTab && bootstrapTabApi?.getOrCreateInstance) {
    bootstrapTabApi.getOrCreateInstance(clipTab).show();
  }
  toggleJsonEditor(false);
  toggleVideoPlaceholder(true);
  setPanelCaption(UI_TEXT.segmentModeCaption);
  const totalDuration = getTotalDuration();
  const playheadPercent = totalDuration > 0
    ? (state.currentTime / totalDuration) * 100
    : 0;

  updateVideoPlayhead(playheadPercent);
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
  const payload = buildEditorSavePayload(activeAsset);

  if (!payload) return;

  const response = await persistAssetIfNeeded(payload);
  if (response?.shot) {
    mergeSavedAsset(response.shot);
  }
}


function mergeOrAppendAsset(nextAsset) {
  const existingIndex = state.assets.findIndex((asset) => asset.id === nextAsset.id);

  if (existingIndex >= 0) {
    state.assets[existingIndex] = nextAsset;
    return;
  }

  state.assets.push(nextAsset);
}

/**
 * Replaces or appends one saved asset in local runtime state.
 *
 * @param {any} savedShot
 */
export function mergeSavedAsset(savedShot) {
  const normalizedSavedShot = buildNormalizedSavedShot(savedShot);
  const nextAsset = buildAssetsFromShots([normalizedSavedShot])[0];
  mergeOrAppendAsset(nextAsset);

  state.assets = [...state.assets];
  syncAssetsAndSegments();
}

/**
 * Returns the shot-board list elements needed for click handling and Sortable binding.
 *
 * @returns {{
 *   selectedListElement: HTMLElement | null,
 *   unselectedListElement: HTMLElement | null,
 * }}
 */
function getShotBoardElements() {
  return {
    selectedListElement: dom.selectedShotList,
    unselectedListElement: dom.unselectedShotList,
  };
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Registers asset-rail interaction events.
 */

async function handleAssignAssetClick(assetId) {
  const asset = findAssetById(assetId);
  const payload = buildAssetAssignPayload(asset);

  if (!payload) return;

  try {
    const response = await persistAssetIfNeeded(payload);

    mergeSavedAsset({
      ...(response?.shot || payload),
      assigned: true,
    });

    openAssignedAssetById(assetId);
  } catch (error) {
    console.error("Assign failed", error);
  }
}

function bindClickOnce(element, datasetKey, handler) {
  if (!element || element.dataset[datasetKey] === "true") {
    return;
  }

  element.dataset[datasetKey] = "true";
  element.addEventListener("click", handler);
}

export function registerAssetEvents() {
  const handleAssetListClick = async (event) => {
    const assignTrigger = event.target.closest("[data-asset-assign-id]");

    if (assignTrigger) {
      event.preventDefault();
      event.stopPropagation();

      await handleAssignAssetClick(assignTrigger.dataset.assetAssignId);
      return;
    }

    const card = event.target.closest("[data-asset-id]");
    if (!card) return;

    await showAssetEditor(card.dataset.assetId);
  };

  const {
    selectedListElement,
    unselectedListElement,
  } = getShotBoardElements();

  bindClickOnce(selectedListElement, "assetClickBound", handleAssetListClick);
  bindClickOnce(unselectedListElement, "assetClickBound", handleAssetListClick);

  if (state.assetDnDRegistration) {
    state.assetDnDRegistration.destroy();
    state.assetDnDRegistration = null;
  }

  state.assetDnDRegistration = registerAssetDnD({
    selectedListElement,
    unselectedListElement,
    onAssetsChanged: syncAssetsAndSegments,
  });

  bindClickOnce(dom.backToSegmentButton, "boundAssetBackButton", showSegmentView);
}
