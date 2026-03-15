/**
 * Maps one local image source into the public preview URL served by Express.
 *
 * @param {string} src
 * @returns {string}
 */
export function toPreviewUrl(src = "") {
  const fileName = String(src || "").split("/").pop();
  return fileName ? `/video-shots/${fileName}` : "";
}