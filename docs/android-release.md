# Android build and release

The web app is wrapped with Capacitor using app ID `com.sanjaykumar286028.dailyhabitstracker`. The Android project is generated from the pinned Capacitor 8 packages by the workflow, because this checkout does not include Android Studio, Java, Gradle, or the Android SDK.

## Local development

Install Node.js 22+ and Android Studio with an Android SDK. Then run:

```sh
npm install
npm run build
npm run android:add
npm run android:sync
cd android
./gradlew assembleDebug
./gradlew assembleRelease
```

On Windows, use `gradlew.bat` in Android Studio or a Command Prompt. The release build produced without signing secrets is unsigned and is not suitable for distribution.

## GitHub Actions APK build

The Android workflow creates a debug APK and an unsigned release candidate artifact. It creates a signed release APK only when the repository has all of these protected Actions secrets:

- `ANDROID_KEYSTORE_BASE64`: base64 encoding of the release keystore.
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Create and back up the release keystore securely before publishing. Keep it outside the repository and restrict access to the secrets. Losing the keystore prevents signing future updates with the same identity. Never replace the key after publishing an APK.

The website does not show an APK download link unless a signed release has actually been published and verified. Debug and unsigned artifacts are for development only.

## App identity and permissions

The application ID is stable and must not change after publishing. The wrapper requests no additional Android permissions; web notification support depends on the Android WebView and browser/OS support. Test notification behaviour on real Android devices before relying on it.
