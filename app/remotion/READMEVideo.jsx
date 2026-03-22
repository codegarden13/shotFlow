/* ========================================================================== */
/* READMEVideo.jsx                                                            */
/* ========================================================================== */
/*
 * Purpose
 * -------
 * Main Remotion composition for JSON-driven README / showcase videos.
 *
 * This module renders:
 * - Intro scene (title + subtitle)
 * - Shot sequence driven by `video.config.json`
 * - Outro scene
 * - Background music from `/video-shots/music.mp3`
 *
 * Runtime model
 * -------------
 * - Media files are loaded from bundled static assets in `public/video-shots`
 * - Scene timing is prepared in `build-video-runtime.js`
 * - Shot scenes already contain start/duration frames and transition metadata
 * - Headline, caption and zoom are taken from the normalized runtime model
 * - The JSX renderer focuses on presentation instead of timeline calculation
 *
 * Expected input props
 * --------------------
 * {
 *   project?: {
 *     title?: string,
 *     subtitle?: string,
 *     introText?: string,
 *     introDurationSeconds?: number,
 *     audioStartSeconds?: number,
 *     musicVolume?: number,
 *     layerColor?: string,
 *     outroText?: string,
 *     outroDurationSeconds?: number,
 *     fps?: number
 *   },
 *   shots?: Array<{
 *     id?: string,
 *     src?: string,
 *     title?: string,
 *     headline?: string,
 *     caption?: string,
 *     captionAnimation?: any,
 *     transition?: string,
 *     durationFrames?: number,
 *     durationInFrames?: number,
 *     startFrame?: number,
 *     zoom?: number
 *   }>
 * }
 *
 * Design decisions
 * ----------------
 * - Keep rendering logic simple and deterministic
 * - Avoid path normalization in the composition layer
 * - Use Remotion bundled static assets as the media access mechanism
 * - Keep shot defaults local to this module
 *
 * Notes for future work
 * ---------------------
 * - Add true overlapping crossfades between adjacent shot scenes
 * - Move scene variants into a registry-based template system
 * - Keep extending the runtime model instead of reintroducing timing logic here
 */
/* ========================================================================== */

import {
  AbsoluteFill,
  Img,
  Sequence,
  staticFile,
  useCurrentFrame,
  interpolate,
  useVideoConfig,
} from "remotion";
import {Audio} from "@remotion/media";
import {buildVideoRuntime} from "../lib/video/build-video-runtime.js";
import "../public/assets/css/video-template.css";

/* -------------------------------------------------------------------------- */
/* Design constants                                                           */
/* -------------------------------------------------------------------------- */

const COLORS = {
  background: "var(--video-background-color)",
  text: "var(--video-text-color)",
  caption: "var(--video-caption-color)",
};

const LAYOUT = {
  imageWidth: 1200,
  borderRadius: 20,
  captionMaxWidth: 920,
  introTitleFontSize: 72,
  introSubtitleFontSize: 32,
  headlineFontSize: 42,
  captionFontSize: 24,
  textLeft: 60,
  textBottom: 60,
  captionLeft: 60,
  captionBottom: 120,
};

const OPACITY = {
  introSubtitle: 0.8,
  caption: 0.9,
};

const VIDEO_DEFAULTS = {
  timing: {
    introFrames: 60,
    outroFrames: 60,
  },
  shot: {
    durationFrames: 90,
    zoom: 1,
    caption: "",
    headline: "",
  },
  music: {
    src: "music.mp3",
    volume: 0.18,
  },
  transition: {
    type: "cut",
    frames: 10,
    minFrames: 4,
  },
};
/**
 * Returns the canonical default transition config.
 *
 * @returns {{type: string, frames: number, minFrames: number}}
 */
function getTransitionDefaults() {
  return VIDEO_DEFAULTS.transition;
}
/**
 * Returns the canonical default timing config.
 *
 * @returns {{introFrames: number, outroFrames: number}}
 */
function getTimingDefaults() {
  return VIDEO_DEFAULTS.timing;
}

/**
 * Returns the canonical default shot config.
 *
 * @returns {{durationFrames: number, zoom: number, caption: string, headline: string}}
 */
function getShotDefaults() {
  return VIDEO_DEFAULTS.shot;
}

/**
 * Returns the canonical default music config.
 *
 * @returns {{src: string, volume: number}}
 */
function getMusicDefaults() {
  return VIDEO_DEFAULTS.music;
}

/**
 * Returns canonical props in one stable shape for local helpers.
 *
 * @param {any} props
 * @returns {{project: any, shots: any[]}}
 */
function getCanonicalVideoConfig(props = {}) {
  return {
    project: {
      ...(props?.project || {}),
    },
    shots: Array.isArray(props?.shots) ? props.shots : [],
  };
}


/**
 * Returns the canonical runtime model for rendering.
 *
 * The runtime builder centralizes scene timing, transition defaults and
 * beat-synced shot preparation so the JSX layer can stay presentation-focused.
 *
 * @param {any} props
 * @returns {{composition: any, introScene: any, shotScenes: any[], outroScene: any, audio: {beatData: any}}}
 */
function getVideoRuntime(props = {}) {
  const canonicalVideoConfig = getCanonicalVideoConfig(props);
  return buildVideoRuntime(canonicalVideoConfig, props?.beatData || {});
}

/**
 * Returns the mapped composition derived from the canonical runtime model.
 *
 * @param {any} props
 * @returns {any}
 */
function getMappedConfig(props = {}) {
  return getVideoRuntime(props)?.composition || null;
}

/**
 * Returns one stable project object for rendering text scenes.
 *
 * Title/subtitle/intro text may arrive either via canonical `project.*`
 * or via mapped `composition.*`. Rendering prefers mapped composition text
 * when present and falls back to canonical project values.
 *
 * @param {any} props
 * @returns {any}
 */
function getRenderProject(props = {}) {
  const canonicalVideoConfig = getCanonicalVideoConfig(props);
  const composition = getMappedConfig(props) || {};
  const canonicalProject = canonicalVideoConfig.project || {};

  return {
    ...canonicalProject,
    title: String(composition?.title ?? canonicalProject?.title ?? ""),
    subtitle: String(composition?.subtitle ?? canonicalProject?.subtitle ?? ""),
    introText: String(composition?.introText ?? canonicalProject?.introText ?? ""),
    audioStartSeconds: Number(canonicalProject?.audioStartSeconds ?? 0),
    musicVolume: Number(canonicalProject?.musicVolume ?? composition?.musicVolume ?? VIDEO_DEFAULTS.music.volume),
    targetDurationSeconds: Number(
      canonicalProject?.targetDurationSeconds ?? composition?.targetDurationSeconds ?? 0,
    ),
    outroText: String(composition?.outroText ?? canonicalProject?.outroText ?? ""),
    layerColor: String(composition?.layerColor ?? canonicalProject?.layerColor ?? ""),
  };
}

/* -------------------------------------------------------------------------- */
/* Media URL helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * All media is loaded from the Remotion public bundle under `video-shots/`.
 * The JSON only needs to provide the file name.
 *
 * @param {string} fileName
 * @returns {string}
 */
const buildMediaUrl = (fileName) => staticFile(`video-shots/${fileName}`);

/**
 * Returns the effective media source file name.
 *
 * @param {string | undefined} fileName
 * @param {string} fallback
 * @returns {string}
 */
const getMediaFileName = (fileName, fallback) => fileName || fallback;

/**
 * Returns a normalized intro layout configuration.
 *
 * @param {any} layout
 * @returns {{horizontalAlign: string, verticalAlign: string, offsetX: number, offsetY: number}}
 */
function getIntroLayoutConfig(layout = {}) {
  return {
    horizontalAlign: layout?.horizontalAlign || "center",
    verticalAlign: layout?.verticalAlign || "center",
    offsetX: Number(layout?.offsetX ?? 0),
    offsetY: Number(layout?.offsetY ?? 0),
  };
}

/**
 * Returns a normalized intro background configuration.
 *
 * @param {any} background
 * @returns {{image: string, size: string, position: string, overlayColor: string, overlayOpacity: number}}
 */
function getIntroBackgroundConfig(background = {}) {
  return {
    image: background?.image || "",
    size: background?.size || "cover",
    position: background?.position || "center center",
    overlayColor: background?.overlayColor || "transparent",
    overlayOpacity: Number(background?.overlayOpacity ?? 0),
  };
}

/**
 * Returns the intro background config derived from canonical project props.
 *
 * @param {any} project
 * @returns {{image: string, size: string, position: string, overlayColor: string, overlayOpacity: number}}
 */
function getProjectIntroBackgroundConfig(project = {}) {
  return getIntroBackgroundConfig({
    overlayColor: String(project?.layerColor || "transparent"),
    overlayOpacity: 0.45,
    image: "",
    size: "cover",
    position: "center center",
  });
}

/**
 * Returns stable intro animation presets.
 *
 * @returns {{titleAnimation: any, subtitleAnimation: any}}
 */
function getProjectIntroAnimations() {
  return {
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
  };
}

/**
 * Returns a normalized intro animation configuration.
 *
 * @param {any} animation
 * @param {{x: number, y: number, opacity: number, letterSpacing: number}} fallbackFrom
 * @param {{x: number, y: number, opacity: number, letterSpacing: number}} fallbackTo
 * @param {number[]} fallbackFrames
 * @returns {{from: {x: number, y: number, opacity: number, letterSpacing: number}, to: {x: number, y: number, opacity: number, letterSpacing: number}, frames: number[]}}
 */
function getIntroAnimationConfig(animation, fallbackFrom, fallbackTo, fallbackFrames) {
  const from = animation?.from || {};
  const to = animation?.to || {};
  const frames = Array.isArray(animation?.frames) && animation.frames.length >= 2
    ? animation.frames
    : fallbackFrames;

  return {
    from: {
      x: Number(from.x ?? fallbackFrom.x),
      y: Number(from.y ?? fallbackFrom.y),
      opacity: Number(from.opacity ?? fallbackFrom.opacity),
      letterSpacing: Number(from.letterSpacing ?? fallbackFrom.letterSpacing),
    },
    to: {
      x: Number(to.x ?? fallbackTo.x),
      y: Number(to.y ?? fallbackTo.y),
      opacity: Number(to.opacity ?? fallbackTo.opacity),
      letterSpacing: Number(to.letterSpacing ?? fallbackTo.letterSpacing),
    },
    frames,
  };
}

/**
 * Returns the effective headline for one shot.
 *
 * @param {any} shot
 * @returns {string}
 */
const getShotHeadline = (shot) =>
  shot?.headline || shot?.title || getShotDefaults().headline;

/**
 * Returns the effective caption for one shot.
 *
 * @param {any} shot
 * @returns {string}
 */
const getShotCaption = (shot) => shot?.caption || getShotDefaults().caption;

/**
 * Returns the normalized caption animation config for one shot.
 *
 * Supported JSON shape:
 * {
 *   from?: {x?: number, y?: number, opacity?: number, letterSpacing?: number},
 *   to?: {x?: number, y?: number, opacity?: number, letterSpacing?: number},
 *   frames?: number[]
 * }
 *
 * @param {any} shot
 * @returns {{from: {x: number, y: number, opacity: number, letterSpacing: number}, to: {x: number, y: number, opacity: number, letterSpacing: number}, frames: number[]}}
 */
function getShotCaptionAnimationConfig(shot) {
  const animation = shot?.captionAnimation || {};
  const from = animation?.from || {};
  const to = animation?.to || {};
  const frames = Array.isArray(animation?.frames) && animation.frames.length >= 2
    ? animation.frames
    : [0, 24];

  return {
    from: {
      x: Number(from.x ?? 0),
      y: Number(from.y ?? 36),
      opacity: Number(from.opacity ?? 0),
      letterSpacing: Number(from.letterSpacing ?? 2),
    },
    to: {
      x: Number(to.x ?? 0),
      y: Number(to.y ?? 0),
      opacity: Number(to.opacity ?? 1),
      letterSpacing: Number(to.letterSpacing ?? 0),
    },
    frames,
  };
}

/**
 * Returns the effective zoom base for one shot.
 *
 * @param {any} shot
 * @returns {number}
 */
const getShotZoom = (shot) => Number(shot?.zoom ?? getShotDefaults().zoom);

/**
 * Returns the effective source file name for one shot.
 *
 * @param {any} shot
 * @returns {string}
 */
const getShotSource = (shot) => shot?.src || "";

/**
 * Returns the normalized transition preset for one shot.
 *
 * @param {any} shot
 * @returns {string}
 */
function getShotTransition(shot) {
  return String(shot?.transition || getTransitionDefaults().type).toLowerCase();
}

/**
 * Returns the effective transition length for one shot.
 *
 * Short shots automatically receive shorter transitions so fade/zoom animation
 * stays visible without consuming most of the shot runtime.
 *
 * @param {number} durationInFrames
 * @returns {number}
 */
function getShotTransitionFrames(durationInFrames) {
  const transitionDefaults = getTransitionDefaults();
  const safeDuration = Math.max(0, Number(durationInFrames) || 0);
  const proportionalFrames = Math.floor(safeDuration * 0.18);

  return Math.max(
    transitionDefaults.minFrames,
    Math.min(transitionDefaults.frames, proportionalFrames || transitionDefaults.frames),
  );
}

/**
 * Returns visible transition animation values for one shot.
 *
 * `cut` keeps the previous hard-cut behavior.
 * `fade` fades in and out inside the shot sequence.
 * `zoom` adds a stronger punch-in / settle movement near the sequence edges.
 *
 * @param {number} frame
 * @param {any} shot
 * @param {number} durationInFrames
 * @returns {{opacity: number, transitionScaleOffset: number}}
 */
function getShotTransitionState(frame, shot, durationInFrames) {
  const transition = getShotTransition(shot);
  const transitionFrames = getShotTransitionFrames(durationInFrames);
  const endStartFrame = Math.max(0, durationInFrames - transitionFrames);

  if (transition === "fade") {
    const fadeInOpacity = interpolate(frame, [0, transitionFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const fadeOutOpacity = interpolate(
      frame,
      [endStartFrame, durationInFrames],
      [1, 0],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );

    return {
      opacity: Math.min(fadeInOpacity, fadeOutOpacity),
      transitionScaleOffset: 0,
    };
  }

  if (transition === "zoom") {
    const enterScaleOffset = interpolate(frame, [0, transitionFrames], [0.12, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const exitScaleOffset = interpolate(
      frame,
      [endStartFrame, durationInFrames],
      [0, 0.08],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );
    const enterOpacity = interpolate(frame, [0, transitionFrames], [0.8, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const exitOpacity = interpolate(
      frame,
      [endStartFrame, durationInFrames],
      [1, 0.92],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );

    return {
      opacity: Math.min(enterOpacity, exitOpacity),
      transitionScaleOffset: enterScaleOffset + exitScaleOffset,
    };
  }

  return {
    opacity: 1,
    transitionScaleOffset: 0,
  };
}

/**
 * Builds one compact render-debug payload for a prepared runtime shot.
 *
 * Runtime shots already contain canonical timing values from `buildVideoRuntime`,
 * so debug output should read `startFrame` and `durationInFrames` directly from
 * the prepared shot scene instead of recalculating timeline positions.
 *
 * @param {any} shot
 * @param {number} index
 * @param {number} introDurationFrames
 * @returns {{
 *   id: string,
 *   src: string,
 *   startFrame: number,
 *   durationFrames: number,
 *   endFrame: number,
 * }}
 */
function getShotRenderDebugEntry(shot, index, introDurationFrames) {
  const startFrame = Number(shot?.startFrame ?? introDurationFrames);
  const durationFrames = Number(shot?.durationInFrames ?? shot?.durationFrames ?? 0);

  return {
    id: String(shot?.id || `shot-${index + 1}`),
    src: String(getShotSource(shot) || ""),
    startFrame,
    durationFrames,
    endFrame: startFrame + durationFrames,
  };
}

/**
 * Formats one frame count as seconds for render/debug output.
 *
 * @param {number} frames
 * @param {number} fps
 * @returns {number}
 */
function framesToSeconds(frames, fps) {
  const safeFps = Number(fps) || 30;
  return Number((Number(frames || 0) / safeFps).toFixed(2));
}



/**
 * Builds one compact input/debug payload for a raw canonical shot.
 *
 * @param {any} shot
 * @param {number} index
 * @returns {{
 *   id: string,
 *   src: string,
 *   durationSeconds: number,
 *   title: string,
 *   caption: string,
 *   zoom: number,
 * }}
 */
function getShotInputDebugEntry(shot, index) {
  return {
    id: String(shot?.id || `shot-${index + 1}`),
    src: String(shot?.src || ""),
    durationSeconds: Number(shot?.durationSeconds ?? 0),
    title: String(shot?.title || shot?.headline || ""),
    caption: String(shot?.caption || ""),
    zoom: Number(shot?.zoom ?? getShotDefaults().zoom),
  };
}

/**
 * Builds one compact project-level debug payload from canonical JSON input.
 *
 * @param {any} project
 * @returns {{
 *   title: string,
 *   subtitle: string,
 *   introText: string,
 *   audioStartSeconds: number,
 *   musicVolume: number,
 *   outroText: string,
 *   layerColor: string,
 *   aspectRatio: string,
 *   width: string | number,
 *   fps: number,
 *   targetDurationSeconds: number,
 *   beatSyncEnabled: boolean,
 *   beatSyncStep: number,
 * }}
 */
function getProjectInputDebugEntry(project) {
  return {
    title: String(project?.title || ""),
    subtitle: String(project?.subtitle || ""),
    introText: String(project?.introText || ""),
    audioStartSeconds: Number(project?.audioStartSeconds ?? 0),
    musicVolume: Number(project?.musicVolume ?? VIDEO_DEFAULTS.music.volume),
    outroText: String(project?.outroText || ""),
    layerColor: String(project?.layerColor || ""),
    aspectRatio: String(project?.aspectRatio || ""),
    width: project?.width ?? "",
    fps: Number(project?.fps ?? 0),
    targetDurationSeconds: Number(project?.targetDurationSeconds ?? 0),
    introDurationSeconds: project?.introDurationSeconds ?? "",
    outroDurationSeconds: project?.outroDurationSeconds ?? "",
    beatSyncEnabled: Boolean(project?.beatSyncEnabled ?? true),
    beatSyncStep: Number(project?.beatSyncStep ?? 1),
  };
}

/**
 * Builds one fachlicher Render-Log payload so development logs can show both
 * canonical JSON input and the derived runtime values used by Remotion.
 *
 * @param {{project?: any, shots?: any[]}} props
 * @param {any[]} shots
 * @returns {{
 *   input: {
 *     project: any,
 *     shots: any[],
 *   },
 *   derived: {
 *     composition: any,
 *     introFrames: number,
 *     outroFrames: number,
 *     shots: any[],
 *   },
 * }}
 */
function getRenderDebugPayload(props, shots) {
  const canonicalVideoConfig = getCanonicalVideoConfig(props);
  const renderProject = getRenderProject(props);
  const inputProject = getProjectInputDebugEntry(renderProject);
  const inputShots = Array.isArray(canonicalVideoConfig.shots)
    ? canonicalVideoConfig.shots.map((shot, index) => getShotInputDebugEntry(shot, index))
    : [];
  const runtime = getVideoRuntime(props);
  const mappedComposition = runtime?.composition || null;
  const compositionFps = Number(runtime?.composition?.fps ?? props?.project?.fps ?? 30);
  const introDurationFrames = Number(runtime?.introScene?.durationFrames ?? 0);
  const outroDurationFrames = Number(runtime?.outroScene?.durationFrames ?? 0);
  const derivedShots = shots.map((shot, index) => {
    const debugEntry = getShotRenderDebugEntry(shot, index, introDurationFrames);

    return {
      ...debugEntry,
      startSeconds: framesToSeconds(debugEntry.startFrame, compositionFps),
      durationSeconds: framesToSeconds(debugEntry.durationFrames, compositionFps),
      endSeconds: framesToSeconds(debugEntry.endFrame, compositionFps),
    };
  });

  const totalShotsDuration = shots.reduce(
    (sum, shot) => sum + (Number(shot?.durationInFrames ?? shot?.durationFrames) || 0),
    0,
  );
  const outroStart = Number(runtime?.outroScene?.startFrame ?? introDurationFrames + totalShotsDuration);
  const totalDuration = outroStart + outroDurationFrames;

  return {
    input: {
      project: inputProject,
      shots: inputShots,
    },
    derived: {
      composition: mappedComposition,
      fps: compositionFps,
      introFrames: introDurationFrames,
      introSeconds: framesToSeconds(introDurationFrames, compositionFps),
      outroFrames: outroDurationFrames,
      outroSeconds: framesToSeconds(outroDurationFrames, compositionFps),
      totalShotsDuration,
      totalShotsDurationSeconds: framesToSeconds(totalShotsDuration, compositionFps),
      outroStartFrame: outroStart,
      outroStartSeconds: framesToSeconds(outroStart, compositionFps),
      totalDurationFrames: totalDuration,
      totalDurationSeconds: framesToSeconds(totalDuration, compositionFps),
      shots: derivedShots,
    },
  };
}

function logRenderDebugOnce(payload) {
  const scope = typeof globalThis !== "undefined" ? globalThis : window;
  const payloadKey = JSON.stringify(payload);

  if (!Array.isArray(scope.__README_VIDEO_RENDER_DEBUG_LOGGED_KEYS__)) {
    scope.__README_VIDEO_RENDER_DEBUG_LOGGED_KEYS__ = [];
  }

  if (scope.__README_VIDEO_RENDER_DEBUG_LOGGED_KEYS__.includes(payloadKey)) {
    return;
  }

  scope.__README_VIDEO_RENDER_DEBUG_LOGGED_KEYS__.push(payloadKey);
  console.log("[READMEVideo.renderDebug]", payloadKey);
}

/* -------------------------------------------------------------------------- */
/* Shared styles                                                              */
/* -------------------------------------------------------------------------- */

const fullscreenCenterStyle = {
  justifyContent: "center",
  alignItems: "center",
  background: COLORS.background,
  color: COLORS.text,
  fontFamily: "var(--video-font-family)",
};

const introTextContainerStyle = {
  textAlign: "center",
};

const introBodyTextStyle = {
  marginTop: 18,
  maxWidth: 760,
  fontSize: 22,
  lineHeight: 1.4,
  fontFamily: "var(--video-font-family)",
  color: COLORS.text,
  opacity: 0.88,
};

const outroTextStyle = {
  fontSize: LAYOUT.headlineFontSize,
  fontWeight: 700,
  fontFamily: "var(--video-font-family)",
  color: COLORS.text,
  textShadow: "0 2px 6px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)",
  background: "rgba(0,0,0,0.25)",
  padding: "8px 14px",
  borderRadius: "6px",
};

/**
 * Builds the animated caption text style for a shot.
 * Animation values are read from shot JSON with stable fallbacks.
 *
 * @param {number} frame
 * @param {any} shot
 * @returns {React.CSSProperties}
 */
function getCaptionStyle(frame, shot) {
  const animation = getShotCaptionAnimationConfig(shot);

  const captionX = interpolate(frame, animation.frames, [animation.from.x, animation.to.x], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const captionY = interpolate(frame, animation.frames, [animation.from.y, animation.to.y], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const captionOpacity = interpolate(
    frame,
    animation.frames,
    [animation.from.opacity, animation.to.opacity],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );
  const captionLetterSpacing = interpolate(
    frame,
    animation.frames,
    [animation.from.letterSpacing, animation.to.letterSpacing],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  return {
    position: "absolute",
    bottom: LAYOUT.captionBottom,
    left: LAYOUT.captionLeft,
    maxWidth: LAYOUT.captionMaxWidth,
    fontSize: LAYOUT.captionFontSize,
    lineHeight: 1.35,
    opacity: captionOpacity,
    color: COLORS.caption,
    transform: `translate(${captionX}px, ${captionY}px)`,
    letterSpacing: `${captionLetterSpacing}px`,
  };
}

/**
 * Builds the headline text style for a shot.
 *
 * @returns {React.CSSProperties}
 */
function getHeadlineStyle() {
  return {
    position: "absolute",
    bottom: LAYOUT.textBottom,
    left: LAYOUT.textLeft,
    fontSize: LAYOUT.headlineFontSize,
    fontWeight: 700,
    fontFamily: "var(--video-font-family)",
    color: COLORS.text,
  };
}

/**
 * Builds the animated image style for a shot.
 *
 * @param {number} scale
 * @returns {React.CSSProperties}
 */
function getShotImageStyle(scale) {
  return {
    width: LAYOUT.imageWidth,
    transform: `scale(${scale})`,
    borderRadius: LAYOUT.borderRadius,
    boxShadow: "0 0.75rem 2rem rgba(0, 0, 0, 0.22)",
  };
}

/**
 * Builds the shot scene container style.
 *
 * @param {number} opacity
 * @returns {React.CSSProperties}
 */
function getShotSceneStyle(opacity) {
  return {
    ...fullscreenCenterStyle,
    opacity,
  };
}

/**
 * Builds the intro title style.
 *
 * @returns {React.CSSProperties}
 */
function getIntroTitleStyle() {
  return {
    fontSize: LAYOUT.introTitleFontSize,
    fontFamily: "var(--video-font-family)",
    color: COLORS.text,
  };
}

/**
 * Builds the intro subtitle style.
 *
 * @returns {React.CSSProperties}
 */
function getIntroSubtitleStyle() {
  return {
    fontSize: LAYOUT.introSubtitleFontSize,
    fontFamily: "var(--video-font-family)",
    color: COLORS.text,
    opacity: OPACITY.introSubtitle,
  };
}

/**
 * Builds animated CSS variables for the intro title and subtitle.
 * Animation values are read from JSON config with stable fallbacks.
 *
 * @param {number} frame
 * @param {{titleAnimation?: any, subtitleAnimation?: any}} introConfig
 * @returns {React.CSSProperties}
 */
function getIntroAnimationVars(frame, introConfig) {
  const titleConfig = getIntroAnimationConfig(
    introConfig?.titleAnimation,
    {x: -140, y: 24, opacity: 0, letterSpacing: 6},
    {x: 0, y: 0, opacity: 1, letterSpacing: 0},
    [0, 24]
  );

  const subtitleConfig = getIntroAnimationConfig(
    introConfig?.subtitleAnimation,
    {x: 90, y: 12, opacity: 0, letterSpacing: 3},
    {x: 0, y: 0, opacity: 1, letterSpacing: 0},
    [8, 40]
  );

  const titleX = interpolate(frame, titleConfig.frames, [titleConfig.from.x, titleConfig.to.x], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleY = interpolate(frame, titleConfig.frames, [titleConfig.from.y, titleConfig.to.y], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleOpacity = interpolate(
    frame,
    titleConfig.frames,
    [titleConfig.from.opacity, titleConfig.to.opacity],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );
  const titleLetterSpacing = interpolate(
    frame,
    titleConfig.frames,
    [titleConfig.from.letterSpacing, titleConfig.to.letterSpacing],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  const subtitleX = interpolate(
    frame,
    subtitleConfig.frames,
    [subtitleConfig.from.x, subtitleConfig.to.x],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );
  const subtitleY = interpolate(
    frame,
    subtitleConfig.frames,
    [subtitleConfig.from.y, subtitleConfig.to.y],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );
  const subtitleOpacity = interpolate(
    frame,
    subtitleConfig.frames,
    [subtitleConfig.from.opacity, subtitleConfig.to.opacity],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );
  const subtitleLetterSpacing = interpolate(
    frame,
    subtitleConfig.frames,
    [subtitleConfig.from.letterSpacing, subtitleConfig.to.letterSpacing],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  return {
    "--video-title-x": `${titleX}px`,
    "--video-title-y": `${titleY}px`,
    "--video-title-opacity": titleOpacity,
    "--video-title-letter-spacing": `${titleLetterSpacing}px`,
    "--video-subtitle-x": `${subtitleX}px`,
    "--video-subtitle-y": `${subtitleY}px`,
    "--video-subtitle-opacity": subtitleOpacity,
    "--video-subtitle-letter-spacing": `${subtitleLetterSpacing}px`,
  };
}

/**
 * Builds the current intro wrapper style.
 * Layout settings are mapped from JSON into stable CSS values.
 *
 * @param {number} frame
 * @param {{layout?: any, titleAnimation?: any, subtitleAnimation?: any}} introConfig
 * @returns {React.CSSProperties}
 */
function getIntroContainerStyle(frame, introConfig) {
  const layout = getIntroLayoutConfig(introConfig?.layout);

  const textAlign =
    layout.horizontalAlign === "left"
      ? "left"
      : layout.horizontalAlign === "right"
        ? "right"
        : "center";

  const alignItems =
    layout.horizontalAlign === "left"
      ? "flex-start"
      : layout.horizontalAlign === "right"
        ? "flex-end"
        : "center";

  const justifyContent =
    layout.verticalAlign === "top"
      ? "flex-start"
      : layout.verticalAlign === "bottom"
        ? "flex-end"
        : "center";


  return {
    ...introTextContainerStyle,
    ...getIntroAnimationVars(frame, introConfig),
    display: "flex",
    flexDirection: "column",
    justifyContent,
    alignItems,
    textAlign,
    width: "100%",
    height: "100%",
    padding: "80px",
    transform: `translate(${layout.offsetX}px, ${layout.offsetY}px)`,
  };
}

/**
 * Builds the intro background image style.
 *
 * @param {{background?: any}} introConfig
 * @returns {React.CSSProperties}
 */
function getIntroBackgroundImageStyle(introConfig) {
  const background = getIntroBackgroundConfig(introConfig?.background);

  return {
    backgroundImage: background.image
      ? `url(${buildMediaUrl(background.image)})`
      : "none",
    backgroundSize: background.size,
    backgroundPosition: background.position,
    backgroundRepeat: "no-repeat",
  };
}

/**
 * Builds the intro background overlay style.
 *
 * @param {{background?: any}} introConfig
 * @returns {React.CSSProperties}
 */
function getIntroBackgroundOverlayStyle(introConfig) {
  const background = getIntroBackgroundConfig(introConfig?.background);

  return {
    backgroundColor: background.overlayColor,
    opacity: background.overlayOpacity,
  };
}

/**
 * Builds the animated outro text style.
 * The outro text enters from above, stays readable, and continues traveling
 * downward during the full outro section.
 *
 * @param {number} frame
 * @returns {React.CSSProperties}
 */
function getOutroAnimatedStyle(frame) {
  const y = interpolate(frame, [0, 12, 42, 59], [-320, -20, 110, 260], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = interpolate(frame, [0, 6, 50, 59], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return {
    ...outroTextStyle,
    opacity,
    transform: `translateY(${y}px)`,
    marginTop: 0,
  };
}

/**
 * Clamps one numeric progress value to the inclusive 0..1 range.
 *
 * @param {number} value
 * @returns {number}
 */
function clampUnit(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

/**
 * Returns one harmonic fade-up factor from 0 to 1.
 *
 * @param {number} frame
 * @param {number} endFrame
 * @returns {number}
 */
function getHarmonicFadeUp(frame, endFrame) {
  if (endFrame <= 0) {
    return 1;
  }

  const progress = clampUnit(frame / endFrame);
  return 0.5 - 0.5 * Math.cos(Math.PI * progress);
}

/**
 * Returns one harmonic fade-down factor from 1 to 0.
 *
 * @param {number} frame
 * @param {number} startFrame
 * @param {number} endFrame
 * @returns {number}
 */
function getHarmonicFadeDown(frame, startFrame, endFrame) {
  const durationFrames = endFrame - startFrame;

  if (durationFrames <= 0) {
    return frame < startFrame ? 1 : 0;
  }

  const progress = clampUnit((frame - startFrame) / durationFrames);
  return 0.5 + 0.5 * Math.cos(Math.PI * progress);
}

/**
 * Converts one audio-start offset in seconds to non-negative whole frames.
 *
 * @param {number} audioStartSeconds
 * @param {number} fps
 * @returns {number}
 */
function getAudioStartFrameOffset(audioStartSeconds, fps) {
  const safeSeconds = Math.max(0, Number(audioStartSeconds) || 0);
  const safeFps = Math.max(1, Number(fps) || 30);
  return Math.max(0, Math.round(safeSeconds * safeFps));
}

/**
 * Returns the harmonic background-music envelope for intro, main and outro.
 *
 * The final volume is the minimum of the intro fade-up and outro fade-down.
 * This keeps transitions smooth even when intro and outro overlap or one of
 * the sections is extremely short.
 *
 * @param {number} frame
 * @param {number} introDurationFrames
 * @param {number} outroStartFrame
 * @param {number} durationInFrames
 * @param {number} maxVolume
 * @returns {number}
 */
function getBackgroundMusicVolume(
  frame,
  introDurationFrames,
  outroStartFrame,
  durationInFrames,
  maxVolume,
) {
  const safeDurationInFrames = Math.max(0, Number(durationInFrames) || 0);
  const safeIntroEndFrame = Math.max(0, Math.min(Number(introDurationFrames) || 0, safeDurationInFrames));
  const safeOutroStartFrame = Math.max(0, Math.min(Number(outroStartFrame) || 0, safeDurationInFrames));
  const safeMaxVolume = Math.max(0, Number(maxVolume) || 0);

  if (safeDurationInFrames <= 0 || safeMaxVolume <= 0) {
    return 0;
  }

  const fadeUp = getHarmonicFadeUp(frame, safeIntroEndFrame);
  const fadeDown = getHarmonicFadeDown(frame, safeOutroStartFrame, safeDurationInFrames);

  return safeMaxVolume * Math.min(fadeUp, fadeDown);
}

/* -------------------------------------------------------------------------- */
/* Media                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Background music with a harmonic intro/main/outro envelope.
 *
 * @param {{
 *   src?: string,
 *   volume?: number,
 *   audioStartSeconds?: number,
 *   introDurationFrames?: number,
 *   outroStartFrame?: number,
 * }} props
 * @returns {JSX.Element}
 */
const BackgroundMusic = ({
  src,
  volume,
  audioStartSeconds = 0,
  introDurationFrames = 0,
  outroStartFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const musicDefaults = getMusicDefaults();
  const resolvedSrc = src || musicDefaults.src;
  const resolvedVolume = Math.max(0, Number(volume ?? musicDefaults.volume) || 0);
  const startFrom = getAudioStartFrameOffset(audioStartSeconds, fps);
  const backgroundVolume = getBackgroundMusicVolume(
    frame,
    introDurationFrames,
    outroStartFrame,
    durationInFrames,
    resolvedVolume,
  );

  return (
    <Audio
      src={buildMediaUrl(getMediaFileName(resolvedSrc, musicDefaults.src))}
      startFrom={startFrom}
      volume={backgroundVolume}
    />
  );
};

/* -------------------------------------------------------------------------- */
/* Scenes                                                                     */
/* -------------------------------------------------------------------------- */

const Intro = ({project}) => {
  const frame = useCurrentFrame();
  const introAnimations = getProjectIntroAnimations();
  const title = String(project?.title || "");
  const subtitle = String(project?.subtitle || "");
  const introText = String(project?.introText || "");
  const introBackground = getProjectIntroBackgroundConfig(project);
  const introConfig = {
    layout: {
      horizontalAlign: "center",
      verticalAlign: "center",
      offsetX: 0,
      offsetY: 0,
    },
    background: introBackground,
    ...introAnimations,
  };
  const containerStyle = getIntroContainerStyle(frame, introConfig);
  const background = introBackground;

  return (
    <AbsoluteFill className="video-template" style={fullscreenCenterStyle}>
      {background.image ? <AbsoluteFill style={getIntroBackgroundImageStyle(introConfig)} /> : null}
      <AbsoluteFill style={getIntroBackgroundOverlayStyle(introConfig)} />

      <div style={containerStyle}>
        <h1 className="video-title" style={getIntroTitleStyle()}>{title}</h1>
        <p className="video-subtitle" style={getIntroSubtitleStyle()}>{subtitle}</p>
        {introText ? <p style={introBodyTextStyle}>{introText}</p> : null}
      </div>
    </AbsoluteFill>
  );
};

/**
 * One shot scene.
 *
 * @param {{shot: any, durationInFrames: number}} props
 * @returns {JSX.Element}
 */
const Shot = ({shot, durationInFrames}) => {
  const frame = useCurrentFrame();

  const src = getShotSource(shot);
  const headline = getShotHeadline(shot);
  const caption = getShotCaption(shot);
  const zoomBase = getShotZoom(shot);
  const transitionState = getShotTransitionState(frame, shot, durationInFrames);
  const scale = zoomBase + frame * 0.0008 + transitionState.transitionScaleOffset;

  return (
    <AbsoluteFill className="video-template" style={getShotSceneStyle(transitionState.opacity)}>
      <Img src={buildMediaUrl(src)} style={getShotImageStyle(scale)} />

      {caption ? <div className="video-caption" style={getCaptionStyle(frame, shot)}>{caption}</div> : null}

      {headline ? <div style={getHeadlineStyle()}>{headline}</div> : null}
    </AbsoluteFill>
  );
};

/**
 * Outro scene.
 *
 * @param {{text?: string}} props
 * @returns {JSX.Element}
 */
const Outro = ({text}) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      className="video-template"
      style={{
        ...fullscreenCenterStyle,
        justifyContent: "flex-start",
        overflow: "hidden",
        paddingTop: 0,
      }}
    >
      <h2 style={getOutroAnimatedStyle(frame)}>{text}</h2>
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------------- */
/* Composition                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Builds a stable React key for one shot sequence.
 *
 * @param {any} shot
 * @param {number} index
 * @returns {string}
 */
function getShotSequenceKey(shot, index) {
  return `${shot.id || shot.src}-${index}`;
}

export const READMEVideo = (props) => {
  const project = getRenderProject(props);
  const runtime = getVideoRuntime(props);
  const canonicalVideoConfig = getCanonicalVideoConfig(props);
  const shots = Array.isArray(runtime?.shotScenes)
    ? runtime.shotScenes.map((scene) => ({
      ...scene.shot,
      ...scene,
      durationInFrames: scene.durationFrames,
    }))
    : [];
  const introDurationFrames = Number(runtime?.introScene?.durationFrames ?? 0);
  const outroDurationFrames = Number(runtime?.outroScene?.durationFrames ?? 0);
  const outroStartFrame = Number(runtime?.outroScene?.startFrame ?? introDurationFrames);
  const renderDebug = getRenderDebugPayload(
    {
      ...props,
      project,
      shots: canonicalVideoConfig.shots,
    },
    shots,
  );

  logRenderDebugOnce(renderDebug);

  return (
    <AbsoluteFill>
      <BackgroundMusic
        volume={project?.musicVolume}
        audioStartSeconds={project?.audioStartSeconds}
        introDurationFrames={introDurationFrames}
        outroStartFrame={outroStartFrame}
      />

      <Sequence from={0} durationInFrames={introDurationFrames}>
        <Intro project={project} />
      </Sequence>

      {shots.map((shot, index) => (
        <Sequence
          key={getShotSequenceKey(shot, index)}
          from={Number(shot?.startFrame ?? introDurationFrames)}
          durationInFrames={Number(shot?.durationInFrames ?? shot?.durationFrames ?? 1)}
        >
          <Shot
            shot={shot}
            durationInFrames={Number(shot?.durationInFrames ?? shot?.durationFrames ?? 1)}
          />
        </Sequence>
      ))}

      <Sequence
        from={outroStartFrame}
        durationInFrames={outroDurationFrames}
      >
        <Outro text={String(project?.outroText || "")} />
      </Sequence>
    </AbsoluteFill>
  );
};
