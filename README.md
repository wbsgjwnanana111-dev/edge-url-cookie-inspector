# URL Cookie Inspector

一个适用于 Microsoft Edge 的 Manifest V3 扩展，用来读取当前活动标签页的 URL 和该 URL 可见的 cookies。

## 安装到 Edge

1. 打开 `edge://extensions/`。
2. 开启“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择本项目目录：`C:\Users\MR\Documents\New project 5`。
5. 打开任意普通网页，点击扩展图标查看 URL 和 cookies。

## 关键实现

- `chrome.tabs.query({ active: true, currentWindow: true })` 获取当前标签。
- `chrome.cookies.getAll({ url })` 获取该 URL 下的 cookies。
- `tabs.onActivated` 和 `tabs.onUpdated` 在切换标签、页面加载完成或 URL 变化时刷新快照。

## 注意事项

- `edge://`、`chrome://`、扩展页面、开发者工具页面等浏览器内置页面不能被扩展读取。
- 读取 cookies 需要 `cookies` 权限和对应站点的 `host_permissions`。
- 当前示例使用 `<all_urls>` 便于开发调试；正式发布时建议改成你的业务域名，例如 `https://example.com/*`。
- cookie 属于敏感数据，请只在用户明确授权、合法合规的场景使用。
