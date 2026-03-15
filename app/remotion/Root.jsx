/* ========================================================================== */
/* Root.jsx                                                                    */
/* ========================================================================== */
/*
 * Purpose
 * -------
 * Registers the top-level Remotion composition used by the local README video
 * renderer.
 *
 * Responsibilities
 * ----------------
 * - Provide one stable `READMEVideo` composition id
 * - Define render dimensions and fps
 * - Provide minimal and realistic default props for studio/dev usage
 * - Derive the composition duration from intro, shot and outro timing
 *
 * Runtime model
 * -------------
 * The composition duration must match the effective sum of:
 * - intro duration
 * - all configured shot durations
 * - outro duration
 *
 * This keeps Studio previews and renderer output aligned with the JSON-driven
 * shot timeline.
 *
 * Change log
 * ----------
 * 2026-03-14
 * - Added structured module header
 * - Refactored duration calculation into shared helper functions
 * - Removed hard-coded 300-frame composition duration
 * - Kept default props for local Studio inspection
 * - Aligned default props with the newer `intro` config structure
 * - Replaced overly specific demo defaults with one minimal hero-shot preset
 * - Switched composition duration to `calculateMetadata()` so real input props define render length
 */
/* ========================================================================== */


import {Composition} from "remotion";
import {READMEVideo} from "./READMEVideo.jsx";

/* -------------------------------------------------------------------------- */
/* Composition defaults                                                       */
/* -------------------------------------------------------------------------- */

const VIDEO_DEFAULTS = {
  width: 1920,
  height: 1080,
  fps: 30,
  introDuration: 60,
  outroDuration: 60,
  shotDuration: 90,
};

const DEFAULT_PROPS = {
  intro: {
    title: "My Project",
    subtitle: "Awesome open source tool",
    layout: {
      horizontalAlign: "center",
      verticalAlign: "center",
      offsetX: 0,
      offsetY: 0,
    },
    titleAnimation: {
      from: {x: -140, y: 24, opacity: 0, letterSpacing: 6},
      to: {x: 0, y: 0, opacity: 1, letterSpacing: 0},
      frames: [0, 24],
    },
    subtitleAnimation: {
      from: {x: 90, y: 12, opacity: 0, letterSpacing: 3},
      to: {x: 0, y: 0, opacity: 1, letterSpacing: 0},
      frames: [8, 40],
    },
  },
  shots: [
    {
      id: "shot-hero",
      src: "hero.png",
      title: "Hero",
      headline: "Hero",
      caption: "",
      captionAnimation: {
        from: {x: 0, y: 36, opacity: 0, letterSpacing: 2},
        to: {x: 0, y: 0, opacity: 1, letterSpacing: 0},
        frames: [0, 24],
      },
      duration: VIDEO_DEFAULTS.shotDuration,
      zoom: 1,
      transition: "",
      pan: "center",
    },
  ],
  outroText: "github.com/yourname/yourproject",
};

/* -------------------------------------------------------------------------- */
/* Duration helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Returns the effective intro duration in frames.
 *
 * @returns {number}
 */
function getIntroDuration() {
  return VIDEO_DEFAULTS.introDuration;
}

/**
 * Returns the effective outro duration in frames.
 *
 * @returns {number}
 */
function getOutroDuration() {
  return VIDEO_DEFAULTS.outroDuration;
}

/**
 * Returns the effective duration of one shot in frames.
 *
 * @param {any} shot
 * @returns {number}
 */
function getShotDuration(shot) {
  return Number(
    shot?.duration ?? shot?.durationInFrames ?? VIDEO_DEFAULTS.shotDuration
  );
}

/**
 * Returns the total duration of all configured shots.
 *
 * @param {any[]} shots
 * @returns {number}
 */
function getShotsDuration(shots = []) {
  return shots.reduce((sum, shot) => sum + getShotDuration(shot), 0);
}

/**
 * Returns the full composition duration in frames.
 *
 * @param {{shots?: any[]}} props
 * @returns {number}
 */
function getCompositionDuration(props = {}) {
  return getIntroDuration() + getShotsDuration(props.shots || []) + getOutroDuration();
}

/**
 * Returns Remotion metadata derived from the current composition props.
 * This keeps the real render duration aligned with the JSON input instead of
 * the studio fallback defaults.
 *
 * @param {{props: any}} options
 * @returns {{durationInFrames: number}}
 */
function calculateCompositionMetadata({props}) {
  return {
    durationInFrames: getCompositionDuration(props || DEFAULT_PROPS),
  };
}

/* -------------------------------------------------------------------------- */
/* Root composition registry                                                  */
/* -------------------------------------------------------------------------- */

export const RemotionRoot = () => {
  return (
    <Composition
      id="READMEVideo"
      component={READMEVideo}
      width={VIDEO_DEFAULTS.width}
      height={VIDEO_DEFAULTS.height}
      fps={VIDEO_DEFAULTS.fps}
      durationInFrames={getCompositionDuration(DEFAULT_PROPS)}
      calculateMetadata={calculateCompositionMetadata}
      defaultProps={DEFAULT_PROPS}
    />
  );
};
