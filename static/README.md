# Static Files for APK Download

Place your built APK file here as `app.apk` to enable direct downloads.

To build the APK:
1. Connect your phone via ADB
2. Run: `cd C:\Users\user\Documents\windsurfprojects\gardnerebooks`
3. Run: `ns build android --release`
4. Copy the APK from `platforms/android/app/build/outputs/apk/release/` to this folder
5. Rename it to `app.apk`

The download page at `/download` will serve this file.