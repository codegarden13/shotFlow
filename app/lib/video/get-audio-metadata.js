/* ========================================================================== */
/* get-audio-metadata.js                                                      */
/* ========================================================================== */
/*
 * Purpose
 * -------
 * Reads project audio metadata for the local README-video toolchain.
 *
 * Responsibilities
 * ----------------
 * - Load the app config and resolve the active `video-shots` directory
 * - Detect whether `music.mp3` and `music-beats.json` exist
 * - Read the real audio duration through `ffprobe` when available
 * - Read beat / transient counts from `music-beats.json`
 * - Return one normalized metadata object for backend routes or scripts
 *
 * Runtime model
 * -------------
 * - `config/config.json` provides the absolute `video-shots` root path
 * - The selected project resolves one concrete project directory below that root
 * - Audio is expected at `<project>/music.mp3`
 * - Beat metadata is expected at `<project>/music-beats.json`
 *
 * Notes
 * -----
 * - This module does not generate beat files. That stays the responsibility of
 *   `ensure-music-beats.js`.
 * - Duration probing is best-effort. Missing `ffprobe` does not throw unless
 *   explicitly required by a caller later.
 *
 * Change log
 * ----------
 * 2026-03-15
 * - Created normalized backend helper for audio metadata lookup
 * - Added optional CLI mode for local debugging / manual inspection
 *
 * 2026-03-17
 * - Fixed project-aware runtime resolution for per-project `music.mp3`
 * - Updated the runtime model comments for the selected-project workflow
 *
 * 2026-03-21
 * - Extended the normalized audio response with beat-sync UI fields
 */
/* ========================================================================== */

import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {loadAppRuntimeContext} from "../../config/app-config.js";
import {readJsonFile} from "../server/json-files.js";

/* -------------------------------------------------------------------------- */
/* Paths and constants                                                        */
/* -------------------------------------------------------------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "../..");

const AUDIO_FILES = {
  musicFileName: "music.mp3",
  beatFileName: "music-beats.json",
};

/* -------------------------------------------------------------------------- */
/* Generic helpers                                                            */
/* -------------------------------------------------------------------------- */



/**
 * Returns one stable error message.
 *
 * @param {unknown} error
 * @param {string} fallback
 * @returns {string}
 */
function toErrorMessage(error, fallback = "Unknown error") {
  return String(error?.message || error || fallback);
}

/**
 * Returns whether one filesystem path exists.
 *
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}



/* -------------------------------------------------------------------------- */
/* Process helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Runs one child process and collects stdout / stderr.
 *
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<{code: number | null, stdout: string, stderr: string}>}
 */
function runProcess(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: APP_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Audio metadata readers                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Loads the selected project runtime context for audio metadata lookup.
 *
 * @param {string} preferredProjectName
 * @returns {Promise<{
 *   appConfig: any,
 *   basePath: string,
 *   activeProject: string,
 *   videoShotsDir: string,
 *   availableProjects: string[],
 * }>}
 */
async function loadAudioContext(preferredProjectName) {
  return loadAppRuntimeContext(preferredProjectName);
}

/**
 * Reads the real audio duration in seconds with `ffprobe`.
 * Returns `null` if probing fails.
 *
 * @param {string} audioFilePath
 * @returns {Promise<number | null>}
 */
async function probeAudioDurationSeconds(audioFilePath) {
  const {code, stdout} = await runProcess("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    audioFilePath,
  ]).catch(() => ({code: 1, stdout: "", stderr: ""}));

  if (code !== 0) {
    return null;
  }

  const duration = Number(stdout);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

/**
 * Reads beat metadata from `music-beats.json`.
 *
 * @param {string} beatFilePath
 * @returns {Promise<{beatCount: number, transientCount: number, data: any | null}>}
 */
async function readBeatMetadata(beatFilePath) {
  const exists = await pathExists(beatFilePath);

  if (!exists) {
    return {
      beatCount: 0,
      transientCount: 0,
      data: null,
    };
  }

  const beatData = await readJsonFile(beatFilePath);
  const beats = Array.isArray(beatData?.beats)
    ? beatData.beats
    : Array.isArray(beatData?.transients)
      ? beatData.transients
      : [];
  const transients = Array.isArray(beatData?.transients) ? beatData.transients : beats;

  return {
    beatCount: beats.length,
    transientCount: transients.length,
    data: beatData,
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Returns normalized audio metadata for one selected project.
 *
 * @param {string} preferredProjectName
 * @returns {Promise<{
 *   ok: true,
 *   activeProject: string,
 *   videoShotsDir: string,
 *   hasAudio: boolean,
 *   audioFileName: string,
 *   audioFilePath: string,
 *   audioDurationSeconds: number | null,
 *   hasBeatFile: boolean,
 *   beatFileName: string,
 *   beatFilePath: string,
 *   beatCount: number,
 *   transientCount: number,
 *   beatData: any | null,
 * }>} 
 */
export async function getAudioMetadata(preferredProjectName) {
  const {activeProject, videoShotsDir} = await loadAudioContext(preferredProjectName);

  const audioFilePath = path.join(videoShotsDir, AUDIO_FILES.musicFileName);
  const beatFilePath = path.join(videoShotsDir, AUDIO_FILES.beatFileName);

  const hasAudio = await pathExists(audioFilePath);
  const hasBeatFile = await pathExists(beatFilePath);
  const audioDurationSeconds = hasAudio
    ? await probeAudioDurationSeconds(audioFilePath)
    : null;

  const {beatCount, transientCount, data: beatData} = hasBeatFile
    ? await readBeatMetadata(beatFilePath)
    : {beatCount: 0, transientCount: 0, data: null};

  return {
    ok: true,
    activeProject,
    videoShotsDir,
    hasAudio,
    audioFileName: AUDIO_FILES.musicFileName,
    audioFilePath,
    audioDurationSeconds,
    hasBeatFile,
    beatFileName: AUDIO_FILES.beatFileName,
    beatFilePath,
    beatCount,
    transientCount,
    beatData,
  };
}

/* -------------------------------------------------------------------------- */
/* CLI entry                                                                  */
/* -------------------------------------------------------------------------- */

async function main() {
  const metadata = await getAudioMetadata();
  process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`${toErrorMessage(error)}\n`);
    process.exit(1);
  });
}

/**
 * Returns one normalized beat-sync payload for the UI.
 *
 * @param {any} beatSync
 * @param {boolean} beatSyncEnabled
 * @param {number} beatSyncStep
 * @returns {{enabled: boolean, step: number}}
 */
function normalizeBeatSyncPayload(beatSync, beatSyncEnabled, beatSyncStep) {
  return {
    enabled: Boolean(beatSyncEnabled ?? beatSync?.enabled ?? true),
    step: Number(beatSyncStep ?? beatSync?.step ?? 1) > 0 ? Number(beatSyncStep ?? beatSync?.step ?? 1) : 1,
  };
}

export function createAudioMetadataResponse(data) {
  const beatData = data?.beatData || {};
  const beatSync = normalizeBeatSyncPayload(
    data?.beatSync,
    data?.beatSyncEnabled,
    data?.beatSyncStep,
  );
  const hasAudio = Boolean(data?.hasAudio);
  const hasBeatFile = Boolean(data?.hasBeatFile);
  const beatCount = Number(data?.beatCount ?? 0);

  return {
    ok: true,
    hasAudio,
    durationSeconds: Number(data?.audioDurationSeconds ?? 0),
    beatCount,
    transients: Array.isArray(beatData.transients) ? beatData.transients : [],
    waveform: Array.isArray(beatData.waveform) ? beatData.waveform : [],
    filename: String(data?.audioFileName || AUDIO_FILES.musicFileName),
    beatsFilename: String(data?.beatFileName || AUDIO_FILES.beatFileName),
    beatSyncEnabled: beatSync.enabled,
    beatSyncStep: beatSync.step,
    beatSyncActive: beatSync.enabled && hasAudio && hasBeatFile && beatCount > 0,
    loopMode: beatSync.enabled ? "Beat-Sync" : "Loop / frei",
  };
}
