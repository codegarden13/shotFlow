/* ========================================================================== */
/* dom.js                                                                     */
/* ========================================================================== */
/*
 * Purpose
 * -------
 * Central DOM registry for the editor UI.
 *
 * Responsibilities
 * ----------------
 * - Resolve stable element references once at startup
 * - Group DOM bindings by editor area for readability
 * - Provide one shared lookup object for the frontend modules
 *
 * Notes
 * -----
 * - This file should stay declarative and free of UI logic.
 * - Add new editor bindings here whenever `index.html` grows.
 *
 * Change log
 * ----------
 * 2026-03-17
 * - Grouped DOM references by area with clearer inline comments
 * - Added project-level video config bindings for aspect ratio, width, layer color,
 *   intro text and outro text inputs
 * 2026-03-19
 * - Replaced the legacy single asset-list binding with explicit shot-board bindings
 *   for selected/unselected lists and their dropzones
 * 2026-03-22
 * - Added explicit right-sidebar tab bindings for `clipTab` and `selectedSectionTab`
 *   so tab switching can be driven reliably from UI/controller code
 */
/* ========================================================================== */

export const dom = {
  /* ---------------------------------------------------------------------- */
  /* Left rail: render controls                                             */
  /* ---------------------------------------------------------------------- */
  renderButton: document.getElementById("renderBtn"),                // Main action to start a full render
  previewButton: document.getElementById("previewBtn"),              // Optional action to render a still preview frame
  statusText: document.getElementById("status"),                     // Small status line under the render controls
  renderProgressBar: document.getElementById("renderProgressBar"),   // Visual progress bar fill element
  renderProgressLabel: document.getElementById("renderProgressLabel"),// Text label showing render progress percent
  outputBox: document.getElementById("output"),                      // Render log / command output box
  renderFormat: document.getElementById("renderFormat"),             // Format selector (landscape / square / portrait)
  renderLook: document.getElementById("renderLook"),                 // Look/style selector for the render pipeline
  renderDraft: document.getElementById("renderDraft"),               // Draft-mode checkbox for faster test renders
  videoShotsSelect: document.getElementById("video-shots"),          // Dropdown for selecting the active video-shots source

  /* ---------------------------------------------------------------------- */
  /* Left rail: render info panels                                          */
  /* ---------------------------------------------------------------------- */
  renderInfoPanel: document.getElementById("renderInfoPanel"),       // Wrapper panel for render/video/audio metadata
  videoInfoGroup: document.getElementById("videoInfoGroup"),         // Derived video timeline information
  renderMetaGroup: document.getElementById("renderMetaGroup"),       // Render output metadata
  audioInfoGroup: document.getElementById("audioInfoGroup"),         // Audio and beat metadata

  videoInfoTotalFrames: document.getElementById("videoInfoTotalFrames"), // Total frame count
  videoInfoDuration: document.getElementById("videoInfoDuration"),   // Human-readable video duration
  videoInfoFps: document.getElementById("videoInfoFps"),             // Frames-per-second display
  videoInfoResolution: document.getElementById("videoInfoResolution"),// Render resolution display
  videoInfoAspectRatio: document.getElementById("videoInfoAspectRatio"),// Format / aspect ratio display
  videoInfoShots: document.getElementById("videoInfoShots"),         // Number of active shots
  videoInfoCaptionShots: document.getElementById("videoInfoCaptionShots"),// Shots containing captions
  videoInfoTransitionShots: document.getElementById("videoInfoTransitionShots"),// Shots defining transitions
  videoInfoIntroOutro: document.getElementById("videoInfoIntroOutro"),// Intro/outro summary

  renderInfoTemplateLook: document.getElementById("renderInfoTemplateLook"), // Active template/look
  renderInfoEstimatedDuration: document.getElementById("renderInfoEstimatedDuration"), // Estimated render time
  renderInfoOutputFile: document.getElementById("renderInfoOutputFile"), // Output file path/name

  audioInfoPresent: document.getElementById("audioInfoPresent"),     // Whether an audio track is available
  audioInfoFile: document.getElementById("audioInfoFile"),           // Audio source file name
  audioInfoDuration: document.getElementById("audioInfoDuration"),   // Audio duration label
  audioInfoStartOffset: document.getElementById("audioInfoStartOffset"), // Configured music start offset in seconds
  audioInfoMusicVsVideo: document.getElementById("audioInfoMusicVsVideo"), // Music vs video duration
  audioInfoBeatFile: document.getElementById("audioInfoBeatFile"),   // Beat/transient sidecar file
  audioInfoBeatCount: document.getElementById("audioInfoBeatCount"), // Number of detected beats/transients
  audioInfoBeatSyncActive: document.getElementById("audioInfoBeatSyncActive"), // Beat-sync active state
  audioInfoLoopMode: document.getElementById("audioInfoLoopMode"),   // Audio loop/sync mode

  /* ---------------------------------------------------------------------- */
  /* Center panel: preview / playback stage                                 */
  /* ---------------------------------------------------------------------- */
  panelCaption: document.getElementById("panelCaption"),             // Subtitle text in the center panel header
  selectionInfo: document.getElementById("selectionInfo"),           // Current playhead / selected segment summary
  videoStage: document.getElementById("videoStage"),                 // Outer center-stage container
  stageFrame: document.getElementById("stageFrame"),                 // Inner stage frame wrapper
  renderedVideoPlayer: document.getElementById("renderedVideoPlayer"),// Video element for latest render playback
  videoPlaceholder: document.getElementById("videoPlaceholder"),     // Empty-state placeholder before video loads
  stageSegmentTitle: document.getElementById("stageSegmentTitle"),   // Selected segment title overlay
  stageSegmentTime: document.getElementById("stageSegmentTime"),     // Selected segment time range
  stagePlayhead: document.getElementById("stagePlayhead"),           // Stage playhead marker

  /* ---------------------------------------------------------------------- */
  /* Timeline shell                                                         */
  /* ---------------------------------------------------------------------- */
  timelineShell: document.getElementById("timelineShell"),           // Shared container for video and audio timelines
  timelineFooter: document.getElementById("timelineFooter"),         // Compact timeline summary text

  /* ---------------------------------------------------------------------- */
  /* Video timeline                                                         */
  /* ---------------------------------------------------------------------- */
  timelineScale: document.getElementById("timelineScale"),           // Scale row above the video timeline
  timelineStage: document.getElementById("timelineStage"),           // Video timeline interaction area
  timelineSegmentsLayer: document.getElementById("timelineSegmentsLayer"), // Layer containing video segments
  timelinePlayhead: document.getElementById("timelinePlayhead"),     // Video timeline playhead marker

  /* ---------------------------------------------------------------------- */
  /* Audio timeline                                                         */
  /* ---------------------------------------------------------------------- */
  audioTimelineScale: document.getElementById("audioTimelineScale"), // Scale row above the audio timeline
  audioTimelineStage: document.getElementById("audioTimelineStage"), // Audio timeline interaction area
  audioTimelineSvgHost: document.getElementById("audioTimelineSvgHost"), // Host element for the D3 audio SVG

  /* ---------------------------------------------------------------------- */
  /* Right rail: video metadata inputs                                      */
  /* ---------------------------------------------------------------------- */
  videoTitleInput: document.getElementById("videoTitleInput"),       // Project-level video title input
  videoSubtitleInput: document.getElementById("videoSubtitleInput"), // Project-level video subtitle input
  videoAspectRatioInput: document.getElementById("videoAspectRatioInput"), // Project-level aspect ratio selector
  videoWidthInput: document.getElementById("videoWidthInput"),       // Project-level video width input in pixels
  videoTargetDurationSecondsInput: document.getElementById("videoTargetDurationSecondsInput"), // Project-level persisted target duration in seconds
  videoIntroDurationInput: document.getElementById("videoIntroDurationInput"), // Project-level intro duration input in seconds
  videoOutroDurationInput: document.getElementById("videoOutroDurationInput"), // Project-level outro duration input in seconds
  videoTemplateInput: document.getElementById("videoTemplateInput"), // Project-level template selector
  videoAudioStartSecondsInput: document.getElementById("videoAudioStartSecondsInput"), // Project-level music start offset input in seconds
  videoLayerColorInput: document.getElementById("videoLayerColorInput"), // Project-level intro/layer color input
  videoOutroTextInput: document.getElementById("videoOutroTextInput"), // Project-level outro text input
  videoIntroTextInput: document.getElementById("videoIntroTextInput"), // Project-level intro text / note textarea
  setVideoTitleButton: document.getElementById("setVideoTitleBtn"),  // Apply video title
  setVideoSubtitleButton: document.getElementById("setVideoSubtitleBtn"), // Apply video subtitle

  /* ---------------------------------------------------------------------- */
  /* Right rail: tab navigation                                             */
  /* ---------------------------------------------------------------------- */
  clipTab: document.getElementById("clipTab"),                     // Bootstrap tab button for the shot-board view
  selectedSectionTab: document.getElementById("selectedSectionTab"), // Bootstrap tab button for the selected-section editor

  /* ---------------------------------------------------------------------- */
  /* Right rail: segment metadata editor                                    */
  /* ---------------------------------------------------------------------- */
  jsonEditor: document.getElementById("jsonEditor"),                 // Segment metadata editor panel
  jsonFileName: document.getElementById("jsonFileName"),             // Currently edited file/segment label
  backToSegmentButton: document.getElementById("backToSegmentBtn"),  // Reset/clear current segment selection
  fieldSrc: document.getElementById("fieldSrc"),                     // Segment source file
  fieldTitle: document.getElementById("fieldTitle"),                 // Segment title/headline
  fieldDuration: document.getElementById("fieldDuration"),           // Segment duration
  fieldTransition: document.getElementById("fieldTransition"),       // Segment transition mode
  fieldZoom: document.getElementById("fieldZoom"),                   // Segment zoom value
  fieldPan: document.getElementById("fieldPan"),                     // Segment pan alignment
  fieldCaption: document.getElementById("fieldCaption"),             // Segment caption/body text

  /* ---------------------------------------------------------------------- */
  /* Right rail: shot board                                                 */
  /* ---------------------------------------------------------------------- */
  selectedShotDropzone: document.getElementById("selectedShotDropzone"), // Outer dropzone for assigned shots
  selectedShotList: document.getElementById("selectedShotList"),          // Inner list container for assigned shots
  selectedShotsCount: document.getElementById("selectedShotsCount"),      // Badge showing number of assigned shots
  unselectedShotDropzone: document.getElementById("unselectedShotDropzone"), // Outer dropzone for available shots
  unselectedShotList: document.getElementById("unselectedShotList"),      // Inner list container for unassigned shots
  unselectedShotsCount: document.getElementById("unselectedShotsCount"),  // Badge showing number of unassigned shots
};
