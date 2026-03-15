/* ========================================================================== */
/* timeline.js                                                                */
/* ========================================================================== */
/*
 * Purpose
 * -------
 * Timeline and stage rendering helpers for the local README-video editor GUI.
 *
 * Responsibilities
 * ----------------
 * - Render the layered timeline UI (scale, segments, beats, waveform, footer)
 * - Resolve the active segment from the current playhead position
 * - Keep stage preview and timeline playheads visually synchronized
 * - Translate pointer movement into timeline scrubbing
 * - Register timeline-stage scrubbing and resize events
 * - Apply backend-rendered preview stills to the stage
 *
 * Notes
 * -----
 * - This module imports its direct dependencies explicitly.
 * - Beat markers are still a placeholder until `music-beats.json` is wired in.
 * - The waveform is currently a deterministic visual placeholder, not a real
 *   decoded audio waveform.
 *
 * Change log
 * ----------
 * 2026-03-15
 * - Refactored helper ordering and section structure for consistency
 * - Extracted waveform drawing constants and playhead clamping helpers
 * - Kept current runtime behavior unchanged while tightening comments
 */
/* ========================================================================== */

import {dom} from "./dom.js";
import {EMPTY_SEGMENT, state} from "./state.js";
import {setSelectionInfo} from "./ui.js";

/* -------------------------------------------------------------------------- */
/* Rendering constants                                                        */
/* -------------------------------------------------------------------------- */

const WAVEFORM = {
  height: 96,
  barWidth: 4,
  gap: 3,
  baselineColor: "rgba(15, 23, 42, 0.12)",
  backgroundColor: "rgba(15, 23, 42, 0.04)",
  barColor: "rgba(13, 110, 253, 0.35)",
};

/* -------------------------------------------------------------------------- */
/* Time and URL helpers                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Formats one time value as `mm:ss`.
 * Invalid input is normalized to `00:00`.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatTime(value) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const minutes = Math.floor(safeValue / 60);
  const seconds = Math.floor(safeValue % 60);

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Returns the total logical timeline duration.
 * Falls back to `1` so percentage calculations never divide by zero.
 *
 * @returns {number}
 */
export function getTotalDuration() {
  if (!state.segments.length) {
    return 1;
  }

  return state.segments[state.segments.length - 1].end;
}

/**
 * Converts one logical time value into a timeline percentage.
 *
 * @param {number} value
 * @returns {number}
 */
export function toTimelinePercent(value) {
  return (Math.max(0, value) / getTotalDuration()) * 100;
}

/**
 * Builds a compact list of time-scale labels for the timeline header.
 *
 * @returns {string[]}
 */
export function getTimelineScaleLabels() {
  const totalDuration = getTotalDuration();
  const tickCount = 5;

  return Array.from({length: tickCount}, (_, index) => {
    const ratio = tickCount === 1 ? 0 : index / (tickCount - 1);
    return formatTime(totalDuration * ratio);
  });
}

/**
 * Adds a cache-busting timestamp to one URL.
 * This forces the browser to reload a newly rendered preview image.
 *
 * @param {string} url
 * @returns {string}
 */
function withCacheBust(url) {
  if (!url) return "";

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}`;
}

/**
 * Clamps one percentage value into the inclusive range 0..100.
 *
 * @param {number} value
 * @returns {number}
 */
function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

/* -------------------------------------------------------------------------- */
/* Timeline rendering                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Renders the compact time-scale labels above the layered timeline.
 */
function renderTimelineScale() {
  if (!dom.timelineScale) return;

  dom.timelineScale.innerHTML = getTimelineScaleLabels()
    .map((label) => `<span>${label}</span>`)
    .join("");
}

/**
 * Renders all current shot segments into the dedicated segment layer.
 * Segment positions are derived from normalized timeline percentages.
 */
function renderTimelineSegments() {
  if (!dom.timelineSegmentsLayer) return;

  dom.timelineSegmentsLayer.innerHTML = state.segments
    .map((segment) => {
      const left = toTimelinePercent(segment.start);
      const width = Math.max(2, toTimelinePercent(segment.end - segment.start));

      return `
        <div
          class="timeline-segment"
          data-segment-id="${segment.id}"
          style="left: ${left}%; width: ${width}%"
          title="${segment.label} · ${formatTime(segment.start)} – ${formatTime(segment.end)}"
        >
          ${segment.label}
        </div>
      `;
    })
    .join("");
}

/**
 * Clears and prepares the beat layer.
 * Real transient markers will be rendered here once beat analysis is connected.
 */
function renderTimelineBeats() {
  if (!dom.timelineBeatsLayer) return;
  dom.timelineBeatsLayer.innerHTML = "";
}

/**
 * Draws the waveform baseline into the placeholder canvas.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {number} width
 * @param {number} midY
 */
function drawWaveformBaseline(context, width, midY) {
  context.strokeStyle = WAVEFORM.baselineColor;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, midY);
  context.lineTo(width, midY);
  context.stroke();
}

/**
 * Draws a deterministic placeholder waveform into the canvas layer.
 * This keeps the layout visually stable until real decoded audio data exists.
 *
 * @param {CanvasRenderingContext2D} context
 * @param {number} width
 * @param {number} height
 */
function drawWaveformBars(context, width, height) {
  const midY = height / 2;
  const step = WAVEFORM.barWidth + WAVEFORM.gap;
  const barCount = Math.floor(width / step);

  context.fillStyle = WAVEFORM.barColor;

  for (let index = 0; index < barCount; index += 1) {
    const x = index * step;
    const amplitude = 0.2 + Math.abs(Math.sin(index * 0.32)) * 0.8;
    const barHeight = amplitude * (height * 0.42);

    context.fillRect(x, midY - barHeight / 2, WAVEFORM.barWidth, barHeight);
  }
}

/**
 * Draws a deterministic placeholder waveform into the canvas layer.
 * This keeps the layout visually stable until real decoded audio data exists.
 */
function renderTimelineWaveform() {
  const canvas = dom.timelineWaveformCanvas;
  const stage = dom.timelineStage;

  if (!canvas || !stage) return;

  const width = Math.max(1, Math.floor(stage.clientWidth));
  const height = WAVEFORM.height;

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, width, height);
  context.fillStyle = WAVEFORM.backgroundColor;
  context.fillRect(0, 0, width, height);

  drawWaveformBaseline(context, width, height / 2);
  drawWaveformBars(context, width, height);
}

/**
 * Renders a compact footer summary for the current timeline state.
 */
function renderTimelineFooter() {
  if (!dom.timelineFooter) return;

  dom.timelineFooter.textContent =
    `Dauer: ${formatTime(getTotalDuration())} · ` +
    `Shots: ${state.segments.length} · ` +
    `Beats: noch nicht geladen`;
}

/**
 * Rebuilds the complete layered timeline UI.
 */
export function renderTimeline() {
  renderTimelineScale();
  renderTimelineSegments();
  renderTimelineBeats();
  renderTimelineWaveform();
  renderTimelineFooter();
}

/* -------------------------------------------------------------------------- */
/* Timeline to stage synchronization                                          */
/* -------------------------------------------------------------------------- */

/**
 * Returns the active segment for one timeline position.
 * Falls back to `EMPTY_SEGMENT` when no real segments are loaded yet.
 *
 * @param {number} time
 * @returns {{id: string, label: string, start: number, end: number, image: string}}
 */
function getSegmentForTime(time) {
  if (!state.segments.length) {
    return EMPTY_SEGMENT;
  }

  return (
    state.segments.find((segment) => time >= segment.start && time < segment.end) ||
    state.segments[state.segments.length - 1]
  );
}

/**
 * Applies the active preview image to the center stage.
 *
 * @param {{image: string}} segment
 */
function updateStageImage(segment) {
  if (!dom.stagePreviewImage || !segment.image) return;
  dom.stagePreviewImage.src = segment.image;
}

/**
 * Updates the visible stage metadata for the active segment.
 *
 * @param {{label: string, start: number, end: number}} segment
 */
function updateStageMeta(segment) {
  if (dom.stageSegmentTitle) {
    dom.stageSegmentTitle.textContent = segment.label;
  }

  if (dom.stageSegmentTime) {
    dom.stageSegmentTime.textContent = `${formatTime(segment.start)} – ${formatTime(segment.end)}`;
  }

  setSelectionInfo(`Playhead: ${formatTime(state.currentTime)} · Segment: ${segment.label}`);
}

/**
 * Applies the current playhead position to both the timeline and stage ruler.
 *
 * @param {number} percent
 */
function updatePlayheadUi(percent) {
  if (dom.timelinePlayhead) {
    dom.timelinePlayhead.style.left = `${percent}%`;
  }

  if (dom.stagePlayhead) {
    dom.stagePlayhead.style.left = `${percent}%`;
  }
}

/**
 * Updates the internal playhead time and refreshes all dependent stage UI.
 *
 * @param {number} percent
 */
export function updatePlayhead(percent) {
  const safePercent = clampPercent(percent);
  const totalDuration = getTotalDuration();

  state.currentTime = (safePercent / 100) * totalDuration;

  const activeSegment = getSegmentForTime(state.currentTime);

  updatePlayheadUi(safePercent);
  updateStageImage(activeSegment);
  updateStageMeta(activeSegment);
}

/* -------------------------------------------------------------------------- */
/* Timeline event registration                                                */
/* -------------------------------------------------------------------------- */

/**
 * Stops active timeline scrubbing.
 */
export function stopTimelineScrubbing() {
  state.isScrubbingTimeline = false;
}

/**
 * Registers timeline-stage interaction events.
 * The stage supports click-to-seek, drag scrubbing and waveform resize redraw.
 */
export function registerTimelineEvents() {
  if (!dom.timelineStage) return;

  dom.timelineStage.addEventListener("mousedown", (event) => {
    state.isScrubbingTimeline = true;
    movePlayheadFromPointer(event.clientX);
  });

  window.addEventListener("mousemove", (event) => {
    if (!state.isScrubbingTimeline) return;
    movePlayheadFromPointer(event.clientX);
  });

  window.addEventListener("mouseup", stopTimelineScrubbing);

  dom.timelineStage.addEventListener("click", (event) => {
    movePlayheadFromPointer(event.clientX);
  });

  window.addEventListener("resize", renderTimeline);
}

/* -------------------------------------------------------------------------- */
/* Scrubbing and preview updates                                              */
/* -------------------------------------------------------------------------- */

/**
 * Converts one pointer x-position into a normalized timeline percentage.
 *
 * @param {number} clientX
 */
export function movePlayheadFromPointer(clientX) {
  if (!dom.timelineStage) return;

  const rect = dom.timelineStage.getBoundingClientRect();
  const percent = ((clientX - rect.left) / rect.width) * 100;
  updatePlayhead(percent);
}

/**
 * Applies one backend-rendered preview still to the stage image.
 * Cache-busting keeps the browser from showing an outdated still frame.
 *
 * @param {{publicUrl?: string}} data
 */
export function applyRenderedPreview(data) {
  if (!dom.stagePreviewImage || !data?.publicUrl) return;

  dom.stagePreviewImage.src = withCacheBust(data.publicUrl);
}
