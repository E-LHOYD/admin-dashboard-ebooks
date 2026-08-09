import { json } from '@sveltejs/kit';
import { Storage } from 'megajs';
import { Readable } from 'stream';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
config({ path: resolve('.env') });

export async function POST({ request }) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folderName = formData.get('folder') || 'books';

    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    // Get MEGA credentials from environment variables
    const megaEmail = process.env.MEGA_EMAIL;
    const megaPassword = process.env.MEGA_PASSWORD;

    console.log('MEGA Email:', megaEmail ? 'configured' : 'missing');
    console.log('MEGA Password:', megaPassword ? 'configured' : 'missing');
    console.log('All env vars:', Object.keys(process.env).filter(k => k.includes('MEGA')));

    if (!megaEmail || !megaPassword) {
      return json({ error: 'MEGA credentials not configured' }, { status: 500 });
    }

    // Login to MEGA
    const storage = await new Storage({
      email: megaEmail,
      password: megaPassword,
      userAgent: 'GDLibrary/1.0'
    }).ready;

    // Find or create the target folder
    const root = storage.root;
    let targetFolder = root.children.find((child: any) => child.name === folderName);
    
    if (!targetFolder) {
      targetFolder = await root.mkdir(folderName);
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload file to MEGA
    const uploadedFile = await targetFolder.upload(file.name, buffer).complete;

    // Get the file URL
    const fileUrl = uploadedFile.link;

    return json({
      success: true,
      fileUrl,
      fileName: uploadedFile.name,
      fileSize: uploadedFile.size,
      megaId: uploadedFile.id
    });

  } catch (error) {
    console.error('MEGA upload error:', error);
    return json({ error: 'Failed to upload file to MEGA: ' + error.message }, { status: 500 });
  }
}
