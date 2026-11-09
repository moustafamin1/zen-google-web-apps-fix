# Zen Google Web Apps Fix

A WebExtension for **Zen Browser** (and Firefox-based browsers) that resolves compatibility, audio recording, media layout, and redirect issues on **Google Chat** and **Antigravity**.

---

## 🚀 Problems Solved

1. **OAuth Redirect Loop to `/download/`:**
   - Intercepts requests destined for `/download/` on `chat.google.com` and `antigravity.google.com`.
   - Spoofs Chromium Client Hints (`Sec-CH-UA`, `Sec-CH-UA-Platform`, `Sec-CH-UA-Mobile`) and User-Agent headers to prevent Google OAuth background iframes from failing silent token re-authentication.

2. **Compose Bar Voice/Video Recording Menu:**
   - Polyfills `MediaRecorder.isTypeSupported` so Google Chat unhides the recording menu.
   - Rejects unsupported MP4/AAC streams to ensure Google Chat selects `audio/webm;codecs=opus`.

3. **Audio Duration & WebM Playback (`0:00 / 0:00` fix):**
   - Inlines `fix-webm-duration` to patch missing EBML `Duration` and `TimecodeScale` metadata headers before delivering recorded WebM blobs to Google's speech recognition / playback player.

4. **Multi-Image Attachment Collage Collapse ([Webcompat #239340](https://webcompat.com/issues/239340)):**
   - Fixes Gecko's intrinsic grid width calculation bug where multi-image attachment collages (`ul.rTjn0e[data-cell-count]`) collapse into a 4px line in the message stream.
   - Enforces minimum width and height constraints so screenshots and photos render inline.

---

## 🛠️ Project Structure

- `manifest.json`: Manifest V2 extension descriptor.
- `background.js`: Network-level interceptors (`onBeforeRequest`, `onBeforeSendHeaders`, `onHeadersReceived`).
- `build.js`: Compiler script that bundles polyfills and inlines `fix-webm-duration.js` into `content.js`.
- `content.js`: Main-world script injector that executes directly in the page realm without Xray wrapper interference.
- `fix-webm-duration.js`: Upstream EBML patching library by Yury Sitnikov.
- `zen-google-fix.xpi`: Packed, installable extension bundle.

---

## 📦 Building and Packaging

Run the build script with Node.js:

```bash
node build.js
zip -u zen-google-fix.xpi manifest.json background.js content.js
```

---

## 🔧 Installation in Zen Browser

1. Open `about:addons` in Zen Browser.
2. Click the gear icon (**⚙️**) -> **Install Add-on From File...**.
3. Select `zen-google-fix.xpi`.
4. Reload Google Chat.
