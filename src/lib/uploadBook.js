import { auth } from '$lib/firebase';
import { supabase, BOOKS_BUCKET, isSupabaseConfigured, SUPABASE_SETUP_HINT } from '$lib/supabase';

/**
 * Upload a book file to Supabase Storage, straight from the browser.
 *
 * The server is asked to authorise the upload and returns a signed URL; the
 * bytes then go directly to Supabase. Nothing large passes through this app's
 * own server, so Vercel's 4.5 MB request body cap never applies.
 *
 * @param {File} file
 * @returns {Promise<{fileUrl: string, filePath: string, fileName: string, fileSize: number}>}
 */
export async function uploadBookFile(file) {
	return uploadToBucket(file, 'book');
}

/**
 * Upload a cover image, by the same route and the same signing step.
 *
 * @param {File} file
 * @returns {Promise<{coverUrl: string, coverPath: string}>}
 */
export async function uploadCoverImage(file) {
	const uploaded = await uploadToBucket(file, 'cover');
	return { coverUrl: uploaded.fileUrl, coverPath: uploaded.filePath };
}

/**
 * @param {File} file
 * @param {'book'|'cover'} kind
 */
async function uploadToBucket(file, kind) {
	if (!isSupabaseConfigured || !supabase) {
		throw new Error(`Storage is not configured. ${SUPABASE_SETUP_HINT}`);
	}

	const user = auth.currentUser;

	if (!user) {
		throw new Error('You must be signed in to upload a book.');
	}

	const idToken = await user.getIdToken();

	const response = await fetch('/api/uploads/sign', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${idToken}`
		},
		body: JSON.stringify({ fileName: file.name, fileSize: file.size, kind })
	});

	if (!response.ok) {
		// SvelteKit error() responses are JSON with a `message`; fall back to text.
		let detail = '';
		try {
			detail = (await response.json())?.message ?? '';
		} catch {
			detail = await response.text();
		}
		throw new Error(detail || `Could not authorise the upload (${response.status}).`);
	}

	const { path, token, contentType, publicUrl } = await response.json();

	const { error } = await supabase.storage
		.from(BOOKS_BUCKET)
		.uploadToSignedUrl(path, token, file, { contentType, upsert: false });

	if (error) {
		throw new Error(`Upload failed: ${error.message}`);
	}

	return {
		fileUrl: publicUrl,
		filePath: path,
		fileName: file.name,
		fileSize: file.size
	};
}
