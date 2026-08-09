import { error } from '@sveltejs/kit';
import { File } from 'megajs';
import { Readable } from 'stream';
import type { RequestHandler } from './$types';

// MEGA share links are decrypted client-side, so a phone cannot open one
// directly as a PDF. This route does the decryption server-side and streams
// the plain bytes back with a real PDF content type, which is what the
// reader page (and any PDF viewer) needs.
//
// The response is *streamed* on purpose: Vercel Functions cap buffered
// response bodies at 4.5 MB, and books are routinely larger than that.
// Streamed responses are not subject to that cap.

const ALLOWED_HOSTS = new Set(['mega.nz', 'mega.co.nz', 'www.mega.nz', 'www.mega.co.nz']);

const CONTENT_TYPES: Record<string, string> = {
	pdf: 'application/pdf',
	epub: 'application/epub+zip',
	txt: 'text/plain; charset=utf-8'
};

function contentTypeFor(fileName: string | undefined): string {
	const ext = (fileName || '').split('.').pop()?.toLowerCase() ?? '';
	return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export const GET: RequestHandler = async ({ url }) => {
	const fileUrl = url.searchParams.get('url');

	if (!fileUrl) {
		throw error(400, 'Missing "url" query parameter');
	}

	// Only ever fetch from MEGA. Without this the route would be an open proxy
	// that any caller could point at an arbitrary host.
	let parsed: URL;
	try {
		parsed = new URL(fileUrl);
	} catch {
		throw error(400, 'Malformed "url" query parameter');
	}
	if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
		throw error(400, 'Only mega.nz links are supported');
	}

	let file: any;
	try {
		file = File.fromURL(fileUrl);
		await file.loadAttributes();
	} catch (e: any) {
		console.error('MEGA loadAttributes failed:', e);
		throw error(
			502,
			'Could not read this file from MEGA. The link may be wrong, missing its ' +
				'decryption key, or the file may have been removed. (' + e.message + ')'
		);
	}

	const headers = new Headers({
		'Content-Type': contentTypeFor(file.name),
		// "inline" so viewers render it instead of triggering a download.
		'Content-Disposition': `inline; filename="${encodeURIComponent(file.name ?? 'book')}"`,
		'Cache-Control': 'public, max-age=3600',
		// The reader page is same-origin, but allow direct use from the app too.
		'Access-Control-Allow-Origin': '*'
	});

	if (typeof file.size === 'number') {
		headers.set('Content-Length', String(file.size));
	}

	const nodeStream = file.download({});

	nodeStream.on('error', (e: Error) => {
		console.error('MEGA download stream error:', e);
	});

	return new Response(Readable.toWeb(nodeStream) as ReadableStream, { headers });
};
