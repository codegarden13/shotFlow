/* ========================================================================== */
/* video-paths.js                                                             */
/* ========================================================================== */
/*
 * Purpose
 * -------
 * Shared path utilities used by both the server runtime and render scripts.
 *
 * Responsibilities
 * ----------------
 * - Normalize configured filesystem base paths
 * - Extract file names from local source paths
 * - Map asset sources to public preview URLs served by Express
 *
 * Notes
 * -----
 * - This file is intentionally stateless.
 * - It should not depend on runtime state, Express instances or app config.
 * - Canonical exports are prefixed with `videoPath*`.
 * - Legacy aliases remain available for incremental migration.
 */
/* ========================================================================== */

import path from "node:path";

/* -------------------------------------------------------------------------- */
/* Primitive helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Returns one normalized string value.
 *
 * @param {any} value
 * @returns {string}
 */
function normalizeString(value) {
  return String(value ?? "");
}

/**
 * Returns the normalized file name from one source path.
 *
 * @param {string} src
 * @returns {string}
 */
export function videoPathGetFileName(src = "") {
  return path.basename(normalizeString(src));
}

/**
 * Removes trailing slashes from one configured base path.
 *
 * @param {string} value
 * @returns {string}
 */
export function videoPathNormalizeBase(value = "") {
  return normalizeString(value).replace(/\/+$/, "");
}

/**
 * Maps one local image source into the public preview URL served by Express.
 *
 * @param {string} src
 * @returns {string}
 */
export function videoPathToPreviewUrl(src = "") {
  const fileName = videoPathGetFileName(src);
  return fileName ? `/video-shots/${encodeURIComponent(fileName)}` : "";
}

/* -------------------------------------------------------------------------- */
/* Legacy compatibility aliases                                               */
/* -------------------------------------------------------------------------- */

export const getFileNameFromSrc = videoPathGetFileName;
export const normalizeBasePath = videoPathNormalizeBase;
export const toPreviewUrl = videoPathToPreviewUrl;