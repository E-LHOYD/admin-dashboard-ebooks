import { error, json } from '@sveltejs/kit';
import { File } from 'megajs';
import { Readable } from 'stream';
import type { RequestHandler } from './$types';

// Force-download variant of /api/mega/file. Same decryption, but sent as an
// attachment instead of inline. Streamed rather than buffered so it is not
// subject to Vercel's 4.5 MB response body cap.

const ALLOWED_HOSTS = new Set(['mega.nz', 'mega.co.nz', 'www.mega.nz', 'www.mega.co.nz']);

export const POST: RequestHandler = async ({ request }) => {
	const { fileUrl } = await request.json();

	if (!fileUrl) {
		return json({ error: 'No file URL provided' }, { status: 400 });
	}

	let parsed: URL;
	try {
		parsed = new URL(fileUrl);
	} catch {
		return json({ error: 'Malformed file URL' }, { status: 400 });
	}
	if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
		return json({ error: 'Only mega.nz links are supported' }, { status: 400 });
	}

	let file: any;
	try {
		file = File.fromURL(fileUrl);
		await file.loadAttributes();
	} catch (e: any) {
		console.error('MEGA download error:', e);
		throw error(502, 'Failed to read file from MEGA: ' + e.message);
	}

	const headers = new Headers({
		'Content-Type': 'application/octet-stream',
		'Content-Disposition': `attachment; filename="${encodeURIComponent(file.name ?? 'book')}"`
	});
	if (typeof file.size === 'number') {
		headers.set('Content-Length', String(file.size));
	}

	return new Response(Readable.toWeb(file.download({})) as ReadableStream, { headers });
};
