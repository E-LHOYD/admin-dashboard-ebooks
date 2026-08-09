import { json } from '@sveltejs/kit';

// App version information (for mobile app updates)
// Admins don't need the app - this is for student users
const APP_VERSION = {
  version: '1.0.0',
  versionCode: 1,
  releaseDate: new Date().toISOString(),
  downloadUrl: null, // Will be set when APK hosting is determined
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