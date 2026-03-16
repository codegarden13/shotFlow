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
 * - Shot timing is derived from per-shot `duration`
 * - Headline, caption and zoom are taken from JSON
 * - Intro and outro use fixed frame durations from `TIMING`
 *
 * Expected input props
 * --------------------
 * {
 *   title?: string,
 *   subtitle?: string,
 *   intro?: {
 *     title?: string,
 *     subtitle?: string,
 *     background?: any,
 *     layout?: any,
 *     titleAnimation?: any,
 *     subtitleAnimation?: any
 *   },
 *   shots?: Array<{
 *     id?: string,
 *     src?: string,
 *     title?: string,
 *     headline?: string,
 *     caption?: string,
 *     captionAnimation?: any,
 *     duration?: number,
 *     durationInFrames?: number,
 *     zoom?: number
 *   }>,
 *   outroText?: string
 * }
 *
 * Design decisions
 * ----------------
 * - Keep rendering logic simple and deterministic
 * - Avoid path normalization in the composition layer
 * - Use Remotion bundled static assets as the media access mechanism
 * - Keep shot defaults local to this module
 *
 * Change log
 * ----------
 * 2026-03-14
 * - Refactored composition to use bundled `public/video-shots` assets via `staticFile()`
 * - Removed runtime URL-based media access from JSX
 * - Reintroduced local shot defaults for duration / zoom / text fields
 * - Simplified media loading to align with Express static routing
 * - Standardized section comments and function headers
 * - Refactored intro and shot helpers into clearer config-driven accessors
 * - Added JSON-driven shot caption animation support with stable fallbacks
 * - Added JSON-driven intro background image and overlay support
 *
 * Notes for future work
 * ---------------------
 * - Add transition presets driven by JSON
 * - Add layout presets per shot
 * - Add beat-sync using `music-beats.json`
 * - Move scene variants into a registry-based composition system
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

const TIMING = {
  intro: 60,
  outro: 60,
};

const SHOT_DEFAULTS = {
  duration: 90,
  zoom: 1,
  caption: "",
  headline: "",
};

const MUSIC_DEFAULTS = {
  src: "music.mp3",
  volume: 0.18,
  fadeDuration: 20,
};

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
 * Returns the effective intro configuration object.
 * The composition currently keeps backward compatibility with top-level
 * `title` and `subtitle` while allowing future migration to `intro.*`.
 *
 * @param {{title?: string, subtitle?: string, intro?: any}} props
 * @returns {{title?: string, subtitle?: string, background?: any, layout?: any, titleAnimation?: any, subtitleAnimation?: any}}
 */

function getIntroConfig(props = {}) {
  const intro = props?.intro || {};

  return {
    title: intro.title ?? props.title,
    subtitle: intro.subtitle ?? props.subtitle,
    background: intro.background || {},
    layout: intro.layout || {},
    titleAnimation: intro.titleAnimation || {},
    subtitleAnimation: intro.subtitleAnimation || {},
  };
}

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
  shot?.headline || shot?.title || SHOT_DEFAULTS.headline;

/**
 * Returns the effective caption for one shot.
 *
 * @param {any} shot
 * @returns {string}
 */
const getShotCaption = (shot) => shot?.caption || SHOT_DEFAULTS.caption;

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
const getShotZoom = (shot) => Number(shot?.zoom ?? SHOT_DEFAULTS.zoom);

/**
 * Returns the effective source file name for one shot.
 *
 * @param {any} shot
 * @returns {string}
 */
const getShotSource = (shot) => shot?.src || "";

/**
 * Returns the effective outro text.
 *
 * @param {{outroText?: string}} props
 * @returns {string | undefined}
 */
function getOutroText(props = {}) {
  return props?.outroText;
}

/* -------------------------------------------------------------------------- */
/* Timing helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Returns the effective duration of one shot in frames.
 *
 * @param {any} shot
 * @returns {number}
 */
const getShotDuration = (shot) =>
  Number(shot?.duration ?? shot?.durationInFrames ?? SHOT_DEFAULTS.duration);

/**
 * Returns the timeline start frame for one shot.
 *
 * @param {any[]} shots
 * @param {number} index
 * @returns {number}
 */
const getShotStart = (shots, index) => {
  const durationBefore = shots
    .slice(0, index)
    .reduce((sum, shot) => sum + getShotDuration(shot), 0);

  return TIMING.intro + durationBefore;
};

/**
 * Returns the total duration of all shots.
 *
 * @param {any[]} shots
 * @returns {number}
 */
const getTotalShotsDuration = (shots) =>
  shots.reduce((sum, shot) => sum + getShotDuration(shot), 0);

/**
 * Returns the outro start frame.
 *
 * @param {any[]} shots
 * @returns {number}
 */
const getOutroStart = (shots) => TIMING.intro + getTotalShotsDuration(shots);

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

/* -------------------------------------------------------------------------- */
/* Media                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Background music with simple fade-in / fade-out.
 *
 * @param {{src?: string}} props
 * @returns {JSX.Element}
 */
const BackgroundMusic = ({src = MUSIC_DEFAULTS.src}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();

  const volume = interpolate(
    frame,
    [
      0,
      MUSIC_DEFAULTS.fadeDuration,
      durationInFrames - MUSIC_DEFAULTS.fadeDuration,
      durationInFrames,
    ],
    [0, MUSIC_DEFAULTS.volume, MUSIC_DEFAULTS.volume, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  return <Audio src={buildMediaUrl(getMediaFileName(src, MUSIC_DEFAULTS.src))} volume={volume} />;
};

/* -------------------------------------------------------------------------- */
/* Scenes                                                                     */
/* -------------------------------------------------------------------------- */

const Intro = ({title, subtitle, introConfig}) => {
  const frame = useCurrentFrame();
  const containerStyle = getIntroContainerStyle(frame, introConfig);
  const background = getIntroBackgroundConfig(introConfig?.background);

  return (
    <AbsoluteFill className="video-template" style={fullscreenCenterStyle}>
      {background.image ? <AbsoluteFill style={getIntroBackgroundImageStyle(introConfig)} /> : null}
      <AbsoluteFill style={getIntroBackgroundOverlayStyle(introConfig)} />

      <div style={containerStyle}>
        <h1 className="video-title" style={getIntroTitleStyle()}>{title}</h1>
        <p className="video-subtitle" style={getIntroSubtitleStyle()}>{subtitle}</p>
      </div>
    </AbsoluteFill>
  );
};

/**
 * One shot scene.
 *
 * @param {{shot: any}} props
 * @returns {JSX.Element}
 */
const Shot = ({shot}) => {
  const frame = useCurrentFrame();

  const src = getShotSource(shot);
  const headline = getShotHeadline(shot);
  const caption = getShotCaption(shot);
  const zoomBase = getShotZoom(shot);
  const scale = zoomBase + frame * 0.0008;

  return (
    <AbsoluteFill className="video-template" style={fullscreenCenterStyle}>
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
  const {shots = []} = props;
  const introConfig = getIntroConfig(props);
  const outroText = getOutroText(props);

  return (
    <AbsoluteFill>
      <BackgroundMusic />

      <Sequence from={0} durationInFrames={TIMING.intro}>
        <Intro
          title={introConfig.title}
          subtitle={introConfig.subtitle}
          introConfig={introConfig}
        />
      </Sequence>

      {shots.map((shot, index) => (
        <Sequence
          key={getShotSequenceKey(shot, index)}
          from={getShotStart(shots, index)}
          durationInFrames={getShotDuration(shot)}
        >
          <Shot shot={shot} />
        </Sequence>
      ))}

      <Sequence from={getOutroStart(shots)} durationInFrames={TIMING.outro}>
        <Outro text={outroText} />
      </Sequence>
    </AbsoluteFill>
  );
};
