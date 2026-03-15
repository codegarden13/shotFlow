/* ========================================================================== */
/* server.js                                                                  */
/* ========================================================================== */
/*
 * Purpose
 * -------
 * Local GUI/API server for the Remotion README video workflow.
 *
 * Responsibilities
 * ----------------
 * - Serve the frontend from `public/`
 * - Expose API endpoints for render, preview and config access
 * - Resolve the configured `video-shots` directory from `config/config.json`
 * - Merge configured and unassigned image assets for the GUI
 * - Persist shot edits back to `video.config.json`
 * - Spawn local render scripts and return their output to the frontend
 *
 * Source of truth
 * ---------------
 * `config/config.json` is the single source of truth for:
 * - `base` -> absolute path to the real `video-shots` directory
 * - `port` -> optional default server port
 *
 * Change log
 * ----------
 * 2026-03-14
 * - Refactored runtime path resolution to consistently use app config
 * - Added merged asset loading for configured and unassigned images
 * - Standardized async JSON route handling with shared wrappers
 * - Kept render and preview execution delegated to child processes
 */
/* ========================================================================== */

import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";

import {toPreviewUrl} from "./lib/video/video-paths.js";

/* -------------------------------------------------------------------------- */
/* Paths and runtime constants                                                */
/* -------------------------------------------------------------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RUNTIME = {
  defaultPort: 3005,
  jsonBodyLimit: "1mb",
};

const PATHS = {
  appConfigFile: path.join(__dirname, "config", "config.json"),
  publicDir: path.join(__dirname, "public"),
  renderScript: path.join(__dirname, "lib", "video", "render-video.js"),
  previewFrameScript: path.join(__dirname, "lib", "video", "render-preview-frame.js"),
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const SHOT_DEFAULTS = {
  duration: 90,
  zoom: 1,
  transition: "",
  pan: "center",
  caption: "",
};

/* -------------------------------------------------------------------------- */
/* App bootstrap                                                              */
/* -------------------------------------------------------------------------- */

const app = express();

app.use(express.json({limit: RUNTIME.jsonBodyLimit}));
app.use(express.static(PATHS.publicDir));
app.use("/video-shots", async (req, res, next) => {
  try {
    const {videoShotsDir} = await loadAppRuntimeContext();
    return express.static(videoShotsDir)(req, res, next);
  } catch (error) {
    return createJsonErrorResponse(res, error);
  }
});

/* -------------------------------------------------------------------------- */
/* Generic utility helpers                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Converts an unknown error value into a stable string.
 *
 * @param {unknown} error
 * @param {string} fallback
 * @returns {string}
 */
function toErrorMessage(error, fallback = "Unknown server error") {
  return String(error?.message || error || fallback);
}

/**
 * Sends a standardized JSON error response.
 *
 * @param {import("express").Response} res
 * @param {unknown} error
 * @param {number} statusCode
 */
function createJsonErrorResponse(res, error, statusCode = 500) {
  res.status(statusCode).json({
    ok: false,
    error: toErrorMessage(error),
  });
}

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
 * Writes one JSON file with stable pretty formatting.
 *
 * @param {string} filePath
 * @param {any} value
 * @returns {Promise<void>}
 */
async function writeJsonFile(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * Loads the app-level configuration from `config/config.json`.
 * This is the single source of truth for runtime paths and optional server
 * defaults such as the local port.
 *
 * @returns {Promise<any>}
 */
async function loadAppConfig() {
  return readJsonFile(PATHS.appConfigFile);
}

/**
 * Loads app config and resolves the configured runtime directory context.
 *
 * @returns {Promise<{appConfig: any, basePath: string, videoShotsDir: string}>}
 */
async function loadAppRuntimeContext() {
  const appConfig = await loadAppConfig();
  const basePath = normalizeBasePath(appConfig.base || "");
  const videoShotsDir = resolveVideoShotsDir(basePath);

  return {
    appConfig,
    basePath,
    videoShotsDir,
  };
}

/**
 * Combines stdout and stderr into one user-facing log string.
 *
 * @param {string} stdout
 * @param {string} stderr
 * @param {string} fallback
 * @returns {string}
 */
function buildCombinedOutput(stdout, stderr, fallback = "") {
  return [stdout, stderr].filter(Boolean).join("\n\n") || fallback;
}

/**
 * Tries to parse JSON from child-process stdout.
 *
 * @param {string} stdout
 * @returns {any | null}
 */
function parseJsonFromStdout(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Video-config helpers                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Removes a trailing slash from the configured base path.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeBasePath(value = "") {
  return String(value).replace(/\/$/, "");
}

/**
 * Resolves the absolute shot-media directory from `config.base`.
 * The configured base directory is now the actual `video-shots` folder.
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
 * Resolves the absolute path to `video.config.json` based on `config.base`.
 *
 * @param {string} basePath
 * @returns {string}
 */
function resolveVideoConfigPath(basePath) {
  if (!basePath) {
    throw new Error('config.json is missing required field "base".');
  }

  if (!path.isAbsolute(basePath)) {
    throw new Error(
      `config.base must be an absolute local filesystem path. Received: ${basePath}`
    );
  }

  return path.join(basePath, "video.config.json");
}

/**
 * Resolves the server port from environment variables first and then from the
 * app configuration file. If neither is set, the built-in default is used.
 *
 * @param {any} appConfig
 * @returns {number}
 */
function resolveRuntimePort(appConfig = {}) {
  const envPort = Number(process.env.PORT || "");

  if (Number.isFinite(envPort) && envPort > 0) {
    return envPort;
  }

  const configPort = Number(appConfig.port);

  if (Number.isFinite(configPort) && configPort > 0) {
    return configPort;
  }

  return RUNTIME.defaultPort;
}


/**
 * Returns the normalized file name from one source path.
 *
 * @param {string} src
 * @returns {string}
 */
function getFileNameFromSrc(src = "") {
  return path.basename(String(src || ""));
}

/**
 * Returns whether a directory entry should be treated as an image asset.
 *
 * @param {string} fileName
 * @returns {boolean}
 */
function isImageFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Builds a stable fallback shot id from a file name.
 *
 * @param {string} fileName
 * @returns {string}
 */
function buildFallbackShotId(fileName) {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const slug = baseName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug ? `shot-${slug}` : "shot-unassigned";
}

/**
 * Normalizes one raw shot from `video.config.json` into a stable frontend shape.
 *
 * @param {Record<string, any>} shot
 * @param {number} index
 * @returns {{
 *   id: string,
 *   title: string,
 *   caption: string,
 *   duration: number,
 *   transition: string,
 *   zoom: number,
 *   pan: string,
 *   src: string,
 *   fileName: string,
 *   previewUrl: string,
 *   assigned: boolean,
 * }}
 */
function normalizeConfiguredShot(shot, index) {
  const fileName = getFileNameFromSrc(shot.src);

  return {
    id: shot.id || buildFallbackShotId(fileName || `shot-${index + 1}`),
    title: shot.title || shot.headline || fileName || `Shot ${index + 1}`,
    caption: shot.caption || SHOT_DEFAULTS.caption,
    duration: Number(shot.duration ?? shot.durationInFrames ?? SHOT_DEFAULTS.duration),
    transition: shot.transition || SHOT_DEFAULTS.transition,
    zoom: shot.zoom ?? SHOT_DEFAULTS.zoom,
    pan: shot.pan || SHOT_DEFAULTS.pan,
    src: shot.src || "",
    fileName,
    previewUrl: shot.previewUrl || toPreviewUrl(shot.src),
    assigned: true,
  };
}

/**
 * Builds one unassigned asset entry from a file name in the shots directory.
 *
 * @param {string} fileName
 * @returns {{
 *   id: string,
 *   title: string,
 *   caption: string,
 *   duration: number,
 *   transition: string,
 *   zoom: number,
 *   pan: string,
 *   src: string,
 *   fileName: string,
 *   previewUrl: string,
 *   assigned: boolean,
 * }}
 */
function buildUnassignedShot(fileName) {
  return {
    id: buildFallbackShotId(fileName),
    title: "",
    caption: SHOT_DEFAULTS.caption,
    duration: SHOT_DEFAULTS.duration,
    transition: SHOT_DEFAULTS.transition,
    zoom: SHOT_DEFAULTS.zoom,
    pan: SHOT_DEFAULTS.pan,
    src: fileName,
    fileName,
    previewUrl: toPreviewUrl(fileName),
    assigned: false,
  };
}

/**
 * Returns app config and resolved video-config path information.
 *
 * @returns {Promise<{appConfig: any, basePath: string, videoShotsDir: string, videoConfigPath: string, videoConfig: any}>}
 */
async function loadVideoConfigContext() {
  const {appConfig, basePath, videoShotsDir} = await loadAppRuntimeContext();
  const videoConfigPath = resolveVideoConfigPath(basePath);

  let videoConfig;
  try {
    videoConfig = await readJsonFile(videoConfigPath);
  } catch (error) {
    if (/** @type {any} */ (error)?.code === "ENOENT") {
      videoConfig = {shots: []};
    } else {
      throw error;
    }
  }

  if (!Array.isArray(videoConfig.shots)) {
    videoConfig.shots = [];
  }

  return {
    appConfig,
    basePath,
    videoShotsDir,
    videoConfigPath,
    videoConfig,
  };
}

/**
 * Reads all image file names from the shots directory.
 *
 * @returns {Promise<string[]>}
 */
async function listShotImageFiles() {
  const {videoShotsDir} = await loadVideoConfigContext();
  const entries = await fs.readdir(videoShotsDir, {withFileTypes: true});

  return entries
    .filter((entry) => entry.isFile() && isImageFile(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "de"));
}

/**
 * Loads configured shots from `video.config.json`.
 *
 * @returns {Promise<Array<any>>}
 */
async function loadConfiguredShots() {
  const {videoConfig} = await loadVideoConfigContext();
  return videoConfig.shots.map(normalizeConfiguredShot);
}

/**
 * Loads all visible assets by merging configured shots with all image files
 * from the shot directory. Configured shots keep their order. Unassigned
 * images are appended afterward.
 *
 * @returns {Promise<Array<any>>}
 */
async function loadMergedShots() {
  const [configuredShots, imageFiles] = await Promise.all([
    loadConfiguredShots(),
    listShotImageFiles(),
  ]);

  const configuredByFileName = new Map(
    configuredShots
      .filter((shot) => shot.fileName)
      .map((shot) => [shot.fileName, shot])
  );

  const unassignedShots = imageFiles
    .filter((fileName) => !configuredByFileName.has(fileName))
    .map(buildUnassignedShot);

  return [...configuredShots, ...unassignedShots];
}

/**
 * Saves or updates one shot entry in `video.config.json`.
 * Existing shots are matched by file name.
 *
 * @param {Record<string, any>} input
 * @returns {Promise<any>}
 */
async function saveShotConfig(input) {
  const {videoConfigPath, videoConfig} = await loadVideoConfigContext();
  const fileName = getFileNameFromSrc(input.src);

  if (!fileName) {
    throw new Error('Shot save payload is missing required field "src".');
  }

  const normalizedShot = {
    id: input.id || buildFallbackShotId(fileName),
    src: fileName,
    title: input.title || input.headline || "",
    headline: input.headline || input.title || "",
    caption: input.caption || SHOT_DEFAULTS.caption,
    duration: Number(input.duration ?? SHOT_DEFAULTS.duration),
    transition: input.transition || SHOT_DEFAULTS.transition,
    zoom: input.zoom ?? SHOT_DEFAULTS.zoom,
    pan: input.pan || SHOT_DEFAULTS.pan,
  };

  const existingIndex = videoConfig.shots.findIndex(
    (shot) => getFileNameFromSrc(shot.src) === fileName
  );

  if (existingIndex >= 0) {
    videoConfig.shots[existingIndex] = {
      ...videoConfig.shots[existingIndex],
      ...normalizedShot,
    };
  } else {
    videoConfig.shots.push(normalizedShot);
  }

  await writeJsonFile(videoConfigPath, videoConfig);

  return normalizeConfiguredShot(normalizedShot, 0);
}

/* -------------------------------------------------------------------------- */
/* Child-process helpers                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Collects stdout, stderr and exit code from one spawned child process.
 *
 * @param {import("node:child_process").ChildProcess} childProcess
 * @returns {Promise<{code: number | null, stdout: string, stderr: string}>}
 */
function collectChildOutput(childProcess) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    childProcess.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    childProcess.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    childProcess.on("error", (error) => {
      reject(error);
    });

    childProcess.on("close", (code) => {
      resolve({
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

/**
 * Creates one internal Node process for a local script.
 *
 * @param {string} scriptPath
 * @param {string[]} args
 * @returns {import("node:child_process").ChildProcess}
 */
function createNodeProcess(scriptPath, args = []) {
  return spawn(process.execPath, [scriptPath, ...args], {
    cwd: __dirname,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Converts the preview-frame request body into CLI arguments for
 * `render-preview-frame.js`.
 *
 * @param {Record<string, any>} body
 * @returns {string[]}
 */
function buildPreviewFrameArgs(body = {}) {
  const args = [];

  if (body.frame !== undefined) {
    args.push(`--frame=${body.frame}`);
  }

  if (body.format) {
    args.push(`--format=${body.format}`);
  }

  if (body.look) {
    args.push(`--look=${body.look}`);
  }

  if (body.draft !== undefined) {
    args.push(`--draft=${body.draft}`);
  }

  if (body.outputName) {
    args.push(`--outputName=${body.outputName}`);
  }

  return args;
}

/* -------------------------------------------------------------------------- */
/* Process runners                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Runs one internal script and returns the collected process output.
 *
 * @param {{
 *   scriptPath: string,
 *   args?: string[],
 *   successFallback: string,
 *   failureLabel: string,
 * }} options
 * @returns {Promise<{ok: true, output: string, stdout: string, stderr: string}>}
 */
async function runProcessForTextResult({
  scriptPath,
  args = [],
  successFallback,
  failureLabel,
}) {
  const child = createNodeProcess(scriptPath, args);
  const {code, stdout, stderr} = await collectChildOutput(child);
  const output = buildCombinedOutput(stdout, stderr, successFallback);

  if (code === 0) {
    return {
      ok: true,
      output,
      stdout,
      stderr,
    };
  }

  throw new Error(output || `${failureLabel} with code ${code}`);
}

/**
 * Runs the full video renderer.
 *
 * @returns {Promise<{ok: true, output: string, stdout: string, stderr: string}>}
 */
async function runRenderProcess() {
  return runProcessForTextResult({
    scriptPath: PATHS.renderScript,
    successFallback: "Render erfolgreich beendet.",
    failureLabel: "Render failed",
  });
}

/**
 * Runs the preview-frame renderer and parses the JSON payload from stdout.
 *
 * @param {Record<string, any>} requestBody
 * @returns {Promise<any>}
 */
async function runPreviewFrameProcess(requestBody) {
  const result = await runProcessForTextResult({
    scriptPath: PATHS.previewFrameScript,
    args: buildPreviewFrameArgs(requestBody),
    successFallback: "Preview frame erfolgreich beendet.",
    failureLabel: "Preview frame render failed",
  });

  const parsed = parseJsonFromStdout(result.stdout);

  if (!parsed?.ok) {
    throw new Error(result.output || "Preview frame renderer did not return valid JSON.");
  }

  return {
    ...parsed,
    output: result.output,
  };
}

/* -------------------------------------------------------------------------- */
/* Route handlers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Wraps one async JSON route with uniform success/error behavior.
 *
 * @param {(req: import("express").Request) => Promise<any>} handler
 * @returns {(req: import("express").Request, res: import("express").Response) => Promise<void>}
 */
function createAsyncJsonHandler(handler) {
  return async (req, res) => {
    try {
      const result = await handler(req);
      res.json(result);
    } catch (error) {
      createJsonErrorResponse(res, error);
    }
  };
}

/**
 * Returns a compact health/debug payload so the GUI can verify server state.
 *
 * @param {import("express").Request} _req
 * @param {import("express").Response} res
 */
async function getHealth(_req, res) {
  try {
    const {appConfig, videoShotsDir} = await loadAppRuntimeContext();
    const runtimePort = resolveRuntimePort(appConfig);

    res.json({
      ok: true,
      port: runtimePort,
      publicDir: PATHS.publicDir,
      videoShotsDir,
      renderScript: PATHS.renderScript,
      previewFrameScript: PATHS.previewFrameScript,
      appConfigFile: PATHS.appConfigFile,
      appConfig,
    });
  } catch (error) {
    createJsonErrorResponse(res, error);
  }
}

/**
 * Returns all visible shot assets: configured shots plus unassigned images
 * from the shot directory.
 */
const getVideoConfig = createAsyncJsonHandler(async () => {
  const shots = await loadMergedShots();

  return {
    ok: true,
    shots,
  };
});

/**
 * Saves one shot configuration entry to `video.config.json`.
 */
const postVideoConfigShot = createAsyncJsonHandler(async (req) => {
  const shot = await saveShotConfig(req.body || {});

  return {
    ok: true,
    shot,
  };
});

/**
 * POST /api/render
 * Starts a full video render and returns the collected process output.
 */
const postRender = createAsyncJsonHandler(async () => {
  return runRenderProcess();
});

/**
 * POST /api/preview-frame
 * Starts one exact still-frame render and returns parsed preview metadata.
 */
const postPreviewFrame = createAsyncJsonHandler(async (req) => {
  return runPreviewFrameProcess(req.body);
});

/* -------------------------------------------------------------------------- */
/* Routes                                                                     */
/* -------------------------------------------------------------------------- */

app.get("/api/health", getHealth);
app.get("/api/video-config", getVideoConfig);
app.post("/api/video-config/shot", postVideoConfigShot);
app.post("/api/render", postRender);
app.post("/api/preview-frame", postPreviewFrame);

/* -------------------------------------------------------------------------- */
/* Server start                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Starts the local GUI/API server.
 */
(async function startServer() {
  try {
    const {appConfig} = await loadAppRuntimeContext();
    const port = resolveRuntimePort(appConfig);

    app.listen(port, () => {
      console.log(`Server läuft auf http://localhost:${port}`);
    });
  } catch (error) {
    console.error(`Serverstart fehlgeschlagen: ${toErrorMessage(error)}`);
    process.exit(1);
  }
})();