import {
  applyCommand,
  initialData,
  parseBackup,
  STORAGE_KEY,
  type AppData,
  type Command,
  type LinkInput,
} from "./model";

export const isExtension = Boolean(globalThis.chrome?.runtime?.id);
export type OpenTab = LinkInput & { id: number; pinned: boolean };
const HIDDEN_TAB_PREFIX = "toby-hidden-tab-";

export async function hideSavedTab(tab: OpenTab) {
  if (!isExtension) return;
  // Session storage is shared by management pages and cleared on browser exit.
  // Each tab has its own key, so concurrent drags cannot overwrite one another.
  await chrome.storage.session.set({ [HIDDEN_TAB_PREFIX + tab.id]: tab.url });
}

export function faviconUrl(pageUrl: string): string | undefined {
  try {
    const page = new URL(pageUrl);
    if (!["http:", "https:"].includes(page.protocol)) return undefined;
    if (isExtension) {
      const favicon = new URL(chrome.runtime.getURL("/_favicon/"));
      favicon.searchParams.set("pageUrl", page.href);
      favicon.searchParams.set("size", "32");
      return favicon.href;
    }
    // Preview pages cannot access Chrome's icon cache; use the site's own icon.
    const favicon = new URL("/favicon.ico", page.origin);
    // Separate these image requests from the browser's cached favicon lookups.
    favicon.searchParams.set("local-toby", "1");
    return favicon.href;
  } catch {
    return undefined;
  }
}

async function request(command?: Command): Promise<AppData> {
  if (isExtension) {
    const response = await chrome.runtime.sendMessage({
      channel: "local-toby",
      command,
    });
    if (!response?.ok)
      throw new Error(response?.error || "后台未响应，请在扩展管理页重新加载");
    return response.data;
  }
  return navigator.locks.request(STORAGE_KEY, () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    let data = stored ? parseBackup(JSON.parse(stored)) : initialData();
    if (command) data = applyCommand(data, command);
    if (
      !stored ||
      JSON.parse(stored).schemaVersion !== data.schemaVersion ||
      command
    )
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return data;
  });
}

export const readData = () => request();
export const mutate = (command: Command) => request(command);

export function subscribe(callback: (data: AppData) => void): () => void {
  if (isExtension) {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && changes[STORAGE_KEY]?.newValue)
        callback(parseBackup(changes[STORAGE_KEY].newValue));
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
  const listener = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        callback(parseBackup(JSON.parse(event.newValue)));
      } catch {
        /* Preserve last readable state. */
      }
    }
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

export async function queryTabs(): Promise<OpenTab[]> {
  if (!isExtension) return [];
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const hidden = await chrome.storage.session.get(
    tabs.map((t) => HIDDEN_TAB_PREFIX + t.id),
  );
  return tabs
    .filter(
      (t) =>
        t.id !== undefined &&
        /^https?:\/\//i.test(t.url || "") &&
        !t.incognito &&
        hidden[HIDDEN_TAB_PREFIX + t.id] !== t.url,
    )
    .map((t) => ({
      id: t.id!,
      title: (t.title || new URL(t.url!).hostname).slice(0, 120),
      url: t.url!,
      pinned: t.pinned,
    }));
}

export function observeTabs(callback: () => void) {
  if (!isExtension) return () => {};
  const visibilityChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (
      area === "session" &&
      Object.keys(changes).some((key) => key.startsWith(HIDDEN_TAB_PREFIX))
    )
      callback();
  };
  chrome.storage.onChanged.addListener(visibilityChanged);
  chrome.tabs.onCreated.addListener(callback);
  chrome.tabs.onRemoved.addListener(callback);
  chrome.tabs.onUpdated.addListener(callback);
  chrome.tabs.onMoved.addListener(callback);
  chrome.tabs.onAttached.addListener(callback);
  chrome.tabs.onDetached.addListener(callback);
  return () => {
    chrome.storage.onChanged.removeListener(visibilityChanged);
    chrome.tabs.onCreated.removeListener(callback);
    chrome.tabs.onRemoved.removeListener(callback);
    chrome.tabs.onUpdated.removeListener(callback);
    chrome.tabs.onMoved.removeListener(callback);
    chrome.tabs.onAttached.removeListener(callback);
    chrome.tabs.onDetached.removeListener(callback);
  };
}

export async function openLinks(urls: string[], newWindow = false) {
  if (!urls.length) return;
  if (isExtension) {
    if (newWindow) await chrome.windows.create({ url: urls });
    else
      for (const url of urls) await chrome.tabs.create({ url, active: false });
  } else {
    for (const url of urls) window.open(url, "_blank", "noopener,noreferrer");
  }
}

export async function closeSavedTabs(tabs: OpenTab[]) {
  if (!isExtension) return;
  const failures: number[] = [];
  for (const tab of tabs) {
    try {
      const current = await chrome.tabs.get(tab.id);
      // A tab can navigate or become pinned during a save. Never close that changed tab.
      if (current.url === tab.url && !current.pinned)
        await chrome.tabs.remove(tab.id);
    } catch {
      failures.push(tab.id);
    }
  }
  if (failures.length)
    throw new Error("链接已保存；部分标签已变化或关闭，请检查浏览器标签栏");
}
