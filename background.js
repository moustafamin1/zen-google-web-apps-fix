const TARGET_PATTERNS = [
  "*://chat.google.com/*",
  "*://antigravity.google.com/*",
  "*://mail.google.com/chat/*",
  "*://*.googleusercontent.com/*"
];

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// 1. Intercept and prevent redirect loops to /download
browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.url.includes("/download")) {
      if (details.url.includes("antigravity.google.com")) {
        return { redirectUrl: "https://antigravity.google.com/" };
      }
      return { redirectUrl: "https://chat.google.com/u/1/" };
    }
  },
  {
    urls: [
      "*://chat.google.com/download*",
      "*://antigravity.google.com/download*"
    ]
  },
  ["blocking"]
);

// 2. Spoof Chrome User-Agent and Client Hints headers on outgoing requests
browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    let hasSecChUa = false;
    for (let header of details.requestHeaders) {
      const name = header.name.toLowerCase();
      if (name === "user-agent") {
        header.value = CHROME_UA;
      }
      if (name === "sec-ch-ua") {
        header.value = '"Chromium";v="131", "Google Chrome";v="131", "Not_A Brand";v="24"';
        hasSecChUa = true;
      }
    }
    if (!hasSecChUa) {
      details.requestHeaders.push({
        name: "Sec-CH-UA",
        value: '"Chromium";v="131", "Google Chrome";v="131", "Not_A Brand";v="24"'
      });
      details.requestHeaders.push({ name: "Sec-CH-UA-Mobile", value: "?0" });
      details.requestHeaders.push({ name: "Sec-CH-UA-Platform", value: '"macOS"' });
    }
    return { requestHeaders: details.requestHeaders };
  },
  { urls: TARGET_PATTERNS },
  ["blocking", "requestHeaders"]
);

// 3. Relax CSP on target pages so the in-page polyfill executes cleanly
browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    const responseHeaders = details.responseHeaders.filter(
      (header) => !header.name.toLowerCase().includes("content-security-policy")
    );
    return { responseHeaders };
  },
  { urls: TARGET_PATTERNS },
  ["blocking", "responseHeaders"]
);
