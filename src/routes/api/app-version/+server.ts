import { json } from '@sveltejs/kit';

// App version information
const APP_VERSION = {
  version: '1.0.0',
  versionCode: 1,
  releaseDate: new Date().toISOString(),
  downloadUrl: 'https://gardnerebooks-download.vercel.app',
  changes: [
    'Initial release with MEGA book reading',
    'Persistent login functionality',
    'Settings page with user management',
    'Auto-login on app start'
  ],
  forceUpdate: false,
  minVersion: '1.0.0'
};

export async function GET() {
  return json(APP_VERSION);
}