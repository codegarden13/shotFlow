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
 * - Resolve the configured `video-shots` directory
 * - Load `video.config.json`
 * - Synchronize render media into `public/video-shots`
 * - Bundle the Remotion entry
 * - Select the `READMEVideo` composition
 * - Render the final MP4 into `public/demo.mp4`
 *
 * Runtime model
 * -------------
 * The Remotion renderer does not fetch media from the app's Express server.
 * During rendering, media must be available inside the Remotion bundle/public
 * context. Therefore, all referenced media files are copied from
 * `${config.base}` into `app/public/video-shots` before bundling.
 *
 * Source of truth
 * ---------------
 * `config/config.json` is the single source of truth for:
 * - `base` -> absolute path to the real `video-shots` directory
 *
 * Change log
 * ----------
 * 2026-03-14
 * - Restored media sync into `public/video-shots` for Remotion bundle access
 * - Kept `config.base` as the filesystem source of truth for input media
 * - Moved final output video back to `public/demo.mp4`
 * - Added structured module header and industrial-style function sections
 */
/* ========================================================================== */

import path from "node:path";
import fs from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {bundle} from "@remotion/bundler";
import {selectComposition, renderMedia} from "@remotion/renderer";

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
  outputVideo: path.join(appRoot, "public", "demo.mp4"),
};

/* -------------------------------------------------------------------------- */
/* File helpers                                                               */
/* -------------------------------------------------------------------------- */


/**
 * Reads and parses one JSON file.
 *
 * @param {string} filePath
 * @returns {Promise<any>}
 */
async function readJsonFile(filePath) {
  const fileContents = await fs.readFile(filePath, "utf8");
  return JSON.parse(fileContents);
}

/**
 * Reads one JSON file, but returns a fallback value when the file is missing.
 *
 * @param {string} filePath
 * @param {any} fallbackValue
 * @returns {Promise<any>}
 */
async function readJsonFileOrFallback(filePath, fallbackValue) {
  try {
    return await readJsonFile(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallbackValue;
    }

    throw error;
  }
}

/**
 * Ensures that one directory exists.
 *
 * @param {string} dirPath
 * @returns {Promise<void>}
 */
async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, {recursive: true});
}

/**
 * Removes all existing files from one directory.
 * This keeps the public media mirror deterministic between renders.
 *
 * @param {string} dirPath
 * @returns {Promise<void>}
 */
async function emptyDirectory(dirPath) {
  await ensureDirectory(dirPath);
  const entries = await fs.readdir(dirPath, {withFileTypes: true});

  await Promise.all(
    entries.map((entry) =>
      fs.rm(path.join(dirPath, entry.name), {recursive: true, force: true})
    )
  );
}

/**
 * Copies one file into the target directory and returns the copied file name.
 *
 * @param {string} sourcePath
 * @param {string} targetDir
 * @returns {Promise<string>}
 */
async function copyFileToDirectory(sourcePath, targetDir) {
  const fileName = path.basename(sourcePath);
  const targetPath = path.join(targetDir, fileName);

  await fs.copyFile(sourcePath, targetPath);
  return fileName;
}

/**
 * Ensures that the parent directory for one file path exists.
 *
 * @param {string} filePath
 * @returns {Promise<void>}
 */
async function ensureParentDirectory(filePath) {
  await ensureDirectory(path.dirname(filePath));
}

/**
 * Writes one status line to stdout for the GUI and server log.
 *
 * @param {string} message
 */
function logStatus(message) {
  console.log(`[render-status] ${message}`);
}

/* -------------------------------------------------------------------------- */
/* Config helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Removes a trailing slash from one path-like string.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeBasePath(value = "") {
  return String(value).replace(/\/$/, "");
}

/**
 * Resolves the configured `video-shots` directory.
 *
 * @param {string} basePath
 * @returns {string}
 */
function resolveVideoShotsDir(basePath) {
  if (!basePath) {
    throw new Error('config.json is missing required field "base".');
  }

  if (!path.isAbsolute(basePath)) {
    throw new Error(
      `config.base must be an absolute local filesystem path. Received: ${basePath}`
    );
  }

  return basePath;
}

/**
 * Resolves the path to `video.config.json` inside the configured shots dir.
 *
 * @param {string} basePath
 * @returns {string}
 */
function resolveVideoConfigPath(basePath) {
  const videoShotsDir = resolveVideoShotsDir(basePath);
  return path.join(videoShotsDir, "video.config.json");
}

/**
 * Resolves the final output video path.
 *
 * @returns {string}
 */
function resolveOutputVideoPath() {
  return PATHS.outputVideo;
}

/**
 * Validates and normalizes the loaded video configuration.
 *
 * @param {any} videoConfig
 * @returns {any}
 */
function normalizeVideoConfig(videoConfig = {}) {
  const normalized = {
    ...videoConfig,
    shots: Array.isArray(videoConfig?.shots) ? videoConfig.shots : [],
  };

  return normalized;
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
  await emptyDirectory(PATHS.publicVideoShotsDir);

  logStatus("Synchronisiere Medien in den Public-Ordner ...");
  const entries = await fs.readdir(sourceDir, {withFileTypes: true});

  const filesToCopy = entries
    .filter((entry) => entry.isFile() && isRenderableMediaFile(entry.name))
    .map((entry) => path.join(sourceDir, entry.name));

  await Promise.all(
    filesToCopy.map((sourcePath) => copyFileToDirectory(sourcePath, PATHS.publicVideoShotsDir))
  );
}

/* -------------------------------------------------------------------------- */
/* Input preparation                                                          */
/* -------------------------------------------------------------------------- */

async function loadRenderContext() {
  logStatus("Lade App-Konfiguration ...");
  const appConfig = await readJsonFile(PATHS.configFile);
  const basePath = normalizeBasePath(appConfig.base || "");
  const videoShotsDir = resolveVideoShotsDir(basePath);
  const videoConfigPath = resolveVideoConfigPath(basePath);
  const outputVideoPath = resolveOutputVideoPath();

  logStatus(`Video-Shots-Verzeichnis: ${videoShotsDir}`);
  logStatus(`Video-Konfiguration: ${videoConfigPath}`);
  logStatus(`Render-Output: ${outputVideoPath}`);

  logStatus("Lade Video-Konfiguration ...");
  const videoConfig = normalizeVideoConfig(
    await readJsonFileOrFallback(videoConfigPath, {shots: []})
  );

  logStatus(`Shots geladen: ${videoConfig.shots.length}`);

  await syncMediaToPublic(videoShotsDir);

  logStatus("Input-Props vorbereitet.");
  return {
    inputProps: {
      ...videoConfig,
    },
    outputVideoPath,
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
 */
async function selectReadmeComposition(bundleLocation, inputProps) {
  logStatus("Wähle Composition READMEVideo ...");
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

  await ensureParentDirectory(outputVideoPath);

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputVideoPath,
    inputProps,
    onProgress: ({progress}) => {
      const percent = Math.round(progress * 100);
      console.log(`[render-progress] ${percent}%`);
    },
  });

  logStatus("Videorendering abgeschlossen.");
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Executes the complete render workflow.
 *
 * @returns {Promise<void>}
 */
async function main() {
  logStatus("Rendering initialisiert.");

  const {inputProps, outputVideoPath} = await loadRenderContext();
  const bundleLocation = await createBundle();
  const composition = await selectReadmeComposition(bundleLocation, inputProps);
  logStatus(`Composition-Dauer: ${composition.durationInFrames} Frames`);

  await renderReadmeVideo(bundleLocation, composition, inputProps, outputVideoPath);

  logStatus("Ausgabedatei geschrieben.");
  console.log(`Video rendered to ${outputVideoPath}`);
  logStatus("Rendering vollständig beendet.");
}

try {
  await main();
} catch (error) {
  console.error(`[render-error] ${error?.stack || error?.message || error}`);
  process.exit(1);
}
