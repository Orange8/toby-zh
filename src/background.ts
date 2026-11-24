import { LocalStore } from "./local-store";

const store = new LocalStore(chrome.storage.local);

// A reopened or navigated tab is a new item for the rail, even at the same URL.
chrome.tabs.onRemoved.addListener((id) => {
  void chrome.storage.session
    .remove(`toby-hidden-tab-${id}`)
    .catch(console.error);
});
chrome.tabs.onUpdated.addListener((id, changes) => {
  if (changes.url)
    void chrome.storage.session
      .remove(`toby-hidden-tab-${id}`)
      .catch(console.error);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.channel !== "local-toby")
    return;
  store
    .read(message.command)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "数据操作失败",
      }),
    );
  return true;
});

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL("newtab.html") });
});
