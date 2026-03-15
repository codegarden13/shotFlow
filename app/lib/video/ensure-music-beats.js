/* ========================================================================== */
/* ensure-music-beats.js                                                      */
/* ========================================================================== */
/*
 * Purpose
 * -------
 * Ensures that `music-beats.json` exists for the currently configured project
 * audio and generates it with spectral-flux analysis when missing.
 *
 * Responsibilities
 * ----------------
 * - Load app config and resolve the active `video-shots` directory
 * - Resolve the configured music and beats file names
 * - Decode the source MP3 to mono PCM via `ffmpeg`
 * - Compute spectral flux values over the decoded samples
 * - Pick transient peaks and persist them as `music-beats.json`
 *
 * Runtime model
 * -------------
 * - `config/config.json` provides the absolute base directory
 * - The configured base path is the actual `video-shots` directory
 * - Audio defaults to `music.mp3` unless overridden in app config
 * - Beat output defaults to `music-beats.json` unless overridden in app config
 *
 * Notes
 * -----
 * - This module intentionally keeps analysis dependency-free.
 * - The direct DFT is slower than an FFT, but acceptable for the current
 *   offline preprocessing step.
 * - The generated JSON stores `transients` only; other modules may interpret
 *   these as beats until richer analysis is added later.
 *
 * Change log
 * ----------
 * 2026-03-15
 * - Added full module header and clearer section structure
 * - Standardized path/config helpers with current app conventions
 * - Improved public return payload and preserved no-op behavior when file exists
 */
/* ========================================================================== */

import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

/* -------------------------------------------------------------------------- */
/* Paths and constants                                                        */
/* -------------------------------------------------------------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "../..");

const PATHS = {
  appConfigFile: path.join(APP_ROOT, "config", "config.json"),
};

const ANALYSIS = {
  sampleRate: 22050,
  frameSize: 1024,
  hopSize: 512,
  peakThresholdOffset: 0.08,
  thresholdRadius: 8,
  minIntervalSeconds: 0.22,
};

const AUDIO_DEFAULTS = {
  musicFileName: "music.mp3",
  beatFileName: "music-beats.json",
};

/* -------------------------------------------------------------------------- */
/* Generic helpers                                                            */
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
 * Removes a trailing slash from one path-like string.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizeBasePath(value = "") {
  return String(value).replace(/[\\/]$/, "");
}

/**
 * Resolves the configured `video-shots` directory from `config/config.json`.
 *
 * @param {any} appConfig
 * @returns {string}
 */
function resolveVideoShotsDir(appConfig = {}) {
  const basePath = normalizeBasePath(appConfig.base || "");

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

/**
 * Loads app config and resolves all music-analysis paths.
 *
 * @returns {Promise<{
 *   appConfig: any,
 *   videoShotsDir: string,
 *   audioFile: string,
 *   beatsFile: string,
 *   audioFileName: string,
 *   beatsFileName: string,
 * }>} 
 */
async function loadMusicAnalysisContext() {
  const appConfig = await readJsonFile(PATHS.appConfigFile);
  const videoShotsDir = resolveVideoShotsDir(appConfig);
  const audioFileName = appConfig.musicFile || AUDIO_DEFAULTS.musicFileName;
  const beatsFileName = appConfig.musicBeatsFile || AUDIO_DEFAULTS.beatFileName;

  return {
    appConfig,
    videoShotsDir,
    audioFile: path.join(videoShotsDir, audioFileName),
    beatsFile: path.join(videoShotsDir, beatsFileName),
    audioFileName,
    beatsFileName,
  };
}

/* -------------------------------------------------------------------------- */
/* FFT helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Creates a Hann window for one frame size.
 *
 * @param {number} size
 * @returns {Float32Array}
 */
function hannWindow(size) {
  const window = new Float32Array(size);

  for (let i = 0; i < size; i += 1) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }

  return window;
}

/**
 * Computes a simple magnitude spectrum using a direct DFT.
 * This implementation is intentionally dependency-free and suitable for the
 * current offline analysis step.
 *
 * @param {Float32Array} signal
 * @returns {Float32Array}
 */
function dftMagnitude(signal) {
  const n = signal.length;
  const half = Math.floor(n / 2);
  const magnitudes = new Float32Array(half);

  for (let k = 0; k < half; k += 1) {
    let real = 0;
    let imag = 0;

    for (let t = 0; t < n; t += 1) {
      const angle = (-2 * Math.PI * k * t) / n;
      real += signal[t] * Math.cos(angle);
      imag += signal[t] * Math.sin(angle);
    }

    magnitudes[k] = Math.sqrt(real * real + imag * imag);
  }

  return magnitudes;
}

/* -------------------------------------------------------------------------- */
/* Audio decode                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Decodes one MP3 file to mono PCM using ffmpeg.
 *
 * @param {string} audioFilePath
 * @returns {Promise<{sampleRate: number, samples: Float32Array}>}
 */
function decodeMp3ToMonoPcm(audioFilePath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i",
      audioFilePath,
      "-f",
      "f32le",
      "-ac",
      "1",
      "-ar",
      String(ANALYSIS.sampleRate),
      "pipe:1",
    ]);

    const stdoutChunks = [];
    let stderr = "";

    ffmpeg.stdout.on("data", (chunk) => {
      stdoutChunks.push(chunk);
    });

    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on("error", (error) => {
      reject(error);
    });

    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `ffmpeg exited with code ${code}`));
        return;
      }

      const buffer = Buffer.concat(stdoutChunks);
      const floatArray = new Float32Array(
        buffer.buffer,
        buffer.byteOffset,
        Math.floor(buffer.byteLength / 4)
      );

      resolve({
        sampleRate: ANALYSIS.sampleRate,
        samples: new Float32Array(floatArray),
      });
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Spectral flux analysis                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Computes spectral flux values across the audio stream.
 *
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @returns {Array<{time: number, value: number}>}
 */
function computeSpectralFlux(samples, sampleRate) {
  const window = hannWindow(ANALYSIS.frameSize);
  const flux = [];
  let previousSpectrum = null;

  for (
    let offset = 0;
    offset + ANALYSIS.frameSize <= samples.length;
    offset += ANALYSIS.hopSize
  ) {
    const frame = new Float32Array(ANALYSIS.frameSize);

    for (let i = 0; i < ANALYSIS.frameSize; i += 1) {
      frame[i] = samples[offset + i] * window[i];
    }

    const spectrum = dftMagnitude(frame);

    if (previousSpectrum) {
      let value = 0;

      for (let i = 0; i < spectrum.length; i += 1) {
        const diff = spectrum[i] - previousSpectrum[i];

        if (diff > 0) {
          value += diff;
        }
      }

      flux.push({
        time: offset / sampleRate,
        value,
      });
    }

    previousSpectrum = spectrum;
  }

  return flux;
}

/**
 * Normalizes spectral flux values into the range 0..1.
 *
 * @param {Array<{time: number, value: number}>} flux
 * @returns {Array<{time: number, value: number}>}
 */
function normalizeFlux(flux) {
  if (!flux.length) {
    return flux;
  }

  const maxValue = Math.max(...flux.map((entry) => entry.value)) || 1;

  return flux.map((entry) => ({
    ...entry,
    value: entry.value / maxValue,
  }));
}

/* -------------------------------------------------------------------------- */
/* Peak picking                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Computes a local moving average around one flux index.
 *
 * @param {Array<{time: number, value: number}>} values
 * @param {number} index
 * @param {number} radius
 * @returns {number}
 */
function movingAverage(values, index, radius) {
  let sum = 0;
  let count = 0;

  for (
    let i = Math.max(0, index - radius);
    i <= Math.min(values.length - 1, index + radius);
    i += 1
  ) {
    sum += values[i].value;
    count += 1;
  }

  return count > 0 ? sum / count : 0;
}

/**
 * Picks transient peaks from normalized spectral flux values.
 *
 * @param {Array<{time: number, value: number}>} normalizedFlux
 * @returns {number[]}
 */
function pickPeaks(normalizedFlux) {
  const peaks = [];
  let lastPeakTime = -Infinity;

  for (let i = 1; i < normalizedFlux.length - 1; i += 1) {
    const current = normalizedFlux[i];
    const prev = normalizedFlux[i - 1];
    const next = normalizedFlux[i + 1];
    const adaptiveThreshold =
      movingAverage(normalizedFlux, i, ANALYSIS.thresholdRadius) +
      ANALYSIS.peakThresholdOffset;

    const isLocalMaximum = current.value > prev.value && current.value >= next.value;
    const isAboveThreshold = current.value >= adaptiveThreshold;
    const hasEnoughDistance =
      current.time - lastPeakTime >= ANALYSIS.minIntervalSeconds;

    if (isLocalMaximum && isAboveThreshold && hasEnoughDistance) {
      peaks.push(Number(current.time.toFixed(4)));
      lastPeakTime = current.time;
    }
  }

  return peaks;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Ensures that the configured beats file exists next to the input media in the
 * configured `video-shots` directory. If the file already exists, it is kept.
 *
 * @returns {Promise<{
 *   ok: true,
 *   created: boolean,
 *   path: string,
 *   audioFile: string,
 *   beatsFile: string,
 *   transientCount?: number,
 * }>} 
 */
export async function ensureMusicBeatsFile() {
  const context = await loadMusicAnalysisContext();

  if (!(await pathExists(context.audioFile))) {
    throw new Error(`Audio file not found: ${context.audioFile}`);
  }

  if (await pathExists(context.beatsFile)) {
    return {
      ok: true,
      created: false,
      path: context.beatsFile,
      audioFile: context.audioFile,
      beatsFile: context.beatsFile,
    };
  }

  const {sampleRate, samples} = await decodeMp3ToMonoPcm(context.audioFile);
  const rawFlux = computeSpectralFlux(samples, sampleRate);
  const normalizedFlux = normalizeFlux(rawFlux);
  const transients = pickPeaks(normalizedFlux);

  const payload = {
    source: context.audioFile,
    sourceFileName: context.audioFileName,
    outputFileName: context.beatsFileName,
    method: "spectral-flux",
    sampleRate,
    frameSize: ANALYSIS.frameSize,
    hopSize: ANALYSIS.hopSize,
    transients,
  };

  await fs.writeFile(context.beatsFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return {
    ok: true,
    created: true,
    path: context.beatsFile,
    audioFile: context.audioFile,
    beatsFile: context.beatsFile,
    transientCount: transients.length,
  };
}

/* -------------------------------------------------------------------------- */
/* CLI entry                                                                  */
/* -------------------------------------------------------------------------- */

async function main() {
  const result = await ensureMusicBeatsFile();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`${toErrorMessage(error)}\n`);
    process.exit(1);
  });
}