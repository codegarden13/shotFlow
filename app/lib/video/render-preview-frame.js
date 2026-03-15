

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderStill } from "@remotion/renderer";

/* -------------------------------------------------------------------------- */
/* Paths                                                                      */
/* -------------------------------------------------------------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "../..");

const PATHS = {
  configFile: path.join(appRoot, "config", "config.json"),
  remotionEntry: path.join(appRoot, "remotion", "entry.jsx"),
  publicShotsDir: path.join(appRoot, "public", "assets", "img", "video-shots"),
  previewsDir: path.join(appRoot, "public", "previews"),
};

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const COMPOSITION_ID = "READMEVideo";
const DEFAULT_PREVIEW_NAME = "current-frame.png";
const DEFAULT_FRAME = 0;

/* -------------------------------------------------------------------------- */
/* File helpers                                                               */
/* -------------------------------------------------------------------------- */

async function readJsonFile(filePath) {
  const fileContents = await fs.readFile(filePath, "utf8");
  return JSON.parse(fileContents);
}

async function ensureDirectory(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

/* -------------------------------------------------------------------------- */
/* CLI argument helpers                                                       */
/* -------------------------------------------------------------------------- */

function parseCliArgs(argv) {
  const args = {};

  for (const rawArg of argv) {
    if (!rawArg.startsWith("--")) continue;

    const trimmed = rawArg.slice(2);
    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      args[trimmed] = true;
      continue;
    }

    const key = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1);
    args[key] = value;
  }

  return args;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;

  return fallback;
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeFileSegment(value, fallback = "preview") {
  const sanitized = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || fallback;
}

function buildPreviewFileName(options) {
  if (options.outputName) {
    const sanitizedName = sanitizeFileSegment(options.outputName, "current-frame");
    return sanitizedName.endsWith(".png") ? sanitizedName : `${sanitizedName}.png`;
  }

  const framePart = `frame-${options.frame}`;
  const formatPart = sanitizeFileSegment(options.format, "standard");
  const lookPart = sanitizeFileSegment(options.look, "default");

  return `${framePart}-${formatPart}-${lookPart}.png`;
}

function resolvePreviewOptions() {
  const cliArgs = parseCliArgs(process.argv.slice(2));

  return {
    frame: Math.max(0, normalizeInteger(cliArgs.frame, DEFAULT_FRAME)),
    format: String(cliArgs.format || "standard"),
    look: String(cliArgs.look || "default"),
    draft: normalizeBoolean(cliArgs.draft, false),
    outputName: cliArgs.outputName ? String(cliArgs.outputName) : DEFAULT_PREVIEW_NAME,
  };
}

/* -------------------------------------------------------------------------- */
/* Config helpers                                                             */
/* -------------------------------------------------------------------------- */

function normalizeBasePath(value = "") {
  return String(value).replace(/\/$/, "");
}

function resolveVideoConfigPath(basePath) {
  if (!basePath) {
    throw new Error('config.json is missing required field "base".');
  }

  if (!path.isAbsolute(basePath)) {
    throw new Error(
      `config.base must be an absolute local filesystem path. Received: ${basePath}`
    );
  }

  return path.join(basePath, "video-shots", "video.config.json");
}

function validateShotSource(src) {
  if (typeof src !== "string" || !src.trim()) {
    throw new Error(`Each shot must define a non-empty string "src". Received: ${src}`);
  }
}

function resolveShotSourcePath(configDir, src) {
  validateShotSource(src);

  if (path.isAbsolute(src)) {
    return src;
  }

  return path.join(configDir, src);
}

function toPublicShotSrc(fileName) {
  return `assets/img/video-shots/${fileName}`;
}

/* -------------------------------------------------------------------------- */
/* Shot preparation                                                           */
/* -------------------------------------------------------------------------- */

async function copyShotToPublic(sourcePath) {
  const fileName = path.basename(sourcePath);
  const targetPath = path.join(PATHS.publicShotsDir, fileName);

  await fs.copyFile(sourcePath, targetPath);

  return toPublicShotSrc(fileName);
}

async function prepareShot(configDir, shot) {
  const sourcePath = resolveShotSourcePath(configDir, shot.src);
  const publicSrc = await copyShotToPublic(sourcePath);

  return {
    ...shot,
    src: publicSrc,
  };
}

async function prepareShots(configDir, shots) {
  if (!Array.isArray(shots)) {
    return [];
  }

  return Promise.all(shots.map((shot) => prepareShot(configDir, shot)));
}

/* -------------------------------------------------------------------------- */
/* Input props                                                                */
/* -------------------------------------------------------------------------- */

async function loadInputProps(previewOptions) {
  const appConfig = await readJsonFile(PATHS.configFile);
  const basePath = normalizeBasePath(appConfig.base || "");
  const videoConfigPath = resolveVideoConfigPath(basePath);
  const videoConfig = await readJsonFile(videoConfigPath);
  const videoConfigDir = path.dirname(videoConfigPath);

  await ensureDirectory(PATHS.publicShotsDir);
  await ensureDirectory(PATHS.previewsDir);

  const preparedShots = await prepareShots(videoConfigDir, videoConfig.shots);

  return {
    ...videoConfig,
    shots: preparedShots,
    preview: {
      frame: previewOptions.frame,
      format: previewOptions.format,
      look: previewOptions.look,
      draft: previewOptions.draft,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Remotion pipeline                                                          */
/* -------------------------------------------------------------------------- */

async function createBundle() {
  return bundle({
    entryPoint: PATHS.remotionEntry,
  });
}

async function selectReadmeComposition(bundleLocation, inputProps) {
  return selectComposition({
    serveUrl: bundleLocation,
    id: COMPOSITION_ID,
    inputProps,
  });
}

async function renderPreviewFrame(bundleLocation, composition, inputProps, previewOptions) {
  const fileName = buildPreviewFileName(previewOptions);
  const outputLocation = path.join(PATHS.previewsDir, fileName);

  await renderStill({
    composition,
    serveUrl: bundleLocation,
    inputProps,
    frame: previewOptions.frame,
    output: outputLocation,
    imageFormat: "png",
  });

  return {
    fileName,
    outputLocation,
    publicUrl: `/previews/${fileName}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
  const previewOptions = resolvePreviewOptions();
  const inputProps = await loadInputProps(previewOptions);
  const bundleLocation = await createBundle();
  const composition = await selectReadmeComposition(bundleLocation, inputProps);
  const result = await renderPreviewFrame(
    bundleLocation,
    composition,
    inputProps,
    previewOptions
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        frame: previewOptions.frame,
        format: previewOptions.format,
        look: previewOptions.look,
        draft: previewOptions.draft,
        fileName: result.fileName,
        outputLocation: result.outputLocation,
        publicUrl: result.publicUrl,
      },
      null,
      2
    )
  );
}

await main();