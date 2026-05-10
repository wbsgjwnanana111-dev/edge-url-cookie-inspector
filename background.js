const UNSUPPORTED_SCHEMES = [
  "chrome:",
  "edge:",
  "about:",
  "devtools:",
  "chrome-extension:",
  "moz-extension:"
];

function isReadableUrl(url) {
  if (!url) return false;
  return !UNSUPPORTED_SCHEMES.some((scheme) => url.startsWith(scheme));
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function readCookiesForUrl(url) {
  if (!isReadableUrl(url)) return [];
  return chrome.cookies.getAll({ url });
}

async function buildSnapshot(tab = null) {
  const activeTab = tab || (await getActiveTab());
  const url = activeTab?.url || "";
  const cookies = await readCookiesForUrl(url);

  return {
    tabId: activeTab?.id ?? null,
    title: activeTab?.title || "",
    url,
    readable: isReadableUrl(url),
    cookies,
    updatedAt: new Date().toISOString()
  };
}

async function storeSnapshot(tab = null) {
  const snapshot = await buildSnapshot(tab);
  await chrome.storage.local.set({ latestSnapshot: snapshot });
  return snapshot;
}

chrome.runtime.onInstalled.addListener(() => {
  storeSnapshot().catch(console.error);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await storeSnapshot(tab);
  } catch (error) {
    console.error("Failed to refresh snapshot after tab activation", error);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!tab.active || !changeInfo.url && changeInfo.status !== "complete") return;

  try {
    await storeSnapshot(tab);
  } catch (error) {
    console.error("Failed to refresh snapshot after tab update", error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_ACTIVE_TAB_SNAPSHOT") return false;

  buildSnapshot()
    .then((snapshot) => sendResponse({ ok: true, snapshot }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
