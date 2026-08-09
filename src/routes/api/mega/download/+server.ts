import { json } from '@sveltejs/kit';
import { File } from 'megajs';

export async function POST({ request }) {
  try {
    const { fileUrl } = await request.json();

    if (!fileUrl) {
      return json({ error: 'No file URL provided' }, { status: 400 });
    }

    // Load file from MEGA URL
    const file = File.fromURL(fileUrl);
    await file.loadAttributes();

    // Download file as buffer
    const buffer = await file.downloadBuffer();

    // Return file data
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${file.name}"`,
        'Content-Length': buffer.length.toString()
      }
    });

  } catch (error) {
    console.error('MEGA download error:', error);
    return json({ error: 'Failed to download file from MEGA: ' + error.message }, { status: 500 });
  }
}
