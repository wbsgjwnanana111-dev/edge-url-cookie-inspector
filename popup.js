const statusEl = document.querySelector("#status");
const urlOutput = document.querySelector("#urlOutput");
const cookieOutput = document.querySelector("#cookieOutput");
const cookieCount = document.querySelector("#cookieCount");
const refreshButton = document.querySelector("#refreshButton");
const copyUrlButton = document.querySelector("#copyUrlButton");
const copyCookiesButton = document.querySelector("#copyCookiesButton");

let latestSnapshot = null;

function setStatus(text) {
  statusEl.textContent = text;
}

function formatCookies(cookies) {
  return JSON.stringify(
    cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      session: cookie.session,
      expirationDate: cookie.expirationDate
    })),
    null,
    2
  );
}

function render(snapshot) {
  latestSnapshot = snapshot;
  urlOutput.value = snapshot.url || "";
  cookieCount.textContent = String(snapshot.cookies.length);
  cookieOutput.textContent = formatCookies(snapshot.cookies);

  if (!snapshot.url) {
    setStatus("没有可读取的活动标签。");
  } else if (!snapshot.readable) {
    setStatus("Edge 内置页面或扩展页面无法读取。");
  } else {
    setStatus(`已更新：${new Date(snapshot.updatedAt).toLocaleString()}`);
  }
}

async function getSnapshot() {
  setStatus("正在读取当前标签...");

  const response = await chrome.runtime.sendMessage({
    type: "GET_ACTIVE_TAB_SNAPSHOT"
  });

  if (!response?.ok) {
    throw new Error(response?.error || "读取失败");
  }

  render(response.snapshot);
}

async function copyText(text, doneMessage) {
  await navigator.clipboard.writeText(text);
  setStatus(doneMessage);
}

refreshButton.addEventListener("click", () => {
  getSnapshot().catch((error) => setStatus(error.message));
});

copyUrlButton.addEventListener("click", () => {
  copyText(latestSnapshot?.url || "", "URL 已复制。").catch((error) =>
    setStatus(error.message)
  );
});

copyCookiesButton.addEventListener("click", () => {
  copyText(formatCookies(latestSnapshot?.cookies || []), "Cookies JSON 已复制。").catch(
    (error) => setStatus(error.message)
  );
});

getSnapshot().catch((error) => setStatus(error.message));
