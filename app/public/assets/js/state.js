/* ========================================================================== */
/* state.js                                                                   */
/* ========================================================================== */
/*
 * Purpose
 * -------
 * Central frontend runtime state and shared UI constants for the local
 * README-video editor GUI.
 *
 * Responsibilities
 * ----------------
 * - Hold mutable browser-session state for the current editor runtime
 * - Define stable UI labels reused across frontend modules
 * - Define shared shot defaults for incomplete or unconfigured shot data
 * - Provide a safe fallback segment for empty timeline states
 *
 * Source of truth
 * ---------------
 * This module is the single frontend source of truth for:
 * - transient request and interaction flags
 * - active asset and timeline selection state
 * - render-progress runtime state
 * - editable video title / subtitle values
 * - shared UI labels and shot defaults
 *
 * Notes
 * -----
 * - Values in `state` are intentionally mutable.
 * - Values in `UI_TEXT`, `SHOT_DEFAULTS` and `EMPTY_SEGMENT` are shared
 *   constants and should be treated as read-only.
 * - This module does not access the DOM and does not perform side effects.
 *
 * Change log
 * ----------
 * 2026-03-15
 * - Refactored comments and section wording for consistency with newer modules
 * - Kept state shape, labels and defaults unchanged
 */
/* ========================================================================== */

/* -------------------------------------------------------------------------- */
/* Mutable application runtime state                                          */
/* -------------------------------------------------------------------------- */

/**
 * Mutable browser-session runtime state.
 *
 * This object is updated by frontend modules during interaction, rendering,
 * asset editing and timeline scrubbing.
 */
export const state = {
  isRequestRunning: false,
  activeAction: null,
  isScrubbingTimeline: false,

  activeAssetId: null,
  pendingAssetId: null,

  currentTime: 0,

  segments: [],
  assets: [],

  renderProgressTimer: null,
  renderProgressValue: 0,

  videoTitle: "",
  videoSubtitle: "",
};

/* -------------------------------------------------------------------------- */
/* Shared UI text constants                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Reusable UI labels and status messages shared across frontend modules.
 */
export const UI_TEXT = {
  segmentModeCaption: "Linealbereich und Segmentvorschau",
  assetModeCaption: "Editierbare JSON-Daten des gewählten Bildes",

  shotsLoaded: "Shots geladen",
  loadingError: "Fehler beim Laden",

  noShotsLabel: "Keine Shots",

  previewActionName: "Preview-Frame",
  previewStartMessage: "Preview-Frame wird erzeugt ...",
  previewInitialOutput: "Starte Preview-Frame-Prozess ...",
  previewSuccessMessage: "Preview-Frame erstellt",

  videoActionName: "Videorendering",
  videoStartMessage: "Videorendering läuft ...",
  videoSuccessMessage: "Videorendering abgeschlossen",

  saveShotActionName: "Shot speichern",
  saveShotStartMessage: "Shot wird gespeichert ...",
  saveShotInitialOutput: "Speichere Änderungen des aktuellen Bildes ...",
  saveShotSuccessMessage: "Shot gespeichert",

  videoTitleSaved: "Video-Titel gesetzt",
  videoSubtitleSaved: "Video-Subtitle gesetzt",
  videoTitleMissing: "Bitte zuerst einen Titel eingeben",
  videoSubtitleMissing: "Bitte zuerst einen Subtitle eingeben",
};

/* -------------------------------------------------------------------------- */
/* Shared shot defaults                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Stable fallback values for shot fields that are missing from config data.
 */
export const SHOT_DEFAULTS = {
  duration: 90,
  zoom: 1,
  transition: "",
  pan: "center",
  caption: "",
};

/* -------------------------------------------------------------------------- */
/* Empty timeline fallback                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Safe fallback segment used when the timeline has no real shot entries.
 */
export const EMPTY_SEGMENT = {
  id: "empty",
  label: UI_TEXT.noShotsLabel,
  start: 0,
  end: 1,
  image: "",
};