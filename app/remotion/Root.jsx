/* ========================================================================== */
/* Root.jsx                                                                   */
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
 * - Define render dimensions, fps and intro/outro timing from canonical config data
 * - Provide canonical default props for Studio/dev usage
 * - Derive composition metadata from the canonical video config
 * - Pass canonical props directly to `READMEVideo`
 *
 * Runtime model
 * -------------
 * The canonical input shape is exactly `{project, shots}`.
 * Root derives metadata from that shape and passes it unchanged into
 * `READMEVideo`.
 *
 */
/* ========================================================================== */

import {Composition} from "remotion";

import {mapVideoConfigToComposition} from "../lib/video/video-config-mapper.js";
import {READMEVideo} from "./READMEVideo.jsx";

/* -------------------------------------------------------------------------- */
/* Composition defaults                                                       */
/* -------------------------------------------------------------------------- */

const VIDEO_DEFAULTS = {
  introDurationSeconds: 2,
  outroDurationSeconds: 2,
  shotDurationSeconds: 3,
};

const DEFAULT_VIDEO_CONFIG = {
  project: {
    title: "My Project",
    subtitle: "Awesome open source tool",
    introText: "",
    introDurationSeconds: VIDEO_DEFAULTS.introDurationSeconds,
    audioStartSeconds: 0,
    musicVolume: 0.18,
    layerColor: "#0b1020",
    outroText: "github.com/yourname/yourproject",
    outroDurationSeconds: VIDEO_DEFAULTS.outroDurationSeconds,
    aspectRatio: "16:9",
    width: 1920,
    fps: 30,
    targetDurationSeconds: VIDEO_DEFAULTS.shotDurationSeconds,
    beatSyncEnabled: true,
    beatSyncStep: 1,
  },
  beatData: {},
  shots: [
    {
      id: "shot-hero",
      src: "hero.png",
      title: "Hero",
      headline: "Hero",
      caption: "",
      durationSeconds: VIDEO_DEFAULTS.shotDurationSeconds,
      zoom: 1,
      transition: "",
      pan: "center",
      captionAnimation: {
        from: {x: 0, y: 36, opacity: 0, letterSpacing: 2},
        to: {x: 0, y: 0, opacity: 1, letterSpacing: 0},
        frames: [0, 24],
      },
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Canonical helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Returns the effective canonical video config with stable defaults.
 *
 * @param {any} props
 * @returns {any}
 */
function getVideoConfig(props = {}) {
  return {
    project: {
      ...DEFAULT_VIDEO_CONFIG.project,
      ...(props?.project || {}),
    },
    beatData:
      props?.beatData && typeof props.beatData === "object"
        ? props.beatData
        : DEFAULT_VIDEO_CONFIG.beatData,
    shots: Array.isArray(props?.shots) ? props.shots : DEFAULT_VIDEO_CONFIG.shots,
  };
}

/**
 * Returns composition settings derived from canonical root props.
 *
 * @param {any} props
 * @returns {{
 *   width: number,
 *   height: number,
 *   fps: number,
 *   beatData?: any,
 *   durationInFrames: number,
 * }}
 * Uses mapper-derived composition metadata, including the full intro/main/outro duration.
 */
function getCompositionSettings(props) {
  const videoConfig = getVideoConfig(props);
  const mappedConfig = mapVideoConfigToComposition(videoConfig, videoConfig.beatData);

  return {
    width: mappedConfig.composition.width,
    height: mappedConfig.composition.height,
    fps: mappedConfig.composition.fps,
    durationInFrames: mappedConfig.composition.totalFrames,
  };
}

/**
 * Studio/default composition settings derived from the canonical default config.
 */
const DEFAULT_SETTINGS = getCompositionSettings(DEFAULT_VIDEO_CONFIG);

/* -------------------------------------------------------------------------- */
/* Metadata helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Returns Remotion metadata derived from canonical composition props.
 *
 * @param {{props: any}} options
 * `options.props` uses the canonical root shape `{project, beatData, shots}` and is
 * merged with root defaults before metadata is derived.
 * @returns {{durationInFrames: number, width: number, height: number, fps: number}}
 */
function calculateCompositionMetadata({props}) {
  const settings = getCompositionSettings(getVideoConfig(props));

  return {
    durationInFrames: settings.durationInFrames,
    width: settings.width,
    height: settings.height,
    fps: settings.fps,
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
      width={DEFAULT_SETTINGS.width}
      height={DEFAULT_SETTINGS.height}
      fps={DEFAULT_SETTINGS.fps}
      durationInFrames={DEFAULT_SETTINGS.durationInFrames}
      calculateMetadata={calculateCompositionMetadata}
      defaultProps={DEFAULT_VIDEO_CONFIG}
    />
  );
};
