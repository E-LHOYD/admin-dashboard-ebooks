import { json } from '@sveltejs/kit';

// App version information (for mobile app updates)
// Admins don't need the app - this is for student users
const APP_VERSION = {
  version: '1.0.1',
  versionCode: 2,
  releaseDate: new Date().toISOString(),
  downloadUrl: null, // Will be set when APK hosting is determined
  changes: [
    'Fixed homepage background color to red for testing',
    'OTA update system testing',
    'Improved user experience'
  ],
  forceUpdate: false,
  minVersion: '1.0.0'
};

export async function GET() {
  return json(APP_VERSION);
}