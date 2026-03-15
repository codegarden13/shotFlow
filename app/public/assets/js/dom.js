/* ========================================================================== */
/* dom.js                                                                     */
/* ========================================================================== */
/*
 * Purpose
 * -------
 * Centralized DOM reference registry for the local README-video editor GUI.
 *
 * Responsibilities
 * ----------------
 * - Resolve all stable element IDs from `index.html` in one place
 * - Provide a single importable `dom` object for all frontend modules
 * - Keep left rail, center panel, timeline and right rail selectors grouped
 * - Reduce repeated `document.getElementById()` calls across the app
 *
 * Notes
 * -----
 * - Missing elements are intentionally returned as `null` by
 *   `document.getElementById()` and handled by calling modules.
 * - This file should only contain DOM lookup wiring, not UI logic.
 *
 * Change log
 * ----------
 * 2026-03-15
 * - Added structured module header and grouped selector sections
 * - Added render-info panel references for video, render and audio metadata
 * - Kept all selectors as direct ID lookups for predictable frontend behavior
 */
/* ========================================================================== */

/* -------------------------------------------------------------------------- */
/* DOM references                                                             */
/* -------------------------------------------------------------------------- */

export const dom = {
  /* Left rail: controls */
  renderButton: document.getElementById("renderBtn"),
  previewButton: document.getElementById("previewBtn"),
  statusText: document.getElementById("status"),
  renderProgressBar: document.getElementById("renderProgressBar"),
  renderProgressLabel: document.getElementById("renderProgressLabel"),
  outputBox: document.getElementById("output"),
  renderFormat: document.getElementById("renderFormat"),
  renderLook: document.getElementById("renderLook"),
  renderDraft: document.getElementById("renderDraft"),

  /* Left rail: info panels */
  renderInfoPanel: document.getElementById("renderInfoPanel"),
  videoInfoGroup: document.getElementById("videoInfoGroup"),
  renderMetaGroup: document.getElementById("renderMetaGroup"),
  audioInfoGroup: document.getElementById("audioInfoGroup"),

  videoInfoTotalFrames: document.getElementById("videoInfoTotalFrames"),
  videoInfoDuration: document.getElementById("videoInfoDuration"),
  videoInfoFps: document.getElementById("videoInfoFps"),
  videoInfoResolution: document.getElementById("videoInfoResolution"),
  videoInfoAspectRatio: document.getElementById("videoInfoAspectRatio"),
  videoInfoShots: document.getElementById("videoInfoShots"),
  videoInfoCaptionShots: document.getElementById("videoInfoCaptionShots"),
  videoInfoTransitionShots: document.getElementById("videoInfoTransitionShots"),
  videoInfoIntroOutro: document.getElementById("videoInfoIntroOutro"),

  renderInfoTemplateLook: document.getElementById("renderInfoTemplateLook"),
  renderInfoEstimatedDuration: document.getElementById("renderInfoEstimatedDuration"),
  renderInfoOutputFile: document.getElementById("renderInfoOutputFile"),

  audioInfoPresent: document.getElementById("audioInfoPresent"),
  audioInfoFile: document.getElementById("audioInfoFile"),
  audioInfoDuration: document.getElementById("audioInfoDuration"),
  audioInfoMusicVsVideo: document.getElementById("audioInfoMusicVsVideo"),
  audioInfoBeatFile: document.getElementById("audioInfoBeatFile"),
  audioInfoBeatCount: document.getElementById("audioInfoBeatCount"),
  audioInfoBeatSyncActive: document.getElementById("audioInfoBeatSyncActive"),
  audioInfoLoopMode: document.getElementById("audioInfoLoopMode"),

  /* Center panel */
  panelCaption: document.getElementById("panelCaption"),
  selectionInfo: document.getElementById("selectionInfo"),
  videoPlaceholder: document.getElementById("videoPlaceholder"),
  jsonEditor: document.getElementById("jsonEditor"),
  jsonFileName: document.getElementById("jsonFileName"),
  backToSegmentButton: document.getElementById("backToSegmentBtn"),

  /* Stage */
  stagePreviewImage: document.getElementById("stagePreviewImage"),
  stageSegmentTitle: document.getElementById("stageSegmentTitle"),
  stageSegmentTime: document.getElementById("stageSegmentTime"),
  stagePlayhead: document.getElementById("stagePlayhead"),

  /* Timeline */
  timelineShell: document.getElementById("timelineShell"),
  timelineScale: document.getElementById("timelineScale"),
  timelineStage: document.getElementById("timelineStage"),
  timelineSegmentsLayer: document.getElementById("timelineSegmentsLayer"),
  timelineBeatsLayer: document.getElementById("timelineBeatsLayer"),
  timelineWaveformLayer: document.getElementById("timelineWaveformLayer"),
  timelineWaveformCanvas: document.getElementById("timelineWaveformCanvas"),
  timelinePlayhead: document.getElementById("timelinePlayhead"),
  timelineFooter: document.getElementById("timelineFooter"),

  /* Right rail */
  assetList: document.getElementById("assetList"),
  videoTitleInput: document.getElementById("videoTitleInput"),
  videoSubtitleInput: document.getElementById("videoSubtitleInput"),
  setVideoTitleButton: document.getElementById("setVideoTitleBtn"),
  setVideoSubtitleButton: document.getElementById("setVideoSubtitleBtn"),

  /* JSON fields */
  fieldSrc: document.getElementById("fieldSrc"),
  fieldTitle: document.getElementById("fieldTitle"),
  fieldDuration: document.getElementById("fieldDuration"),
  fieldTransition: document.getElementById("fieldTransition"),
  fieldZoom: document.getElementById("fieldZoom"),
  fieldPan: document.getElementById("fieldPan"),
  fieldCaption: document.getElementById("fieldCaption"),
};
