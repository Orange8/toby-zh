import {
  applyCommand,
  initialData,
  parseBackup,
  STORAGE_KEY,
  type AppData,
  type Command,
} from "./model.ts";

export type LocalStorageAdapter = {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

export class LocalStore {
  private queue: Promise<unknown> = Promise.resolve();
  private storage: LocalStorageAdapter;

  constructor(storage: LocalStorageAdapter) {
    this.storage = storage;
  }

  read(command?: Command): Promise<AppData> {
    // Serialize reads and writes across management pages. Always read the latest
    // persisted document; a failed write must not become the next operation's state.
    const result = this.queue.then(async () => {
      const stored = (await this.storage.get(STORAGE_KEY))[STORAGE_KEY];
      let data = stored === undefined ? initialData() : parseBackup(stored);
      if (command) data = applyCommand(data, command);
      if (
        stored === undefined ||
        (stored as AppData).schemaVersion !== data.schemaVersion ||
        command
      )
        await this.storage.set({ [STORAGE_KEY]: data });
      return data;
    });
    this.queue = result.catch(() => undefined);
    return result;
  }
}
