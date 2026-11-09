const fs = require("fs");
const fixWebmDurationCode = fs.readFileSync("/Users/moustafa/zen-gchat-fix/fix-webm-duration.js", "utf8");

const inPageScript = `
(function() {
  try {
    const CHROME_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    const CHROME_VENDOR = "Google Inc.";
    const CHROME_APP_VERSION = "5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

    // 1. Navigator spoofing in the page's own realm (no Xray wrappers)
    try {
      const navProto = Navigator.prototype;
      Object.defineProperty(navProto, "userAgent", { get: () => CHROME_UA, configurable: true });
      Object.defineProperty(navProto, "appVersion", { get: () => CHROME_APP_VERSION, configurable: true });
      Object.defineProperty(navProto, "vendor", { get: () => CHROME_VENDOR, configurable: true });
      Object.defineProperty(navProto, "userAgentData", {
        get: () => ({
          brands: [{ brand: "Chromium", version: "131" }, { brand: "Google Chrome", version: "131" }, { brand: "Not_A Brand", version: "24" }],
          mobile: false,
          platform: "macOS",
          getHighEntropyValues: () => Promise.resolve({ platform: "macOS" })
        }),
        configurable: true
      });
    } catch (e) {}

    // 2. Permissions API polyfill for microphone/camera
    if (navigator.permissions && navigator.permissions.query) {
      const _origQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = function(desc) {
        if (desc && (desc.name === "microphone" || desc.name === "camera")) {
          return Promise.resolve({ state: "granted", name: desc.name, onchange: null });
        }
        return _origQuery(desc);
      };
    }

    // 3. WebKit audio aliases and window.chrome stub
    window.webkitAudioContext = window.webkitAudioContext || window.AudioContext;
    window.webkitOfflineAudioContext = window.webkitOfflineAudioContext || window.OfflineAudioContext;
    window.chrome = window.chrome || { app: { isInstalled: false } };

    // 4. Embed fix-webm-duration (Firefox WebM output lacks a Duration header)
    ${fixWebmDurationCode}
    if (typeof ysFixWebmDuration !== "undefined" && !window.ysFixWebmDuration) {
      window.ysFixWebmDuration = ysFixWebmDuration;
    }

    // 5. MediaRecorder: force WebM Opus and inject duration before handing blob to the page
    const OrigMediaRecorder = window.MediaRecorder;
    if (OrigMediaRecorder) {
      class RobustMediaRecorder extends OrigMediaRecorder {
        constructor(stream, options) {
          let safeOptions = options;
          if (options && options.mimeType) {
            if (!OrigMediaRecorder.isTypeSupported(options.mimeType) || options.mimeType.includes("mp4") || options.mimeType.includes("aac")) {
              safeOptions = Object.assign({}, options, { mimeType: "audio/webm;codecs=opus" });
            }
          }
          super(stream, safeOptions);

          let startTime = 0;
          let activeDuration = 0;
          let pendingFixPromise = null;

          const origStart = this.start.bind(this);
          this.start = () => {
            startTime = Date.now();
            return origStart();
          };

          const origStop = this.stop.bind(this);
          this.stop = () => {
            if (startTime > 0) {
              activeDuration = Math.max(Date.now() - startTime, 1000);
            }
            return origStop();
          };

          const listeners = { dataavailable: [], stop: [] };
          const origAddEventListener = this.addEventListener.bind(this);
          const origRemoveEventListener = this.removeEventListener.bind(this);

          this.addEventListener = (type, listener, opts) => {
            if (type === "dataavailable" || type === "stop") {
              listeners[type].push(listener);
              return;
            }
            return origAddEventListener(type, listener, opts);
          };

          this.removeEventListener = (type, listener, opts) => {
            if (type === "dataavailable" || type === "stop") {
              listeners[type] = listeners[type].filter(l => l !== listener);
              return;
            }
            return origRemoveEventListener(type, listener, opts);
          };

          let ondataHandler = null;
          let onstopHandler = null;
          Object.defineProperty(this, "ondataavailable", {
            get: () => ondataHandler,
            set: (fn) => { ondataHandler = fn; }
          });
          Object.defineProperty(this, "onstop", {
            get: () => onstopHandler,
            set: (fn) => { onstopHandler = fn; }
          });

          origAddEventListener("dataavailable", (e) => {
            const duration = activeDuration || (startTime > 0 ? Math.max(Date.now() - startTime, 1000) : 1000);

            const processData = async () => {
              let eventToDispatch = e;
              if (e.data && e.data.size > 0 && typeof window.ysFixWebmDuration === "function") {
                try {
                  const fixedBlob = await window.ysFixWebmDuration(e.data, duration, { logger: false });
                  try {
                    eventToDispatch = new BlobEvent("dataavailable", { data: fixedBlob, timecode: e.timecode });
                  } catch (err) {
                    eventToDispatch = Object.create(e, { data: { value: fixedBlob } });
                  }
                  try {
                    Object.defineProperty(eventToDispatch, "target", { value: this, configurable: true });
                    Object.defineProperty(eventToDispatch, "currentTarget", { value: this, configurable: true });
                  } catch (_) {}
                } catch (fixErr) {}
              }

              if (ondataHandler) {
                try { ondataHandler.call(this, eventToDispatch); } catch (err) { console.error(err); }
              }
              listeners.dataavailable.forEach(fn => {
                try { fn.call(this, eventToDispatch); } catch (err) { console.error(err); }
              });
            };

            pendingFixPromise = processData();
          });

          origAddEventListener("stop", async (e) => {
            if (pendingFixPromise) {
              try { await pendingFixPromise; } catch (_) {}
              pendingFixPromise = null;
            }
            setTimeout(() => {
              if (onstopHandler) {
                try { onstopHandler.call(this, e); } catch (err) { console.error(err); }
              }
              listeners.stop.forEach(fn => {
                try { fn.call(this, e); } catch (err) { console.error(err); }
              });
            }, 10);
          });
        }
      }

      RobustMediaRecorder.isTypeSupported = function(mime) {
        if (typeof mime === "string") {
          if (mime.startsWith("audio/") && (mime.includes("mp4") || mime.includes("aac"))) {
            return false;
          }
          if (mime.startsWith("video/") || mime.startsWith("audio/")) {
            return true;
          }
        }
        return OrigMediaRecorder.isTypeSupported(mime);
      };

      window.MediaRecorder = RobustMediaRecorder;
    }

    // 6. Mozilla Webcompat #239340 Fix: Google Chat Image Grid Intrinsic Width 0 Bug in Gecko
    try {
      const fixStyle = document.createElement("style");
      fixStyle.textContent = [
        "/* Fix Webcompat #239340: Force definite width on Google Chat media grid */",
        "ul.rTjn0e,",
        "ul[data-cell-count],",
        "div.kwI9i,",
        "div.QPe6Ge {",
        "  min-width: 330px !important;",
        "  min-height: 180px !important;",
        "  width: auto !important;",
        "}",
        "ul.rTjn0e > li,",
        "ul[data-cell-count] > li {",
        "  min-width: 150px !important;",
        "  min-height: 150px !important;",
        "}",
        "ul.rTjn0e img,",
        "ul[data-cell-count] img {",
        "  min-width: 100% !important;",
        "  min-height: 100% !important;",
        "  object-fit: cover !important;",
        "  display: block !important;",
        "}"
      ].join("\\n");
      (document.head || document.documentElement).appendChild(fixStyle);
    } catch(e) {}
  } catch(e) {
    console.error("[Zen-GChat-Fix] Main-world injection error:", e);
  }
})();
`;

const contentScript = `// Inject main-world polyfills for Google Chat / Antigravity on Zen
(function () {
  try {
    const inlineScript = document.createElement("script");
    inlineScript.textContent = ${JSON.stringify(inPageScript)};
    (document.head || document.documentElement).prepend(inlineScript);
    inlineScript.remove();
  } catch (e) {}
})();
`;

fs.writeFileSync("/Users/moustafa/zen-gchat-fix/content.js", contentScript, "utf8");
console.log("content.js generated. Size:", contentScript.length);
