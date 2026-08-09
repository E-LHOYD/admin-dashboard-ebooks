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

    // Return the direct MEGA URL for streaming
    // MEGA URLs can be used directly for streaming in most cases
    return json({
      success: true,
      streamUrl: fileUrl,
      fileName: file.name,
      fileSize: file.size
    });

  } catch (error) {
    console.error('MEGA stream error:', error);
    return json({ error: 'Failed to get stream URL from MEGA: ' + error.message }, { status: 500 });
  }
}