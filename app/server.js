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
 * - Resolve the configured `video-shots` root and selected project directory
 * - Merge configured and unassigned image assets for the GUI
 * - Persist shot edits back to the selected project's `video.config.json`
 * - Spawn local render scripts and return their output to the frontend
 *
 * Source of truth
 * ---------------
 * `config/config.json` is the single source of truth for:
 * - `base` -> absolute path to the real `video-shots` root directory
 * - `port` -> optional default server port
 *
 * Change log
 * ----------
 * 2026-03-14
 * - Refactored runtime path resolution to consistently use app config
 * - Added merged asset loading for configured and unassigned images
 * - Standardized async JSON route handling with shared wrappers
 * - Kept render and preview execution delegated to child processes
 * - Added audio metadata route with on-demand beat-file generation
 *
 * 2026-03-17
 * - Added project selection routes for the left project dropdown
 * - Added runtime-selected project handling for `/video-shots`
 * - Fixed selected-project propagation to video-config store helpers
 * - Fixed selected-project propagation for audio metadata lookups
 * - Fixed preview-frame requests so they render against the selected project
 * - Fixed final render requests so they render against the selected project
 * - Included selected-project film metadata in `/api/video-config` responses
 * - Removed stale unused server-side constants/imports and tightened import layout
 *
 * 2026-03-20
 * - Added CSV export helpers for shot timeline and shot configuration reports
 * - Extended `/api/video-config` to return generated CSV artifact URLs
 * - Extended `/api/render` to forward render artifact URLs parsed from renderer stdout
 *
 * 2026-03-21
 * - Extended `/api/audio-metadata` to include project beat-sync config in the UI payload
 */
/* ========================================================================== */

import express from "express";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {
  createAudioMetadataResponse,
  getAudioMetadata,
} from "./lib/video/get-audio-metadata.js";
import {ensureMusicBeatsFile} from "./lib/video/ensure-music-beats.js";
import {
  loadMergedShots,
  saveVideoConfig,
  loadVideoConfigContext,
  saveProjectConfig,
  saveShotConfig,
} from "./lib/video/video-config-store.js";
import {
  runRenderProcess,
  runPreviewFrameProcess,
} from "./lib/video/render-runner.js";
import {
  listProjectDirectories,
  loadAppConfig,
  loadAppRuntimeContext,
  resolveRuntimePort,
} from "./config/app-config.js";
import {resetDevLog, writeDevLog} from "./lib/server/dev-log.js";
import {
  createAsyncJsonHandler,
  createJsonErrorResponse,
  toErrorMessage,
} from "./lib/server/http-utils.js";

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
  csvReportsDir: path.join(__dirname, "public", "reports"),
  renderScript: path.join(__dirname, "lib", "video", "render-video.js"),
  previewFrameScript: path.join(__dirname, "lib", "video", "render-preview-frame.js"),
};

const DEFAULT_PROJECT_NAME = "Project-test";
let activeProjectName = DEFAULT_PROJECT_NAME;

/* -------------------------------------------------------------------------- */
/* App bootstrap                                                              */
/* -------------------------------------------------------------------------- */

const app = express();

/**
 * Returns the runtime context for the currently selected project for the GUI.
 *
 * @returns {Promise<{
 *   appConfig: any,
 *   basePath: string,
 *   activeProject: string,
 *   videoShotsDir: string,
 *   availableProjects: string[],
 * }>}
 */
async function loadSelectedRuntimeContext() {
  return loadAppRuntimeContext(activeProjectName);
}

/**
 * Sanitizes one dynamic file name segment for filesystem usage.
 *
 * @param {string} value
 * @returns {string}
 */
function sanitizeFilePart(value = "") {
  return String(value)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "") || "untitled";
}

/**
 * Escapes one CSV cell value.
 *
 * @param {any} value
 * @returns {string}
 */
function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Serializes plain row objects to CSV text.
 *
 * @param {Array<Object>} rows
 * @returns {string}
 */
function rowsToCsv(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];

  rows.forEach((row) => {
    lines.push(headers.map((header) => csvEscape(row?.[header])).join(","));
  });

  return `${lines.join("\n")}\n`;
}

/**
 * Resolves the effective FPS from one loaded video config.
 *
 * @param {any} videoConfig
 * @returns {number}
 */
function resolveConfigFps(videoConfig) {
  return Number(videoConfig?.project?.fps ?? 30) || 30;
}

/**
 * Resolves one normalized shot duration in seconds.
 *
 * @param {any} shot
 * @returns {number}
 */
function resolveShotDurationSeconds(shot) {
  return Number(shot?.durationSeconds ?? shot?.duration ?? 3) || 3;
}

/**
 * Builds timeline CSV rows from the selected project's configured shots.
 *
 * @param {any} videoConfig
 * @returns {Array<Object>}
 */
function buildShotTimelineRows(videoConfig = {}) {
  const shots = Array.isArray(videoConfig?.shots) ? videoConfig.shots : [];
  const fps = resolveConfigFps(videoConfig);
  const introFrames = 60;
  let runningFrame = introFrames;

  return shots.map((shot, index) => {
    const durationSeconds = resolveShotDurationSeconds(shot);
    const durationFrames = Math.round(durationSeconds * fps);
    const startFrame = runningFrame;
    const endFrame = startFrame + durationFrames;

    runningFrame = endFrame;

    return {
      index: index + 1,
      id: String(shot?.id || `shot-${index + 1}`),
      src: String(shot?.src || ""),
      title: String(shot?.title || shot?.headline || ""),
      startFrame,
      startSeconds: Number((startFrame / fps).toFixed(2)),
      durationFrames,
      durationSeconds,
      endFrame,
      endSeconds: Number((endFrame / fps).toFixed(2)),
      fps,
    };
  });
}

/**
 * Builds configuration CSV rows from the selected project's configured shots.
 *
 * @param {any} videoConfig
 * @returns {Array<Object>}
 */
function buildShotConfigRows(videoConfig = {}) {
  const shots = Array.isArray(videoConfig?.shots) ? videoConfig.shots : [];

  return shots.map((shot, index) => ({
    index: index + 1,
    id: String(shot?.id || `shot-${index + 1}`),
    src: String(shot?.src || ""),
    title: String(shot?.title || ""),
    headline: String(shot?.headline || ""),
    caption: String(shot?.caption || ""),
    duration: Number(shot?.duration ?? shot?.durationSeconds ?? 3),
    durationSeconds: Number(shot?.durationSeconds ?? shot?.duration ?? 3),
    transition: String(shot?.transition || ""),
    zoom: Number(shot?.zoom ?? 1),
    pan: String(shot?.pan || "center"),
    assigned: shot?.assigned === false ? false : true,
  }));
}

/**
 * Writes two stable CSV artifacts for the loaded video config.
 *
 * @param {string} activeProject
 * @param {any} videoConfig
 * @returns {Promise<{
 *   timelineCsvUrl: string,
 *   timelineCsvPath: string,
 *   shotConfigCsvUrl: string,
 *   shotConfigCsvPath: string,
 * }>}
 */
async function writeVideoConfigCsvArtifacts(activeProject, videoConfig) {
  await fs.promises.mkdir(PATHS.csvReportsDir, {recursive: true});

  const safeProjectName = sanitizeFilePart(
    activeProject || videoConfig?.project?.title || "project"
  );
  const timelineFileName = `${safeProjectName}_shot-timeline.csv`;
  const shotConfigFileName = `${safeProjectName}_shot-config.csv`;
  const timelineCsvPath = path.join(PATHS.csvReportsDir, timelineFileName);
  const shotConfigCsvPath = path.join(PATHS.csvReportsDir, shotConfigFileName);

  await fs.promises.writeFile(
    timelineCsvPath,
    rowsToCsv(buildShotTimelineRows(videoConfig)),
    "utf8"
  );
  await fs.promises.writeFile(
    shotConfigCsvPath,
    rowsToCsv(buildShotConfigRows(videoConfig)),
    "utf8"
  );

  return {
    timelineCsvUrl: `/reports/${timelineFileName}`,
    timelineCsvPath,
    shotConfigCsvUrl: `/reports/${shotConfigFileName}`,
    shotConfigCsvPath,
  };
}

/**
 * Parses one machine-readable render result block from renderer stdout.
 *
 * @param {string} stdout
 * @returns {any | null}
 */
function extractRenderResultFromStdout(stdout = "") {
  const match = String(stdout || "").match(/\[render-result\]\s+(\{.*\})/);
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

app.use(express.json({limit: RUNTIME.jsonBodyLimit}));
app.use(express.static(PATHS.publicDir));
app.use("/video-shots", async (req, res, next) => {
  try {
    const {videoShotsDir} = await loadSelectedRuntimeContext();
    return express.static(videoShotsDir)(req, res, next);
  } catch (error) {
    return createJsonErrorResponse(res, error);
  }
});

/**
 * Returns all available `Project-*` folders for the project dropdown.
 */
const getProjects = createAsyncJsonHandler(async () => {
  const appConfig = await loadAppConfig();
  const projects = await listProjectDirectories(appConfig.base || "");
  const runtimeContext = await loadSelectedRuntimeContext();

  return {
    ok: true,
    projects,
    activeProject: runtimeContext.activeProject,
    defaultProject: DEFAULT_PROJECT_NAME,
  };
}, "projects");

/**
 * Selects one project folder as the active runtime project for the GUI.
 * All later asset/config requests should resolve through this selection.
 */
const postSelectProject = createAsyncJsonHandler(async (req) => {
  const requestedProject = String(req.body?.project || "").trim();

  if (!requestedProject) {
    throw new Error('Project selection payload is missing required field "project".');
  }

  const appConfig = await loadAppConfig();
  const projects = await listProjectDirectories(appConfig.base || "");

  if (!projects.includes(requestedProject)) {
    throw new Error(`Unknown project folder: ${requestedProject}`);
  }

  activeProjectName = requestedProject;

  const runtimeContext = await loadSelectedRuntimeContext();

  return {
    ok: true,
    activeProject: runtimeContext.activeProject,
    videoShotsDir: runtimeContext.videoShotsDir,
  };
}, "project-select");

/**
 * Returns normalized audio metadata for the current project.
 * The beat metadata file is generated on demand before reading the final
 * audio metadata payload so transient markers become available to the GUI.
 */
const getAudioMetadataRoute = createAsyncJsonHandler(async () => {
  await ensureMusicBeatsFile(activeProjectName);

  const [data, {videoConfig}] = await Promise.all([
    getAudioMetadata(activeProjectName),
    loadVideoConfigContext(activeProjectName),
  ]);

  return createAudioMetadataResponse({
    ...data,
    beatSyncEnabled: videoConfig?.project?.beatSyncEnabled,
    beatSyncStep: videoConfig?.project?.beatSyncStep,
  });
}, "audio-metadata");

/**
 * Returns a compact health/debug payload so the GUI can verify server state.
 *
 * @param {import("express").Request} _req
 * @param {import("express").Response} res
 */
async function getHealth(_req, res) {
  try {
    const {appConfig, activeProject, videoShotsDir} = await loadSelectedRuntimeContext();
    const runtimePort = resolveRuntimePort(appConfig);

    res.json({
      ok: true,
      port: runtimePort,
      publicDir: PATHS.publicDir,
      videoShotsDir,
      activeProject,
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
 * Returns all visible shot assets plus the selected project's film metadata.
 */
const getVideoConfig = createAsyncJsonHandler(async () => {
  const [shots, {videoConfig, activeProject, videoShotsDir, videoConfigPath}] = await Promise.all([
    loadMergedShots(activeProjectName),
    loadVideoConfigContext(activeProjectName),
  ]);
  const csvArtifacts = await writeVideoConfigCsvArtifacts(activeProject, videoConfig);

  return {
    ok: true,
    activeProject,
    videoShotsDir,
    videoConfigPath,
    projectConfig: videoConfig,
    shots,
    csvArtifacts,
  };
}, "video-config");

/**
 * Saves one shot configuration entry to `video.config.json`.
 */
const postVideoConfigShot = createAsyncJsonHandler(async (req) => {
  const shot = await saveShotConfig(req.body || {}, activeProjectName);

  return {
    ok: true,
    shot,
  };
}, "video-config-shot");

/**
 * Saves project-level video metadata such as title, subtitle, layer color and outro text.
 */
const postVideoConfigProject = createAsyncJsonHandler(async (req) => {
  const projectConfig = await saveProjectConfig(req.body || {}, activeProjectName);

  return {
    ok: true,
    projectConfig,
  };
}, "video-config-project");

/**
 * Saves one complete `video.config.json` payload.
 */
const postVideoConfig = createAsyncJsonHandler(async (req) => {
  const videoConfig = await saveVideoConfig(req.body || {}, activeProjectName);

  return {
    ok: true,
    videoConfig,
  };
}, "video-config-save");

/**
 * POST /api/render
 * Starts a full video render and returns the collected process output.
 */
const postRender = createAsyncJsonHandler(async (req) => {
  const result = await runRenderProcess({
    ...(req.body || {}),
    project: activeProjectName,
  });
  const renderArtifacts = extractRenderResultFromStdout(result?.stdout || "");

  return {
    ...result,
    publicUrl: renderArtifacts?.publicRenderUrl || "",
    csvUrl: renderArtifacts?.timelineCsvUrl || "",
    renderArtifacts,
  };
}, "render");

/**
 * POST /api/preview-frame
 * Starts one exact still-frame render and returns parsed preview metadata.
 */
const postPreviewFrame = createAsyncJsonHandler(async (req) => {
  return runPreviewFrameProcess({
    ...(req.body || {}),
    project: activeProjectName,
  });
}, "preview-frame");

/* -------------------------------------------------------------------------- */
/* Routes                                                                     */
/* -------------------------------------------------------------------------- */

app.get("/api/projects", getProjects);
app.post("/api/project/select", postSelectProject);

app.get("/api/health", getHealth);

app.get("/api/video-config", getVideoConfig);
app.post("/api/video-config", postVideoConfig);
app.post("/api/video-config/project", postVideoConfigProject);
app.post("/api/video-config/shot", postVideoConfigShot);

app.get("/api/audio-metadata", getAudioMetadataRoute);

app.post("/api/render", postRender);
app.post("/api/preview-frame", postPreviewFrame);

/**
 * Resets the public dev log file so each browser refresh starts with a clean
 * log timeline.
 */
const postResetDevLog = createAsyncJsonHandler(async () => {
  await resetDevLog();
  await writeDevLog("log reset by browser refresh");

  return {ok: true};
}, "dev-log-reset");

app.post("/api/dev-log/reset", postResetDevLog);

/* -------------------------------------------------------------------------- */
/* Server start                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Starts the local GUI/API server.
 */
(async function startServer() {
  try {
    const {appConfig} = await loadSelectedRuntimeContext();
    const port = resolveRuntimePort(appConfig);

    app.listen(port, () => {
      console.log(`Bundle rebuildet - Server läuft auf http://localhost:${port}`);

      writeDevLog(`Server läuft auf http://localhost:${port}`).catch(console.error);
    });
  } catch (error) {
    const message = `Serverstart fehlgeschlagen: ${toErrorMessage(error)}`;

    console.error(message);

    try {
      await writeDevLog(message);
    } catch (logError) {
      console.error("Logging failed:", logError);
    }

    process.exit(1);
  }
})();
