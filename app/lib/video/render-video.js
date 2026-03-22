/* ========================================================================== */
/* render-video.js                                                            */
/* ========================================================================== */
/*
 * Purpose
 * -------
 * Builds and renders the Remotion composition into the configured output video
 * file.
 *
 * Responsibilities
 * ----------------
 * - Read `config/config.json`
 * - Resolve the selected project directory below `video-shots`
 * - Load the selected project's `video.config.json`
 *
 * Runtime model
 * -------------
 * The Remotion renderer does not fetch media from the app's Express server.
 * During rendering, media must be available inside the Remotion bundle/public
 * context. Therefore, all referenced media files are copied from the selected
 * project directory inside `config.base` into `app/public/video-shots` before
 * bundling.
 *
 * Source of truth
 * ---------------
 * `config/config.json` is the single source of truth for:
 * - `base` -> absolute path to the real `video-shots` root directory
 *
 * Change log
 * ----------
 * 2026-03-14
 * - Restored media sync into `public/video-shots` for Remotion bundle access
 * - Kept `config.base` as the filesystem source of truth for input media
 * - Added structured module header and industrial-style function sections
 *
 * 2026-03-18
 * - Fixed selected-project runtime resolution for final video rendering
 * - Stopped loading `video.config.json` from the root `video-shots` directory
 *
 * 2026-03-20
 * - Added explicit public render URL resolution for frontend preview handoff
 * - Emitted one machine-readable render result line after successful rendering
 * - Kept output file generation project-based inside `public/renders`
 * - Restored preferred-project resolution in `main()` after preview URL handoff refactor
 *
 * 2026-03-21
 * - Loaded analyzed beat metadata during final rendering
 * - Applied beat-sync timing through the composition mapper before bundling
 */
/* ========================================================================== */

import path from "node:path";
import fs from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {bundle} from "@remotion/bundler";
import {selectComposition, renderMedia} from "@remotion/renderer";
import {loadAppRuntimeContext} from "../../config/app-config.js";
import {readJsonFile, readJsonFileOrFallback} from "../server/json-files.js";
import {copyFile, ensureDir, removeDirContents} from "../server/video-files.js";
import {mapVideoConfigToComposition} from "./video-config-mapper.js";
import {buildDefaultProjectTitle} from "./video-config-shape.js";

/* -------------------------------------------------------------------------- */
/* Paths                                                                      */
/* -------------------------------------------------------------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "../..");

const PATHS = {
  configFile: path.join(appRoot, "config", "config.json"),
  remotionEntry: path.join(appRoot, "remotion", "entry.jsx"),
  publicDir: path.join(appRoot, "public"),
  publicVideoShotsDir: path.join(appRoot, "public", "video-shots"),
  rendersDir: path.join(appRoot, "public", "renders"),
  renderLogFile: path.join(appRoot, "lib", "server", "render.log"),
};

//TODO:Logmuster so wiederverwenden

/* -------------------------------------------------------------------------- */
/* Logging                                                         */
/* -------------------------------------------------------------------------- */
import fsSync from "node:fs";

/**
 * Writes one log line into server/render.log
 *
 * @param {string} message
 */
function writeLogLine(message) {
  try {
    const line = `${new Date().toISOString()} ${message}\n`;
    fsSync.appendFileSync(PATHS.renderLogFile, line, "utf8");
  } catch (err) {
    // bewusst still – Logging darf Rendering nicht crashen
  }
}


/**
 * Writes one status line to stdout for the GUI and server log.
 *
 * @param {string} message
 */
function logStatus(message) {
  writeLogLine(`[render-status] ${message}`);
}

/* -------------------------------------------------------------------------- */
/* Config helpers                                                             */
/* -------------------------------------------------------------------------- */


/**
 * Sanitizes one dynamic file name segment for filesystem usage.
 *
 * @param {string} value
 * @returns {string}
 */
function sanitizeFileNameSegment(value = "") {
  return String(value)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "") || "untitled";
}


/**
 * Resolves the effective project title from the loaded config or directory.
 *
 * @param {any} videoConfig
 * @param {string} videoShotsDir
 * @returns {string}
 */
function resolveProjectTitle(videoConfig, videoShotsDir) {
  const configuredTitle = String(videoConfig?.project?.title || "").trim();
  return configuredTitle || buildDefaultProjectTitle(videoShotsDir);
}

/**
 * Builds one stable render timestamp in the format YYYYMMDD-HHmmss.
 *
 * @returns {string}
 */
function buildRenderTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");

  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * Resolves the final output video path for one render job.
 *
 * Format:
 * - <project-title>_<timestamp>.mp4
 *
 * @param {any} videoConfig
 * @param {string} videoShotsDir
 * @returns {string}
 */
function resolveOutputVideoPath(videoConfig, videoShotsDir) {
  const projectTitle = resolveProjectTitle(videoConfig, videoShotsDir);
  const safeProjectTitle = sanitizeFileNameSegment(projectTitle);
  const timestamp = buildRenderTimestamp();

  return path.join(PATHS.rendersDir, `${safeProjectTitle}_${timestamp}.mp4`);
}

/**
 * Resolves one public browser URL for a rendered file inside `public`.
 *
 * @param {string} outputVideoPath
 * @returns {string}
 */
function resolvePublicRenderUrl(outputVideoPath) {
  const relativePath = path.relative(PATHS.publicDir, outputVideoPath);
  const normalizedPath = relativePath.split(path.sep).join("/");
  return `/${normalizedPath}`;
}

/**
 * Validates the loaded render config and fails fast on missing or empty input.
 *
 * @param {any} rawConfig
 * @param {string} videoConfigPath
 * @returns {any}
 */
function validateRenderVideoConfig(rawConfig, videoConfigPath) {
  if (
    !rawConfig ||
    typeof rawConfig !== "object" ||
    !rawConfig.project ||
    !Array.isArray(rawConfig.shots) ||
    rawConfig.shots.length === 0
  ) {
    throw new Error(`Invalid or empty video config: ${videoConfigPath}`);
  }
  return rawConfig;
}

/**
 * Builds the absolute beat-data file path for one project directory.
 *
 * @param {string} videoShotsDir
 * @returns {string}
 */
function resolveBeatDataPath(videoShotsDir) {
  return path.join(videoShotsDir, "music-beats.json");
}

/**
 * Loads analyzed beat metadata for rendering.
 *
 * Returns an empty object when the beat file is missing so rendering keeps the
 * legacy fallback timing behavior.
 *
 * @param {string} videoShotsDir
 * @returns {Promise<any>}
 */
async function loadBeatData(videoShotsDir) {
  return readJsonFileOrFallback(resolveBeatDataPath(videoShotsDir), {});
}

function buildRenderInputProps(mappedComposition) {
  return {
    project: mappedComposition?.composition || {},
    shots: Array.isArray(mappedComposition?.shots) ? mappedComposition.shots : [],
  };
}

function buildRenderConfigLogPayload(videoConfigPath, rawVideoConfig, inputProps) {
  return {
    videoConfigPath,
    targetDurationSeconds: rawVideoConfig?.project?.targetDurationSeconds,
    totalDurationSeconds: inputProps?.project?.totalDurationSeconds,
    totalFrames: inputProps?.project?.totalFrames,
    beatSyncEnabled: inputProps?.project?.beatSyncEnabled,
    beatSyncStep: inputProps?.project?.beatSyncStep,
    shotCount: inputProps?.shots?.length || 0,
    shotDurations: (inputProps?.shots || []).map((shot) => ({
      id: shot.id,
      src: shot.src,
      resolvedDurationSeconds: shot.resolvedDurationSeconds,
      durationFrames: shot.durationFrames,
    })),
  };
}

function buildRenderProjectLogPayload(inputProps) {
  return {
    title: inputProps?.project?.title,
    subtitle: inputProps?.project?.subtitle,
    introText: inputProps?.project?.introText,
    introDurationSeconds: inputProps?.project?.introDurationSeconds,
    outroText: inputProps?.project?.outroText,
    outroDurationSeconds: inputProps?.project?.outroDurationSeconds,
    targetDurationSeconds: inputProps?.project?.targetDurationSeconds,
    totalDurationSeconds: inputProps?.project?.totalDurationSeconds,
    totalFrames: inputProps?.project?.totalFrames,
  };
}

function buildRenderInputLogPayload(inputProps) {
  return {
    shotCount: inputProps?.shots?.length || 0,
    targetDurationSeconds: inputProps?.project?.targetDurationSeconds,
    totalDurationSeconds: inputProps?.project?.totalDurationSeconds,
    totalFrames: inputProps?.project?.totalFrames,
    beatSyncEnabled: inputProps?.project?.beatSyncEnabled,
    beatSyncStep: inputProps?.project?.beatSyncStep,
    durations: (inputProps?.shots || []).map((shot) => ({
      id: shot.id,
      src: shot.src,
      resolvedDurationSeconds: shot.resolvedDurationSeconds,
      durationFrames: shot.durationFrames,
    })),
  };
}


/**
 * Returns whether a file should be copied into the public Remotion media
 * mirror.
 *
 * @param {string} fileName
 * @returns {boolean}
 */
function isRenderableMediaFile(fileName) {
  return !fileName.startsWith(".") && fileName !== "video.config.json";
}

/* -------------------------------------------------------------------------- */
/* Media synchronization                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors all render-relevant media files from the configured `video-shots`
 * directory into `app/public/video-shots` so Remotion can access them through
 * the bundle context.
 *
 * @param {string} sourceDir
 * @returns {Promise<void>}
 */
async function syncMediaToPublic(sourceDir) {
  logStatus("Bereite public/video-shots vor ...");
  await removeDirContents(PATHS.publicVideoShotsDir);

  logStatus("Synchronisiere Medien in den Public-Ordner ...");
  const entries = await fs.readdir(sourceDir, {withFileTypes: true});

  const filesToCopy = entries
    .filter((entry) => entry.isFile() && isRenderableMediaFile(entry.name))
    .map((entry) => path.join(sourceDir, entry.name));

  await Promise.all(
    filesToCopy.map((sourcePath) =>
      copyFile(sourcePath, path.join(PATHS.publicVideoShotsDir, path.basename(sourcePath)))
    )
  );
}

/* -------------------------------------------------------------------------- */
/* Input preparation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Loads the selected project render context.
 *
 * @param {string} preferredProjectName
 * @returns {Promise<{
 *   activeProject: string,
 *   videoShotsDir: string,
 *   videoConfigPath: string,
 *   outputVideoPath: string,
 *   publicRenderUrl: string,
 *   beatData: any,
 *   inputProps: any,
 * }>}
 */
async function loadRenderContext(preferredProjectName) {
  logStatus("Lade App-Konfiguration ...");

  const {activeProject, videoShotsDir} = await loadAppRuntimeContext(preferredProjectName);
  const videoConfigPath = path.join(videoShotsDir, "video.config.json");

  logStatus(`Aktives Projekt: ${activeProject}`);
  logStatus(`Video-Shots-Verzeichnis: ${videoShotsDir}`);
  logStatus(`Video-Konfiguration: ${videoConfigPath}`);

  logStatus("Lade Video-Konfiguration ...");
  const rawVideoConfig = await readJsonFile(videoConfigPath);
  console.log("[render-config-path]", videoConfigPath);
  console.log("[render-config]", {
    title: rawVideoConfig?.project?.title,
    shotCount: rawVideoConfig?.shots?.length,
  });
  const loadedVideoConfig = validateRenderVideoConfig(rawVideoConfig, videoConfigPath);
  const beatData = await loadBeatData(videoShotsDir);
  const mappedComposition = mapVideoConfigToComposition(loadedVideoConfig, beatData);
  const inputProps = {
    ...buildRenderInputProps(mappedComposition),
    beatData,
  };

  const outputVideoPath = resolveOutputVideoPath(loadedVideoConfig, videoShotsDir);
  const publicRenderUrl = resolvePublicRenderUrl(outputVideoPath);
  logStatus(`Render-Output: ${outputVideoPath}`);
  logStatus(`Render-Preview-URL: ${publicRenderUrl}`);
  logStatus(`Projekt-Titel: ${resolveProjectTitle(loadedVideoConfig, videoShotsDir)}`);
  logStatus(`Shots geladen: ${inputProps.shots.length}`);
  logStatus(`Beat-Sync aktiv: ${inputProps.project?.beatSyncEnabled ? "Ja" : "Nein"}`);
  logStatus(`Zieldauer: ${inputProps.project?.targetDurationSeconds || 0} Sekunden`);
  logStatus(`Effektive Dauer: ${inputProps.project?.totalDurationSeconds || 0} Sekunden`);

  writeLogLine(
    `[render-config] ${JSON.stringify(
      buildRenderConfigLogPayload(videoConfigPath, loadedVideoConfig, inputProps),
    )}`
  );

  await syncMediaToPublic(videoShotsDir);

  logStatus("Input-Props vorbereitet.");
  return {
    activeProject,
    videoShotsDir,
    videoConfigPath,
    outputVideoPath,
    publicRenderUrl,
    beatData,
    inputProps,
  };
}

/* -------------------------------------------------------------------------- */
/* Remotion pipeline                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Creates the Remotion bundle.
 *
 * @returns {Promise<string>}
 */
async function createBundle() {
  logStatus("Erzeuge Remotion-Bundle ...");

  return bundle({
    entryPoint: PATHS.remotionEntry,
    publicDir: PATHS.publicDir,
  });
}

/**
 * Selects the `READMEVideo` composition from the generated bundle.
 *
 * @param {string} bundleLocation
 * @param {any} inputProps
 * @returns {Promise<any>}
 * 
*/
async function selectReadmeComposition(bundleLocation, inputProps) {
  logStatus("Wähle Composition READMEVideo ...");

  if (!Array.isArray(inputProps?.shots) || inputProps.shots.length === 0) {
    throw new Error("Render aborted: no shots available");
  }

  logStatus(`Input-Shots an Remotion: ${inputProps?.shots?.length || 0}`);

  writeLogLine(
    `[render-input] ${JSON.stringify(buildRenderInputLogPayload(inputProps))}`
  );

  writeLogLine(
    `[render-project] ${JSON.stringify(buildRenderProjectLogPayload(inputProps))}`
  );





  return selectComposition({
    serveUrl: bundleLocation,
    id: "READMEVideo",
    inputProps,
  });
}

/**
 * Renders the final video file.
 *
 * @param {string} bundleLocation
 * @param {any} composition
 * @param {any} inputProps
 * @param {string} outputVideoPath
 * @returns {Promise<void>}
 */
async function renderReadmeVideo(bundleLocation, composition, inputProps, outputVideoPath) {
  logStatus("Starte Videorendering ...");

  if (!Array.isArray(inputProps?.shots) || inputProps.shots.length === 0) {
    throw new Error("Render aborted: no shots available");
  }

  await ensureDir(path.dirname(outputVideoPath));

  //TODO:Warum ist codec hier hardgecoded

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputVideoPath,
    inputProps,
    onProgress: ({progress}) => {
      const percent = Math.round(progress * 100);
      //console.log(`[render-progress] ${percent}%`);
    },
  });

  logStatus("Videorendering abgeschlossen.");
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Returns the preferred project name from the CLI arguments.
 *
 * Supports `--project=<name>` when the script is launched from the render
 * runner.
 *
 * @returns {string}
 */
function resolvePreferredProjectName() {
  const projectArg = process.argv
    .slice(2)
    .find((arg) => typeof arg === "string" && arg.startsWith("--project="));

  return projectArg ? projectArg.slice("--project=".length).trim() : "";
}

/**
 * Executes the complete render workflow.
 *
 * @returns {Promise<void>}
 */
async function main() {
  logStatus("Rendering initialisiert.");

  // fsSync.mkdirSync(path.dirname(PATHS.renderLogFile), {recursive: true}); // removed unnecessary directory creation
  fsSync.writeFileSync(PATHS.renderLogFile, "", "utf8");

  const preferredProjectName = resolvePreferredProjectName();
  const {inputProps, outputVideoPath, publicRenderUrl} = await loadRenderContext(preferredProjectName);
  const bundleLocation = await createBundle();
  const composition = await selectReadmeComposition(bundleLocation, inputProps);
  logStatus(`Composition-Dauer: ${composition.durationInFrames} Frames`);

  await renderReadmeVideo(bundleLocation, composition, inputProps, outputVideoPath);

  logStatus("Ausgabedatei geschrieben.");
  writeLogLine(`Video rendered to ${outputVideoPath}`);
  writeLogLine(
    `[render-result] ${JSON.stringify({
      outputVideoPath,
      publicRenderUrl,
    })}`
  );
  logStatus("Rendering vollständig beendet.");
}

try {
  await main();
} catch (error) {
  console.error(`[render-error] ${error?.stack || error?.message || error}`);
  process.exit(1);
}
