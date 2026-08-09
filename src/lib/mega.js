// Shared helpers for working with MEGA share links.
//
// A book's file lives in MEGA. Firestore stores only the share link, in the
// `megaFileUrl` field of the `books` collection. The mobile app reads that
// field; if it is missing the app cannot open the book.

export const MEGA_URL_HINT =
  'Open the file in MEGA, choose Share → Copy link, and make sure the link still ' +
  'contains the key after the "#". Example: https://mega.nz/file/AbCdEfGh#s0me-k3y';

// New-style file link:    https://mega.nz/file/<handle>#<key>
// Legacy file link:       https://mega.nz/#!<handle>!<key>
const NEW_STYLE = /^https?:\/\/mega\.(nz|co\.nz)\/file\/[^#/\s]+#[^\s]+$/i;
const LEGACY_STYLE = /^https?:\/\/mega\.(nz|co\.nz)\/#![^!\s]+![^\s]+$/i;

/**
 * True if the string is a MEGA *file* link that still carries its decryption key.
 * Folder links are rejected: a folder link does not identify a single file, so
 * it cannot be opened in the reader.
 * @param {string} url
 * @returns {boolean}
 */
export function isMegaUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  return NEW_STYLE.test(trimmed) || LEGACY_STYLE.test(trimmed);
}

/**
 * URL of the in-browser reader for a given MEGA link.
 * @param {string} megaFileUrl
 * @returns {string}
 */
export function readerPath(megaFileUrl) {
  return `/reader?url=${encodeURIComponent(megaFileUrl)}`;
}
