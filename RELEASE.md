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
3. Push this folder's repository
   ([kursadsahin0/turkuaz-adalar](https://github.com/kursadsahin0/turkuaz-adalar))
   and set _Settings → Pages → Source_ to **GitHub Actions**.
   `.github/workflows/pages.yml` then publishes it at
   **https://kursadsahin0.github.io/turkuaz-adalar/privacy.html**; use that URL
   in Play Console and App Store Connect. The workflow refuses to publish while any `[…]`
   placeholder is left.

## app-ads.txt (after the Play release)

AdMob checks that the ads in Tidelark are really sold by you through an
`app-ads.txt` file at the root of the **developer website** in the Play
listing. Without it AdMob can limit ad serving. The file is ready in
[`store/app-ads.txt`](store/app-ads.txt):

```
google.com, pub-3498040280017092, DIRECT, f08c47fec0942fa0
```

The privacy page lives under `/turkuaz-adalar/`, which is not a site root, so
use a GitHub user site:

1. Create a public repository named exactly **kursadsahin0.github.io**.
2. Add `store/app-ads.txt` to it as `app-ads.txt` (at the top level), commit
   and push. Pages publishes user sites automatically; check
   https://kursadsahin0.github.io/app-ads.txt shows the line above.
3. In Play Console → Store settings → Store listing contact details, set
   **Website** to `https://kursadsahin0.github.io`.
4. Once the app is live, link it in AdMob (App settings → app store details)
   and use **Apps → app-ads.txt** there to start the check (it can take a
   day).

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

## Usage analytics (optional): where players stop

The game records a player funnel through `Telemetry.track()`:

| Event                                                                                 | When                                     | Main properties                                                          |
| ------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| `first_open`, `app_open`, `session_start`, `session_end`                              | install, launch, foreground/background   | `launches`, `seconds`                                                    |
| `tutorial_start`, `tutorial_step`, `tutorial_complete`, `tutorial_skip`               | first run                                | `step`                                                                   |
| `run_start`                                                                           | every run                                | `level`, `difficulty`, `mechanic`, `chase`                               |
| `crash`                                                                               | every crash (also ones a continue saves) | `level`, `cause` (obstacle id, `wave`, `fall`), `distance`, `progress` % |
| `level_fail`                                                                          | the run ends without the finish line     | same + `continues`; `cause: quit` when left from pause                   |
| `level_complete`, `run_end`                                                           | island finished / any run end            | `stars`, `seconds`, `continues`                                          |
| `continue`, `double_coins`, `purchase`, `level_unlock`, claims, `consent`, ad results | as they happen                           |                                                                          |

Nothing leaves the device until you add a key. To see funnels and retention:

1. Create a free [PostHog Cloud](https://posthog.com) project (**EU** region).
2. Put its _Project API key_ (starts with `phc_`, write-only) in
   `.env.production.local`:

   ```bash
   VITE_ANALYTICS_KEY=phc_...
   VITE_ANALYTICS_HOST=https://eu.i.posthog.com
   ```

3. Rebuild. Events are batched (20 events or every 30 s, and when the app goes
   to the background), kept on the device while offline, and only sent while
   _Send anonymous crash reports and usage data_ is on. They carry a random
   install id, app version and platform; no name, account, device or
   advertising id, and no person profiles are created.

Useful PostHog insights: a funnel `first_open → tutorial_complete →
level_complete (level-1) → … (level-5)`; a trend of `level_fail` broken down by
`level` and `cause`; retention on `app_open`.

## Ads (AdMob)

Three ad formats use AdMob: rewarded ads ("watch an ad to continue", "double
your coins"), an always-on adaptive banner at the bottom of the screen (every
screen and the run controls sit above it, with a 12 px gap) and an occasional
full-screen interstitial when the player leaves an island's summary. The
interstitial is paced by `src/systems/monetization/InterstitialPacing.ts`: not
before the 3rd completed island, then at most every 3rd, never within 3
minutes of the last one or 90 seconds of a rewarded ad. All go through
`@capacitor-community/admob` on Android and iOS; the browser build keeps a
simulated provider. **Every build uses Google's test IDs until you supply
real ones**, so development can never generate invalid traffic.

1. In AdMob, create the app for Android and iOS and one **Rewarded** and one
   **Banner** and one **Interstitial** ad unit each. A store build without a real banner unit shows no
   banner (and `release:check` refuses it).
2. Copy `.env.example` to `.env.production.local` (git-ignored) and fill in
   all four IDs. It is the single source for every build:

   ```bash
   ADMOB_APP_ID_ANDROID=ca-app-pub-xxxxxxxxxxxxxxxx~aaaaaaaaaa   # AdMob → App settings
   ADMOB_APP_ID_IOS=ca-app-pub-xxxxxxxxxxxxxxxx~bbbbbbbbbb
   VITE_ADMOB_REWARDED_ANDROID=ca-app-pub-xxxxxxxxxxxxxxxx/cccccccccc  # Ad units → Rewarded
   VITE_ADMOB_REWARDED_IOS=ca-app-pub-xxxxxxxxxxxxxxxx/dddddddddd
   VITE_ADMOB_BANNER_ANDROID=ca-app-pub-xxxxxxxxxxxxxxxx/eeeeeeeeee     # Ad units → Banner
   VITE_ADMOB_BANNER_IOS=ca-app-pub-xxxxxxxxxxxxxxxx/ffffffffff
   VITE_ADMOB_INTERSTITIAL_ANDROID=ca-app-pub-xxxxxxxxxxxxxxxx/gggggggggg  # Ad units → Interstitial
   VITE_ADMOB_INTERSTITIAL_IOS=ca-app-pub-xxxxxxxxxxxxxxxx/hhhhhhhhhh
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
   On CI add the secrets `ADMOB_APP_ID_ANDROID`, `ADMOB_REWARDED_ANDROID`, `ADMOB_BANNER_ANDROID` and `ADMOB_INTERSTITIAL_ANDROID`.

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

**In-app purchases**: the game sells nothing for real money. If you add
something like "remove ads", use a store-validated plugin (for example
RevenueCat) and declare it in the store listings and privacy policy.
