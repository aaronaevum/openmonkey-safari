// OpenMonkey for Safari — script registry.
// In-memory + chrome.storage.local-backed storage of installed userscripts.
// The storage adapter interface lets this run with no chrome APIs at all
// (unit tests, non-extension hosts) by falling back to an in-memory Map.

import type { UserScriptMetadata } from '../parser/metablock.js';

export interface StoredScript {
  id: string;
  metadata: UserScriptMetadata;
  source: string;
  enabled: boolean;
  installedAt: number;
  updatedAt: number;
  lastError?: string;
  userModified: boolean;
}

/** Minimal async key/value storage. chrome.storage.local is adapted to it. */
export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

const SCRIPT_KEY_PREFIX = 'om:script:';
const VALUES_KEY_PREFIX = 'om:values:';
const INDEX_KEY = 'om:script-index';

/** Deterministic, stable id for a script: a hash of namespace + name. */
export function scriptId(name: string, namespace: string): string {
  const input = `${namespace}\0${name}`;
  // FNV-1a 32-bit hash, rendered as 8 hex digits — stable across runs.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `om-${hash.toString(16).padStart(8, '0')}`;
}

export function createInMemoryStorageAdapter(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    async get(key) {
      return map.has(key) ? map.get(key) as string : null;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
    async keys() {
      return [...map.keys()];
    },
  };
}

/**
 * Adapter over chrome.storage.local. Returns null (and is never used) when
 * the chrome APIs are absent; callers should fall back to the in-memory
 * adapter in that case.
 */
export function createChromeStorageAdapter(): StorageAdapter | null {
  if (
    typeof chrome === 'undefined' ||
    typeof chrome.storage === 'undefined' ||
    typeof chrome.storage.local === 'undefined'
  ) {
    return null;
  }
  const local = chrome.storage.local;
  return {
    get(key: string): Promise<string | null> {
      return new Promise((resolve) => {
        local.get(key, (items: Record<string, unknown>) => {
          const v = items[key];
          resolve(typeof v === 'string' ? v : null);
        });
      });
    },
    set(key: string, value: string): Promise<void> {
      return new Promise((resolve) => {
        local.set({ [key]: value }, () => resolve());
      });
    },
    remove(key: string): Promise<void> {
      return new Promise((resolve) => {
        local.remove(key, () => resolve());
      });
    },
    keys(): Promise<string[]> {
      return new Promise((resolve) => {
        local.get(null, (items: Record<string, unknown>) => {
          resolve(Object.keys(items));
        });
      });
    },
  };
}

export interface Registry {
  saveScript(input: SaveScriptInput): Promise<StoredScript>;
  getScript(id: string): Promise<StoredScript | null>;
  listScripts(): Promise<StoredScript[]>;
  removeScript(id: string): Promise<boolean>;
  setEnabled(id: string, enabled: boolean): Promise<StoredScript | null>;
  markUserModified(id: string, modified?: boolean): Promise<StoredScript | null>;
  /**
   * Persistent per-script GM values (GM_setValue / GM_getValue).
   * Stored as one JSON object per script under `om:values:<id>`, so values
   * survive navigation, reload and extension restart, and scripts cannot
   * read each other's values. Only JSON-serialisable values persist;
   * `undefined` deletes the key.
   */
  getGMValues(id: string): Promise<Record<string, unknown>>;
  setGMValue(id: string, name: string, value: unknown): Promise<void>;
  deleteGMValue(id: string, name: string): Promise<void>;
}

export type SaveScriptInput = {
  metadata: UserScriptMetadata;
  source: string;
  enabled?: boolean;
  userModified?: boolean;
  lastError?: string;
} & Partial<Pick<StoredScript, 'id' | 'installedAt' | 'updatedAt'>>;

function scriptKey(id: string): string {
  return SCRIPT_KEY_PREFIX + id;
}

function valuesKey(id: string): string {
  return VALUES_KEY_PREFIX + id;
}

function parseValues(raw: string | null): Record<string, unknown> {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseStored(raw: string | null): StoredScript | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as StoredScript;
  } catch {
    return null;
  }
}

export function createRegistry(storage?: StorageAdapter): Registry {
  const store: StorageAdapter = storage ?? createChromeStorageAdapter() ?? createInMemoryStorageAdapter();

  async function readIndex(): Promise<string[]> {
    const raw = await store.get(INDEX_KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }

  async function writeIndex(ids: string[]): Promise<void> {
    await store.set(INDEX_KEY, JSON.stringify(ids));
  }

  async function writeScript(script: StoredScript): Promise<void> {
    await store.set(scriptKey(script.id), JSON.stringify(script));
    const ids = await readIndex();
    if (!ids.includes(script.id)) {
      ids.push(script.id);
      await writeIndex(ids);
    }
  }

  return {
    async saveScript(input: SaveScriptInput): Promise<StoredScript> {
      const id = input.id ?? scriptId(input.metadata.name, input.metadata.namespace);
      const now = Date.now();
      const existing = await parseStored(await store.get(scriptKey(id)));
      const script: StoredScript = {
        id,
        metadata: input.metadata,
        source: input.source,
        // Preserve the existing enabled flag on re-install unless the
        // caller explicitly passes one.
        enabled: input.enabled ?? existing?.enabled ?? true,
        installedAt: input.installedAt ?? existing?.installedAt ?? now,
        updatedAt: input.updatedAt ?? now,
        userModified: input.userModified ?? existing?.userModified ?? false,
        ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
      };
      await writeScript(script);
      return script;
    },

    async getScript(id: string): Promise<StoredScript | null> {
      return parseStored(await store.get(scriptKey(id)));
    },

    async listScripts(): Promise<StoredScript[]> {
      const ids = await readIndex();
      const out: StoredScript[] = [];
      for (const id of ids) {
        const s = parseStored(await store.get(scriptKey(id)));
        if (s) out.push(s);
      }
      // Deterministic order: by name, then namespace.
      out.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
      return out;
    },

    async removeScript(id: string): Promise<boolean> {
      const existing = await parseStored(await store.get(scriptKey(id)));
      if (!existing) return false;
      await store.remove(scriptKey(id));
      await store.remove(valuesKey(id));
      const ids = (await readIndex()).filter((x) => x !== id);
      await writeIndex(ids);
      return true;
    },

    async getGMValues(id: string): Promise<Record<string, unknown>> {
      return parseValues(await store.get(valuesKey(id)));
    },

    async setGMValue(id: string, name: string, value: unknown): Promise<void> {
      const values = parseValues(await store.get(valuesKey(id)));
      if (value === undefined) delete values[name];
      else values[name] = value;
      await store.set(valuesKey(id), JSON.stringify(values));
    },

    async deleteGMValue(id: string, name: string): Promise<void> {
      const values = parseValues(await store.get(valuesKey(id)));
      if (name in values) {
        delete values[name];
        await store.set(valuesKey(id), JSON.stringify(values));
      }
    },

    async setEnabled(id: string, enabled: boolean): Promise<StoredScript | null> {
      const existing = await parseStored(await store.get(scriptKey(id)));
      if (!existing) return null;
      const updated: StoredScript = { ...existing, enabled, updatedAt: Date.now() };
      await writeScript(updated);
      return updated;
    },

    async markUserModified(id: string, modified = true): Promise<StoredScript | null> {
      const existing = await parseStored(await store.get(scriptKey(id)));
      if (!existing) return null;
      const updated: StoredScript = {
        ...existing,
        userModified: modified,
        updatedAt: Date.now(),
      };
      await writeScript(updated);
      return updated;
    },
  };
}
