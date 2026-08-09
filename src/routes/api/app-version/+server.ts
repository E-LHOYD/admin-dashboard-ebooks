import { json } from '@sveltejs/kit';

// App version information (for mobile app updates)
// Admins don't need the app - this is for student users
const APP_VERSION = {
  version: '1.0.2',
  versionCode: 3,
  releaseDate: new Date().toISOString(),
  downloadUrl: 'https://gardnerebooks-download.vercel.app',
  changes: [
    'Changed homepage background color to blue for OTA testing',
    'OTA notification system test'
  ],
  forceUpdate: false,
  minVersion: '1.0.0'
};

export async function GET() {
  return json(APP_VERSION);
}