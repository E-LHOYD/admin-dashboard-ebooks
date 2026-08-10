import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

// Book files live in Supabase Storage. Firestore stores only the public URL,
// in the `fileUrl` field of each document in the `books` collection.
//
// Uploads go from the browser straight to Supabase. They deliberately do NOT
// pass through this app's server: Vercel Functions cap request bodies at
// 4.5 MB and books are routinely larger than that. The server's only job is to
// authorise the upload (see /api/uploads/sign), which is a small JSON exchange.

export const BOOKS_BUCKET = 'books';

// Read at runtime rather than build time, so a missing variable surfaces as a
// clear error in the UI instead of failing the whole deployment's build.
export const SUPABASE_URL = env.PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = env.PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isSupabaseConfigured
	? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
	: null;

export const SUPABASE_SETUP_HINT =
	'Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY in your environment ' +
	'(Vercel project settings, and .env for local development).';

export const ACCEPTED_EXTENSIONS = ['pdf', 'epub', 'txt'];

// Supabase's free plan rejects uploads above 50 MB.
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * True if the value is a public URL served by this project's Supabase Storage.
 * Used to decide whether a book is readable, and to stop the reader page being
 * pointed at an arbitrary host.
 * @param {string} url
 * @returns {boolean}
 */
export function isBookFileUrl(url) {
	if (typeof url !== 'string' || !SUPABASE_URL) return false;
	try {
		const parsed = new URL(url.trim());
		const base = new URL(SUPABASE_URL);
		return parsed.origin === base.origin && parsed.pathname.startsWith('/storage/v1/object/public/');
	} catch {
		return false;
	}
}

/**
 * Public URL for an object already stored in the books bucket.
 * @param {string} path
 * @returns {string}
 */
export function publicUrlFor(path) {
	return `${SUPABASE_URL}/storage/v1/object/public/${BOOKS_BUCKET}/${path}`;
}

/**
 * URL of the in-browser reader for a book file.
 * @param {string} fileUrl
 * @returns {string}
 */
export function readerPath(fileUrl) {
	return `/reader?url=${encodeURIComponent(fileUrl)}`;
}

/**
 * Human-readable file size.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
	if (!bytes) return '0 Bytes';
	const units = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${units[i]}`;
}

/**
 * Check a chosen file before uploading it.
 * @param {File} file
 * @returns {string|null} An error message, or null if the file is acceptable.
 */
export function validateBookFile(file) {
	const ext = (file.name.split('.').pop() || '').toLowerCase();

	if (!ACCEPTED_EXTENSIONS.includes(ext)) {
		return `Only ${ACCEPTED_EXTENSIONS.join(', ')} files can be uploaded.`;
	}

	if (file.size > MAX_FILE_BYTES) {
		return `That file is ${formatFileSize(file.size)}. The limit is ${formatFileSize(MAX_FILE_BYTES)}.`;
	}

	return null;
}
