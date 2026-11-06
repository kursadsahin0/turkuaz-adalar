# Release checklist

Everything in this file is a step only you can do (keys, store accounts, legal
text). The project is already configured to use what these steps produce.

## Versioning

`package.json` → `version` is the single source of truth.

| `version` | Android `versionName` / `versionCode` | iOS `MARKETING_VERSION` / build |
| --------- | ------------------------------------- | ------------------------------- |
| `1.0.0`   | `1.0.0` / `10000`                     | `1.0.0` / `10000`               |
| `1.2.3`   | `1.2.3` / `10203`                     | `1.2.3` / `10203`               |

Bump it before every store upload (stores reject a repeated build number):

```bash
npm version patch --no-git-tag-version
```

## Android

### 1. Create the upload key (once)

```bash
npm run android:keystore
```

It asks for your name, country and a password (hidden), then creates
`android/release/turkuaz-upload.jks` and `android/keystore.properties`. Both
are git-ignored and readable only by you; it refuses to overwrite an existing
key.

Keep the `.jks` file and the password somewhere safe (a password manager).
If you lose them you need Google support to reset the upload key, which only
works with Play App Signing turned on.

### 2. CI (optional)

On CI, set the repository secrets `ANDROID_KEYSTORE_BASE64` (`base64 -i
android/release/turkuaz-upload.jks`), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` (`turkuaz-upload`) and `ANDROID_KEY_PASSWORD`.

Without a key the release build still works but is unsigned, and Play rejects it.

### 3. Build the Play bundle

```bash
npm run android:release
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`. Release
builds are shrunk with R8 (`minifyEnabled true`, `shrinkResources true`).
Turn on **Play App Signing** when you create the app in Play Console.

### 4. Play Console

- **Store listing**: titles, short/full descriptions (TR and EN), keywords
  and category are ready to paste in [`store/listing.md`](store/listing.md).
- **Graphics**: `store/icon-512.png`, `store/feature-graphic-1024x500.png` and
  phone screenshots in `store/screenshots/play/<lang>/` (regenerate with
  `npm run store:screenshots`; `-- --ios` for App Store sizes).
- **Privacy policy URL**: the GitHub Pages link (see _Privacy policy_ below).
- **Data safety**: with ads disabled the game collects nothing. Once AdMob is
  live, declare _Device or other IDs_, _Approximate location_ and _App
  interactions_, collected by a third party (Google) for _Advertising_ and
  _Fraud prevention_, optional for personalisation.
- **Ads**: answer "Yes, contains ads" once AdMob is enabled.
- **Target audience**: the game is rated and declared for **13 and over**
  (age groups 13–15, 16–17, 18+), which the privacy policy also states. Adding
  under-13 groups would bring in the Families policy and COPPA: certified ad
  SDKs only, non-personalised ads and `tagForChildDirectedTreatment`, plus a
  privacy policy update.

## iOS

Needs a Mac with **Xcode** (not only the Command Line Tools) and an Apple
Developer Program membership.

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
npm run ios:sync
npx cap open ios
```

In Xcode:

1. Select your team under _Signing & Capabilities_.
2. Add `App/App/tr.lproj/InfoPlist.strings` and `App/App/en.lproj/InfoPlist.strings`
   to the _App_ target (drag them into the project, "Copy items" off). They
   translate the tracking prompt; without them iOS shows the English text
   from `Info.plist` to everyone.
3. Run `npm run ios:release` (checks the AdMob IDs and writes the app ID into
   `Info.plist`).
4. _Product → Archive_ and upload.

Already done: app icon and splash (`npm run assets:brand`), export compliance
(`ITSAppUsesNonExemptEncryption = NO`), the App Tracking Transparency text and
prompt (shown after Google's consent form, before the first ad), and native
haptics.

## Privacy policy

`public/privacy.html` is bundled into the app (Settings → Privacy) and is the
page the stores need as a public URL. Before publishing:

1. Developer (Kürşat Şahin), contact e-mail, effective date and the
   "Children" section (13+) are filled in. Update the effective date whenever
   the policy changes.
2. Have it reviewed; it describes the current app, not legal advice.
3. Push the repository to GitHub and set _Settings → Pages → Source_ to
   **GitHub Actions**. `.github/workflows/pages.yml` then publishes it at
   `https://<user>.github.io/<repo>/privacy.html`; use that URL in Play Console
   and App Store Connect. The workflow refuses to publish while any `[…]`
   placeholder is left.

## Crash reports (optional)

Crashes are always kept in a local log on the device. To also receive them:

1. Create a Sentry project (platform: Browser JavaScript). In its settings
   turn on **Security & Privacy → Prevent Storing of IP Addresses**.
2. Put the DSN in `.env.production.local` (git-ignored):

   ```bash
   VITE_SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project>
   ```

3. Rebuild. The Sentry SDK is a separate chunk that is only downloaded when a
   DSN is set and the player has _Send anonymous crash reports_ on (default on,
   switchable in Settings → Privacy). Only errors are sent: no tracing, replay
   or user data.

Analytics events (`run_start`, `run_end`, `purchase`, `continue`, claims,
consent, ad results) already flow through `Telemetry.track()`. They stay on
the device until you register an `AnalyticsSink` for a real service; add an
opt-in toggle and a privacy policy section when you do.

## Ads (AdMob)

Rewarded ads ("watch an ad to continue") use AdMob through
`@capacitor-community/admob` on Android and iOS; the browser build keeps a
simulated provider. **Every build uses Google's test IDs until you supply
real ones**, so development can never generate invalid traffic.

1. In AdMob, create the app for Android and iOS and one **Rewarded** ad unit
   each.
2. Copy `.env.example` to `.env.production.local` (git-ignored) and fill in
   all four IDs. It is the single source for every build:

   ```bash
   ADMOB_APP_ID_ANDROID=ca-app-pub-xxxxxxxxxxxxxxxx~aaaaaaaaaa   # AdMob → App settings
   ADMOB_APP_ID_IOS=ca-app-pub-xxxxxxxxxxxxxxxx~bbbbbbbbbb
   VITE_ADMOB_REWARDED_ANDROID=ca-app-pub-xxxxxxxxxxxxxxxx/cccccccccc  # Ad units → Rewarded
   VITE_ADMOB_REWARDED_IOS=ca-app-pub-xxxxxxxxxxxxxxxx/dddddddddd
   ```

   - Android reads the app ID in `app/build.gradle` (an environment variable or
     `-PadmobAppId=…` still overrides the file).
   - iOS: `npm run ios:sync` writes it into `Info.plist` (`GADApplicationIdentifier`).
   - The ad units are compiled into the web bundle by `npm run build`.
   - Only production builds read the file: `npm run dev` always uses test ads.

3. Check before every store build: `npm run release:check`. It fails on a
   missing, malformed or Google test ID, or on IDs from two different AdMob
   accounts. `npm run android:release` and `npm run ios:release` run it first,
   and Gradle refuses a **signed** release whose app ID is the test ID.
   On CI add the secrets `ADMOB_APP_ID_ANDROID` and `ADMOB_REWARDED_ANDROID`.

4. In AdMob → _Privacy & messaging_, create a **GDPR** message (and an
   **IDFA explainer** for iOS). The game shows it via Google's UMP SDK where the
   law requires it, then the iOS tracking prompt. Elsewhere the in-game prompt
   asks once; Settings → Privacy changes it later (or shows _Ad privacy
   options_ in UMP regions).
5. Test on a device with test IDs first; the AdMob console must show your
   test device before you switch to real IDs.

Rewards are granted only on the SDK's reward callback; closing an ad early
returns to the offer without a revive. Requests are non-personalised unless
the player allowed personalised ads.

**In-app purchases**: the game sells nothing for real money yet, so
`IAPProvider.ts` stays an interface. If you add something like "remove ads",
use a store-validated plugin (for example RevenueCat) and declare it in the
store listings and privacy policy.
