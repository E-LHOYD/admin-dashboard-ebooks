import { json, error } from '@sveltejs/kit';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { RequestHandler } from './$types';

// Authorises a single upload and nothing else.
//
// The browser cannot be trusted with the Supabase service role key, and the
// anon key alone must not be allowed to write to the books bucket (anyone can
// read an anon key out of the page). So the flow is:
//
//   1. Browser sends its Firebase ID token here.
//   2. This route verifies that token, then uses the service role key to mint a
//      short-lived signed upload URL for one specific object path.
//   3. Browser uploads the file straight to Supabase using that signed URL.
//
// The file itself never passes through this function, which is what keeps the
// 4.5 MB Vercel request body cap out of the picture.

const FIREBASE_PROJECT_ID = 'gd-library';

// Firebase ID tokens are signed by Google. Verifying them against Google's
// published keys avoids needing firebase-admin or a service account key here.
const GOOGLE_JWKS = createRemoteJWKSet(
	new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

const ACCEPTED_EXTENSIONS = new Set(['pdf', 'epub', 'txt']);
const MAX_FILE_BYTES = 50 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
	pdf: 'application/pdf',
	epub: 'application/epub+zip',
	txt: 'text/plain'
};

/** Strip anything that would be awkward or unsafe in an object path. */
function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/\.[^.]+$/, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60) || 'book';
}

async function requireAdmin(request: Request): Promise<string> {
	const header = request.headers.get('authorization') ?? '';
	const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

	if (!token) {
		throw error(401, 'Sign in to upload books.');
	}

	try {
		const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
			issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
			audience: FIREBASE_PROJECT_ID
		});

		if (!payload.sub) {
			throw new Error('token has no subject');
		}

		return payload.sub;
	} catch (e: any) {
		console.error('Rejected upload token:', e?.message);
		throw error(401, 'Your session is not valid. Sign in again and retry.');
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const supabaseUrl = publicEnv.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !serviceRoleKey) {
		throw error(
			500,
			'Storage is not configured on the server. Set PUBLIC_SUPABASE_URL and ' +
				'SUPABASE_SERVICE_ROLE_KEY in the environment.'
		);
	}

	const uid = await requireAdmin(request);

	const { fileName, fileSize } = await request.json();

	if (typeof fileName !== 'string' || !fileName.trim()) {
		throw error(400, 'A file name is required.');
	}

	const extension = (fileName.split('.').pop() || '').toLowerCase();

	if (!ACCEPTED_EXTENSIONS.has(extension)) {
		throw error(400, `Only ${[...ACCEPTED_EXTENSIONS].join(', ')} files can be uploaded.`);
	}

	if (typeof fileSize === 'number' && fileSize > MAX_FILE_BYTES) {
		throw error(413, 'That file is larger than the 50 MB limit.');
	}

	// Timestamp keeps re-uploads of the same title from colliding, and means a
	// replaced file gets a fresh URL rather than being served from cache.
	const objectPath = `${Date.now()}-${slugify(fileName)}.${extension}`;
	const admin = createClient(supabaseUrl, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});

	const { data, error: signError } = await admin.storage
		.from('books')
		.createSignedUploadUrl(objectPath);

	if (signError || !data) {
		console.error('Could not sign upload:', signError);
		throw error(502, `Storage rejected the upload request: ${signError?.message ?? 'unknown error'}`);
	}

	console.log('Signed upload for', uid, objectPath);

	return json({
		path: data.path,
		token: data.token,
		contentType: CONTENT_TYPES[extension] ?? 'application/octet-stream',
		publicUrl: `${supabaseUrl}/storage/v1/object/public/books/${objectPath}`
	});
};
