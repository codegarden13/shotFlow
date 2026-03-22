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
 * - Load app config and resolve the selected project directory
 * - Resolve the configured music and beats file names
 * - Decode the source MP3 to mono PCM via `ffmpeg`
 * - Compute spectral flux values over the decoded samples
 * - Pick transient peaks, derive one stable beat timeline and build waveform data
 * - Persist beat and waveform analysis as `music-beats.json`
 *
 * Runtime model
 * -------------
 * - `config/config.json` provides the absolute `video-shots` root directory
 * - The selected project resolves one concrete project directory below that root
 * - Audio defaults to `music.mp3` unless overridden in app config
 * - Beat output defaults to `music-beats.json` unless overridden in app config
 *
 * Notes
 * -----
 * - This module intentionally keeps analysis dependency-free.
 * - The direct DFT is slower than an FFT, but acceptable for the current
 *   offline preprocessing step.
 * - The generated JSON stores `transients`, derived `beats` and condensed
 *   waveform peaks for timeline rendering in the frontend.
 *
 * Change log
 * ----------
 * 2026-03-15
 * - Added full module header and clearer section structure
 * - Standardized path/config helpers with current app conventions
 * - Improved public return payload and preserved no-op behavior when file exists
 * - Added condensed waveform generation for frontend audio-timeline rendering
 *
 * 2026-03-17
 * - Fixed project-aware runtime resolution for per-project beat generation
 * - Removed stale direct config-path leftovers from the module setup
 *
 * 2026-03-21
 * - Derived one stable `beats` timeline from transient candidates
 * - Added transient-interval helpers to reduce overly dense sync candidates
 */
/* ========================================================================== */

import fs from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {loadAppRuntimeContext} from "../../config/app-config.js";

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

/**
 * Loads app config and resolves all music-analysis paths for one selected
 * project.
 *
 * @param {string} preferredProjectName
 * @returns {Promise<{
 *   appConfig: any,
 *   activeProject: string,
 *   videoShotsDir: string,
 *   audioFile: string,
 *   beatsFile: string,
 *   audioFileName: string,
 *   beatsFileName: string,
 * }>} 
 */
async function loadMusicAnalysisContext(preferredProjectName) {
  const {appConfig, activeProject, videoShotsDir} =
    await loadAppRuntimeContext(preferredProjectName);

  const audioFileName = appConfig.musicFile || AUDIO_DEFAULTS.musicFileName;
  const beatsFileName = appConfig.musicBeatsFile || AUDIO_DEFAULTS.beatFileName;

  return {
    appConfig,
    activeProject,
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

/**
 * Builds a condensed absolute-amplitude waveform for timeline rendering.
 * The returned values are normalized into the range 0..1.
 *
 * @param {Float32Array} samples
 * @param {number} binCount
 * @returns {number[]}
 */
function buildWaveformPeaks(samples, binCount) {
  if (!samples.length || binCount <= 0) {
    return [];
  }

  const safeBinCount = Math.max(1, Math.min(binCount, samples.length));
  const samplesPerBin = Math.max(1, Math.floor(samples.length / safeBinCount));
  const peaks = [];

  for (let binIndex = 0; binIndex < safeBinCount; binIndex += 1) {
    const start = binIndex * samplesPerBin;
    const end =
      binIndex === safeBinCount - 1
        ? samples.length
        : Math.min(samples.length, start + samplesPerBin);

    let peak = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      const amplitude = Math.abs(samples[sampleIndex]);
      if (amplitude > peak) {
        peak = amplitude;
      }
    }

    peaks.push(peak);
  }

  const maxPeak = Math.max(...peaks, 0);

  if (maxPeak <= 0) {
    return peaks.map(() => 0);
  }

  return peaks.map((value) => Number((value / maxPeak).toFixed(4)));
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

/**
 * Returns the sorted interval list between adjacent timestamps.
 *
 * @param {number[]} points
 * @returns {number[]}
 */
function buildAdjacentIntervals(points) {
  const intervals = [];

  for (let index = 1; index < points.length; index += 1) {
    const interval = Number(points[index] - points[index - 1]);

    if (Number.isFinite(interval) && interval > 0) {
      intervals.push(interval);
    }
  }

  return intervals.sort((left, right) => left - right);
}

/**
 * Returns the median interval of one sorted numeric list.
 *
 * @param {number[]} sortedValues
 * @returns {number}
 */
function medianOfSorted(sortedValues) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) {
    return 0;
  }

  const middleIndex = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
  }

  return sortedValues[middleIndex];
}

/**
 * Derives one steadier beat timeline from transient candidates.
 *
 * The spectral-flux peak picker intentionally keeps many onset candidates. For
 * slideshow timing this is often too dense, so this helper estimates one base
 * interval and then walks through the transient list by repeatedly choosing the
 * candidate closest to the expected next beat position.
 *
 * This is more stable than only checking each distance against one fixed median
 * window because the beat walk can continue across local timing drift instead
 * of stopping early when one section becomes temporarily denser or sparser.
 *
 * @param {number[]} transients
 * @returns {number[]}
 */
function deriveBeatsFromTransients(transients) {
  if (!Array.isArray(transients) || transients.length === 0) {
    return [];
  }

  if (transients.length < 3) {
    return transients.map((time) => Number(time.toFixed(4)));
  }

  const sortedTransients = [...transients]
    .map((time) => Number(time))
    .filter((time) => Number.isFinite(time) && time >= 0)
    .sort((left, right) => left - right);

  if (sortedTransients.length < 3) {
    return sortedTransients.map((time) => Number(time.toFixed(4)));
  }

  const medianInterval = medianOfSorted(buildAdjacentIntervals(sortedTransients));

  if (!(medianInterval > 0)) {
    return sortedTransients.map((time) => Number(time.toFixed(4)));
  }

  const targetInterval = Math.max(ANALYSIS.minBeatIntervalSeconds, medianInterval);
  const searchWindowMin = targetInterval * ANALYSIS.beatIntervalToleranceMin;
  const searchWindowMax = targetInterval * ANALYSIS.beatIntervalToleranceMax;
  const beats = [Number(sortedTransients[0].toFixed(4))];
  let currentBeat = sortedTransients[0];
  let searchStartIndex = 1;

  while (searchStartIndex < sortedTransients.length) {
    const expectedNextBeat = currentBeat + targetInterval;
    let bestIndex = -1;
    let bestCandidate = 0;
    let bestDistance = Infinity;

    for (let index = searchStartIndex; index < sortedTransients.length; index += 1) {
      const candidate = sortedTransients[index];
      const distanceFromCurrent = candidate - currentBeat;

      if (distanceFromCurrent < searchWindowMin) {
        continue;
      }

      if (distanceFromCurrent > searchWindowMax) {
        break;
      }

      const distanceFromExpected = Math.abs(candidate - expectedNextBeat);

      if (distanceFromExpected < bestDistance) {
        bestDistance = distanceFromExpected;
        bestCandidate = candidate;
        bestIndex = index;
      }
    }

    if (bestIndex === -1) {
      searchStartIndex += 1;
      currentBeat = sortedTransients[Math.min(searchStartIndex - 1, sortedTransients.length - 1)];
      if (beats[beats.length - 1] !== Number(currentBeat.toFixed(4))) {
        beats.push(Number(currentBeat.toFixed(4)));
      }
      continue;
    }

    currentBeat = bestCandidate;
    searchStartIndex = bestIndex + 1;
    beats.push(Number(bestCandidate.toFixed(4)));
  }

  return beats.filter(
    (time, index) => index === 0 || time > beats[index - 1],
  );
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Ensures that the configured beats file exists next to the input media in the
 * selected project directory. If the file already exists, it is kept.
 *
 * @param {string} preferredProjectName
 * @returns {Promise<{
 *   ok: true,
 *   activeProject: string,
 *   created: boolean,
 *   path: string,
 *   audioFile: string,
 *   beatsFile: string,
 *   transientCount?: number,
 *   beatCount?: number,
 *   waveformBins?: number,
 * }>} 
 */
export async function ensureMusicBeatsFile(preferredProjectName) {
  const context = await loadMusicAnalysisContext(preferredProjectName);

  if (!(await pathExists(context.audioFile))) {
    throw new Error(`Audio file not found: ${context.audioFile}`);
  }

  if (await pathExists(context.beatsFile)) {
    return {
      ok: true,
      activeProject: context.activeProject,
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
  const beats = deriveBeatsFromTransients(transients);
  const waveform = buildWaveformPeaks(samples, ANALYSIS.waveformBins);
  const durationSeconds = Number((samples.length / sampleRate).toFixed(4));

  const payload = {
    source: context.audioFile,
    sourceFileName: context.audioFileName,
    outputFileName: context.beatsFileName,
    method: "spectral-flux",
    sampleRate,
    durationSeconds,
    frameSize: ANALYSIS.frameSize,
    hopSize: ANALYSIS.hopSize,
    waveform,
    transients,
    beats,
  };

  await fs.writeFile(context.beatsFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return {
    ok: true,
    activeProject: context.activeProject,
    created: true,
    path: context.beatsFile,
    audioFile: context.audioFile,
    beatsFile: context.beatsFile,
    transientCount: transients.length,
    beatCount: beats.length,
    waveformBins: waveform.length,
  };
}

/* -------------------------------------------------------------------------- */
/* CLI entry                                                                  */
/* -------------------------------------------------------------------------- */

async function main() {
  const result = await ensureMusicBeatsFile(process.argv[2] || "");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "../..");

const ANALYSIS = {
  sampleRate: 22050,
  frameSize: 1024,
  hopSize: 512,
  peakThresholdOffset: 0.05,
  thresholdRadius: 8,
  minIntervalSeconds: 0.22,
  minBeatIntervalSeconds: 0.32,
 beatIntervalToleranceMin: 0.8,
beatIntervalToleranceMax: 1.35,
  waveformBins: 240,
};

const AUDIO_DEFAULTS = {
  musicFileName: "music.mp3",
  beatFileName: "music-beats.json",
};

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`${toErrorMessage(error)}\n`);
    process.exit(1);
  });
}