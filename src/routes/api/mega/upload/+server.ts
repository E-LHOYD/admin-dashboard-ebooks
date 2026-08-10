import { error, json } from '@sveltejs/kit';
import { Storage } from 'megajs';
import type { RequestHandler } from './$types';

// This endpoint handles automatic MEGA uploads for book PDFs
// It uploads the file to MEGA and returns the share link

export const POST: RequestHandler = async ({ request }) => {
	try {
		const formData = await request.formData();
		const file = formData.get('file') as File;
		const title = formData.get('title') as string;

		if (!file) {
			return json({ error: 'No file provided' }, { status: 400 });
		}

		if (!title) {
			return json({ error: 'No title provided' }, { status: 400 });
		}

		// Get MEGA credentials from environment variables
		const megaEmail = process.env.MEGA_EMAIL;
		const megaPassword = process.env.MEGA_PASSWORD;

		console.log('MEGA credentials check:', { 
			hasEmail: !!megaEmail, 
			hasPassword: !!megaPassword,
			emailPrefix: megaEmail?.substring(0, 3) + '***'
		});

		if (!megaEmail || !megaPassword) {
			return json({ 
				error: 'MEGA credentials not configured. Please set MEGA_EMAIL and MEGA_PASSWORD environment variables.' 
			}, { status: 500 });
		}

		// Convert File to Buffer
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// Create a safe filename
		const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_');
		const fileName = `${safeTitle}.pdf`;

		console.log('Starting MEGA upload:', { fileName, fileSize: buffer.length });

		// Initialize MEGA storage
		const storage = new Storage({
			email: megaEmail,
			password: megaPassword
		});

		// Connect to MEGA
		console.log('Connecting to MEGA...');
		await storage.ready;
		console.log('MEGA connection successful');

		// Find or create a books folder
		console.log('Looking for GD-Library-Books folder...');
		let booksFolder;
		
		// Wait for storage to be fully loaded and get children
		try {
			await storage.getAccountInfo();
			const children = storage.children || [];
			console.log('Storage children count:', children.length);
			
			booksFolder = children.find((child: any) => child.name === 'GD-Library-Books');
			
			if (!booksFolder) {
				console.log('Creating GD-Library-Books folder...');
				booksFolder = storage.mkdir('GD-Library-Books');
				console.log('Folder created successfully');
			} else {
				console.log('Found existing GD-Library-Books folder');
			}
		} catch (folderError) {
			console.error('Error with folder operations:', folderError);
			// If folder operations fail, try to upload to root
			booksFolder = storage;
		}

		// Upload the file using the directory's upload method
		const upload = booksFolder.upload({
			name: fileName,
			size: buffer.length
		});

		console.log('Starting file upload to MEGA...');

		// Write the buffer to the upload stream
		return new Promise((resolve, reject) => {
			upload.on('complete', async (uploadedFile: any) => {
				try {
					const link = await uploadedFile.link();
					console.log('File uploaded to MEGA successfully:', fileName, link);
					resolve(json({
						success: true,
						megaFileUrl: link,
						fileName
					}));
				} catch (err) {
					console.error('Failed to generate MEGA link:', err);
					reject(json({ 
						error: 'Failed to generate MEGA link: ' + (err as Error).message 
					}, { status: 500 }));
				}
			});

			upload.on('error', (err: Error) => {
				console.error('MEGA upload error:', err);
				reject(json({ 
					error: 'Failed to upload to MEGA: ' + err.message 
				}, { status: 500 }));
			});

			// Write the buffer to the upload stream
			upload.write(buffer);
			upload.end();
		});

	} catch (e: any) {
		console.error('MEGA upload error:', e);
		return json({ 
			error: 'Failed to upload to MEGA: ' + e.message 
		}, { status: 500 });
	}
};