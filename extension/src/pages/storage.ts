// OpenMonkey for Safari — shared script storage.
//
// Single source of truth for how the popup and the dashboard persist
// scripts. Preference order:
//   1. chrome.storage.local when the extension API is present.
//   2. localStorage fallback (plain web page / demo mode / tests).
// The fallback uses the same JSON shape, so data survives the switch
// between the two backends. Nothing here imports the parser, the
// matcher, or the registry, so it can be used by every UI entry point.

export type ScriptType = 'userscript' | 'userstyle';
/** A script as stored by OpenMonkey (userscript or userstyle). */
export interface StoredScript {
  /** Stable id: "<name>@<namespace>" when known, else a generated id. */
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage: string;
  updateURL: string;
  /** 'userscript' for a .user.js script, 'userstyle' for a CSS userstyle. */
  type: ScriptType;
  /** Full source as installed, metadata block included. */
  code: string;
  enabled: boolean;
  /** Parsed metadata, stored verbatim for the detail panel. */
  metadata: Record<string, unknown>;
  /** @match / @include patterns, flattened for quick display. */
  matches: string[];
  /** @grant values, for the detail panel. */
  grants: string[];
  createdAt: number;
  updatedAt: number;
  /** ISO timestamp of the last run reported by the content script, if any. */
  lastRun: string | null;
  /** Last error message reported by the content script, if any. */
  lastError: string | null;
}

/** True when the Chrome/Safari extension storage API is available. */
export function chromeStorageAvailable(): boolean {
  try {
    return (
      typeof chrome !== 'undefined' &&
      chrome !== null &&
      typeof chrome.storage !== 'undefined' &&
      typeof chrome.storage.local !== 'undefined' &&
      typeof chrome.storage.local.get === 'function'
    );
  } catch {
    return false;
  }
}

/** True when the Chrome/Safari extension API is present at all. */
export function chromeAvailable(): boolean {
  try {
    return typeof chrome !== 'undefined' && chrome !== null && typeof chrome.runtime !== 'undefined';
  } catch {
    return false;
  }
}

/** Localised UI string with an English fallback when chrome.i18n is absent. */
export function i18n(key: string, fallback: string): string {
  try {
    if (typeof chrome !== 'undefined' && chrome?.i18n?.getMessage) {
      const value = chrome.i18n.getMessage(key) as string;
      if (value) return value;
    }
  } catch {
    // Fall through to the fallback literal.
  }
  return fallback;
}

const LOCAL_STORAGE_KEY = 'openmonkey.scripts.v1';
const CHROME_STORAGE_KEY = 'scripts';

/** Generate a short random id (used only when name/namespace are missing). */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `script-${crypto.randomUUID()}`;
  }
  return `script-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** Build the stable id for a script from its name and namespace. */
export function scriptIdFor(name: string, namespace: string): string {
  const cleanName = (name || 'unnamed').trim();
  const cleanNamespace = (namespace || '').trim();
  return cleanNamespace ? `${cleanName}@${cleanNamespace}` : cleanName;
}

/** Normalise an unknown stored value into a StoredScript, or null.
 *
 * Accepts both shapes in the codebase:
 *   - this helper's own array shape ({id, name, version, code, ...}), and
 *   - the registry's shape ({id, metadata, source, enabled, installedAt,
 *     updatedAt, lastError}) from ../background/registry.js.
 * Missing display fields are derived from the parsed metadata, and a
 * userstyle is recognised by a ==UserStyle== block in its source. */
export function normaliseScript(raw: unknown): StoredScript | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const metadata =
    r.metadata && typeof r.metadata === 'object'
      ? (r.metadata as Record<string, unknown>)
      : {};
  const metaList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  const name =
    typeof r.name === 'string' && r.name
      ? r.name
      : typeof metadata.name === 'string' && metadata.name
        ? metadata.name
        : 'Unnamed script';
  const code = typeof r.code === 'string' ? r.code : typeof r.source === 'string' ? r.source : '';
  const type: ScriptType =
    r.type === 'userstyle' || code.includes('==UserStyle==') ? 'userstyle' : 'userscript';
  const now = Date.now();
  return {
    id:
      typeof r.id === 'string' && r.id
        ? r.id
        : scriptIdFor(name, typeof metadata.namespace === 'string' ? metadata.namespace : ''),
    name,
    version: typeof r.version === 'string' ? r.version : typeof metadata.version === 'string' ? metadata.version : '',
    description:
      typeof r.description === 'string' ? r.description : typeof metadata.description === 'string' ? metadata.description : '',
    author: typeof r.author === 'string' ? r.author : typeof metadata.author === 'string' ? metadata.author : '',
    homepage: typeof r.homepage === 'string' ? r.homepage : typeof metadata.homepage === 'string' ? metadata.homepage : '',
    updateURL: typeof r.updateURL === 'string' ? r.updateURL : typeof metadata.updateURL === 'string' ? metadata.updateURL : '',
    type,
    code,
    enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
    metadata,
    matches: Array.isArray(r.matches)
      ? (r.matches as unknown[]).filter((m): m is string => typeof m === 'string')
      : [...metaList(metadata.match), ...metaList(metadata.include)],
    grants: Array.isArray(r.grants)
      ? (r.grants as unknown[]).filter((g): g is string => typeof g === 'string')
      : metaList(metadata.grant),
    createdAt:
      typeof r.createdAt === 'number' ? r.createdAt : typeof r.installedAt === 'number' ? r.installedAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
    lastRun: typeof r.lastRun === 'string' ? r.lastRun : null,
    lastError: typeof r.lastError === 'string' ? r.lastError : null,
  };
}

async function readFromChrome(): Promise<StoredScript[]> {
  const result = await chromeStorageGet(CHROME_STORAGE_KEY);
  const raw = result[CHROME_STORAGE_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.map(normaliseScript).filter((s): s is StoredScript => s !== null);
}

/**
 * chrome.storage.local.get, Safari-safe: Safari's WebExtension storage
 * is callback-based (see the registry's createChromeStorageAdapter),
 * while Chromium also offers a promise form. Call with a callback and,
 * if a promise is returned as well, honour whichever settles first.
 */
function chromeStorageGet(key: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    try {
      const maybePromise = chrome.storage.local.get(key, (items: Record<string, unknown>) => {
        resolve(items ?? {});
      }) as unknown;
      if (maybePromise && typeof (maybePromise as { then?: unknown }).then === 'function') {
        (maybePromise as Promise<Record<string, unknown>>).then(
          (items) => resolve(items ?? {}),
          () => resolve({}),
        );
      }
    } catch {
      resolve({});
    }
  });
}

function chromeStorageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    try {
      const maybePromise = chrome.storage.local.set(items, () => resolve()) as unknown;
      if (maybePromise && typeof (maybePromise as { then?: unknown }).then === 'function') {
        (maybePromise as Promise<void>).then(
          () => resolve(),
          () => resolve(),
        );
      }
    } catch {
      resolve();
    }
  });
}

function readFromLocalStorage(): StoredScript[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normaliseScript).filter((s): s is StoredScript => s !== null);
  } catch {
    return [];
  }
}

async function writeToChrome(scripts: StoredScript[]): Promise<void> {
  await chromeStorageSet({ [CHROME_STORAGE_KEY]: scripts });
}

function writeToLocalStorage(scripts: StoredScript[]): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(scripts));
}

/** Load every stored script, newest first by updatedAt. */
export async function loadScripts(): Promise<StoredScript[]> {
  const scripts = chromeStorageAvailable() ? await readFromChrome() : readFromLocalStorage();
  return scripts.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Persist the whole script list (replaces the stored list). */
export async function saveScripts(scripts: StoredScript[]): Promise<void> {
  if (chromeStorageAvailable()) await writeToChrome(scripts);
  else writeToLocalStorage(scripts);
}

/** Insert or replace one script by id, updating its updatedAt stamp. */
export async function saveScript(script: StoredScript): Promise<StoredScript> {
  const scripts = await loadScripts();
  const next: StoredScript = { ...script, updatedAt: Date.now() };
  const index = scripts.findIndex((s) => s.id === next.id);
  if (index >= 0) scripts[index] = next;
  else scripts.unshift(next);
  await saveScripts(scripts);
  return next;
}

/** Fetch one script by id, or null when it is not stored. */
export async function getScript(id: string): Promise<StoredScript | null> {
  const scripts = await loadScripts();
  return scripts.find((s) => s.id === id) ?? null;
}

/** Remove one script by id. Returns true when a script was removed. */
export async function removeScript(id: string): Promise<boolean> {
  const scripts = await loadScripts();
  const kept = scripts.filter((s) => s.id !== id);
  if (kept.length === scripts.length) return false;
  await saveScripts(kept);
  return true;
}

/** Flip one script's enabled flag. Returns the updated script, or null. */
export async function setEnabled(id: string, enabled: boolean): Promise<StoredScript | null> {
  const scripts = await loadScripts();
  const script = scripts.find((s) => s.id === id);
  if (!script) return null;
  script.enabled = enabled;
  script.updatedAt = Date.now();
  await saveScripts(scripts);
  return script;
}

// Extension-wide settings (global injection switch, update interval,
// UI language, plus the v0.5.0 page features — see src/settings.ts,
// the single source of truth for the shape, defaults and native
// mapping; this file only owns the persistence).
export type {
  DarkModeSetting,
  ExtensionSettings,
  FileSort,
  LanguageSetting,
  SearchEngine,
  SmartSearchTrigger,
} from '../settings.js';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY as SHARED_SETTINGS_KEY,
  SETTINGS_TO_NATIVE_KEY,
  normaliseSettings,
  type ExtensionSettings,
} from '../settings.js';
export { DEFAULT_SETTINGS, normaliseSettings };

const SETTINGS_STORAGE_KEY = SHARED_SETTINGS_KEY;
const SETTINGS_LOCAL_KEY = 'openmonkey.settings.v1';

/** Native host for settings sync (see the shared contract in
 * docs/ui-redesign.md §8 and src/background/index.ts). */
export const NATIVE_HOST = 'com.openmonkey.native';

/** Load settings, falling back to defaults when nothing is stored. */
export async function getSettings(): Promise<ExtensionSettings> {
  if (chromeStorageAvailable()) {
    const result = await chromeStorageGet(SETTINGS_STORAGE_KEY);
    const raw = result[SETTINGS_STORAGE_KEY];
    if (raw !== undefined) return normaliseSettings(raw);
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(SETTINGS_LOCAL_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normaliseSettings(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persist settings (replaces the stored settings object). */
export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  const next = normaliseSettings(settings);
  if (chromeStorageAvailable()) {
    await chromeStorageSet({ [SETTINGS_STORAGE_KEY]: next });
  } else {
    try {
      localStorage.setItem(SETTINGS_LOCAL_KEY, JSON.stringify(next));
    } catch {
      // Demo-mode storage may be unavailable; settings simply do not persist.
    }
  }
}

/**
 * Best-effort push of changed settings to the native host app, via
 * the background's OM_NATIVE passthrough (host com.openmonkey.native,
 * message {type: 'setSettings', ...}). Only the keys present in
 * `values` are written on the native side, translated to the native
 * key names (see SETTINGS_TO_NATIVE_KEY in settings.ts). Failures
 * (no extension API, no native messaging, native error, timeout)
 * are silent by design — the local settings are already saved; the
 * native side re-syncs from storage on its next launch.
 */
export async function pushSettingsToNative(
  values: Partial<ExtensionSettings>,
): Promise<void> {
  if (!chromeAvailable() || typeof chrome.runtime?.sendMessage !== 'function') return;
  const nativeValues: Record<string, unknown> = {};
  for (const [field, nativeKey] of Object.entries(SETTINGS_TO_NATIVE_KEY)) {
    const value = (values as Record<string, unknown>)[field];
    if (value !== undefined) nativeValues[nativeKey] = value;
  }
  if (Object.keys(nativeValues).length === 0) return;
  try {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 1500);
      try {
        chrome.runtime.sendMessage(
          {
            type: 'OM_NATIVE',
            payload: {
              host: NATIVE_HOST,
              message: { type: 'setSettings', ...nativeValues },
            },
          },
          () => {
            clearTimeout(timer);
            resolve();
          },
        );
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  } catch {
    // Silent by design (see above).
  }
}

/** Seed the localStorage fallback with two demo scripts (demo mode only). */
export function seedDemoScripts(): StoredScript[] {
  const now = Date.now();
  const demo: StoredScript[] = [
    {
      id: 'Demo: highlight links@example.com',
      name: 'Demo: highlight links',
      version: '1.0.0',
      description: 'Demo script shown when the extension API is unavailable.',
      author: 'OpenMonkey',
      homepage: '',
      updateURL: '',
      type: 'userscript',
      code: '// ==UserScript==\n// @name Demo: highlight links\n// @version 1.0.0\n// @match *://example.com/*\n// ==/UserScript==\n\ndocument.querySelectorAll("a").forEach((a) => { a.style.background = "yellow"; });\n',
      enabled: true,
      metadata: { name: 'Demo: highlight links', version: '1.0.0', match: ['*://example.com/*'] },
      matches: ['*://example.com/*'],
      grants: [],
      createdAt: now,
      updatedAt: now,
      lastRun: null,
      lastError: null,
    },
    {
      id: 'Demo: dark reader (userstyle)@example.com',
      name: 'Demo: dark reader (userstyle)',
      version: '1.0.0',
      description: 'Demo userstyle shown when the extension API is unavailable.',
      author: 'OpenMonkey',
      homepage: '',
      updateURL: '',
      type: 'userstyle',
      code: '/* ==UserStyle==\n@name Demo: dark reader (userstyle)\n@version 1.0.0\n@match *://example.com/*\n==/UserStyle== */\n\nbody { background: #111 !important; color: #eee !important; }\n',
      enabled: false,
      metadata: { name: 'Demo: dark reader (userstyle)', version: '1.0.0', match: ['*://example.com/*'] },
      matches: ['*://example.com/*'],
      grants: [],
      createdAt: now,
      updatedAt: now,
      lastRun: null,
      lastError: null,
    },
  ];
  writeToLocalStorage(demo);
  return demo;
}

// ---------------------------------------------------------------------------
// Per-site tag rules (`openmonkey.tagRules.v1`) and the media list
// (`openmonkey.resources.v1`).
//
// Tag rules map a host to the selectors the user tapped to hide on
// that host. The media list is written by the content script's
// sniffer (one entry: the tab it was scanned from) and read by the
// dashboard and the host app. Both use the same chrome.storage.local
// / localStorage fallback as the scripts list.
// ---------------------------------------------------------------------------

import type { TagRules } from '../features.js';
import type { MediaItem } from '../features.js';

export type { TagRules, MediaItem } from '../features.js';

export const TAG_RULES_KEY = 'openmonkey.tagRules.v1';
export const RESOURCES_KEY = 'openmonkey.resources.v1';

export interface ResourcesSnapshot {
  tabId: number;
  url: string;
  items: MediaItem[];
}

function normaliseTagRules(raw: unknown): TagRules {
  if (!raw || typeof raw !== 'object') return {};
  const out: TagRules = {};
  for (const [host, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const selectors = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    if (selectors.length > 0) out[host] = selectors;
  }
  return out;
}

function normaliseResources(raw: unknown): ResourcesSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  // Legacy shape: {tabId, url, items: [{url, type, size?}]}.
  // Native shape (written by the host app / the reportResources
  // fallback): {resources: [{url, title?, type, pageURL?,
  // detectedAt?}]}. Both are accepted; items wins when both exist.
  let items: MediaItem[] = [];
  if (Array.isArray(r.items)) {
    items = (r.items as unknown[])
      .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
      .map((i) => ({
        url: typeof i.url === 'string' ? i.url : '',
        type: (i.type === 'video' || i.type === 'audio' || i.type === 'manifest'
          ? i.type
          : 'other') as MediaItem['type'],
        ...(typeof i.size === 'number' ? { size: i.size } : {}),
      }))
      .filter((i) => i.url.length > 0);
  } else if (Array.isArray(r.resources)) {
    items = (r.resources as unknown[])
      .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
      .map((i) => ({
        url: typeof i.url === 'string' ? i.url : '',
        type: (i.type === 'video' || i.type === 'audio' || i.type === 'manifest'
          ? i.type
          : 'other') as MediaItem['type'],
      }))
      .filter((i) => i.url.length > 0);
  }
  const url =
    typeof r.url === 'string'
      ? r.url
      : typeof r.pageURL === 'string'
        ? r.pageURL
        : Array.isArray(r.resources) &&
            r.resources.length > 0 &&
            typeof (r.resources[0] as Record<string, unknown>).pageURL === 'string'
          ? ((r.resources[0] as Record<string, unknown>).pageURL as string)
          : '';
  if (!url && items.length === 0) return null;
  return {
    tabId: typeof r.tabId === 'number' ? r.tabId : 0,
    url,
    items,
  };
}

/** Load the per-site tag rules ({} when nothing is stored). */
export async function getTagRules(): Promise<TagRules> {
  if (chromeStorageAvailable()) {
    const result = await chromeStorageGet(TAG_RULES_KEY);
    return normaliseTagRules(result[TAG_RULES_KEY]);
  }
  try {
    const raw = localStorage.getItem(TAG_RULES_KEY);
    if (!raw) return {};
    return normaliseTagRules(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

/** Persist the per-site tag rules (replaces the stored object). */
export async function saveTagRules(rules: TagRules): Promise<void> {
  const next = normaliseTagRules(rules);
  if (chromeStorageAvailable()) {
    await chromeStorageSet({ [TAG_RULES_KEY]: next });
  } else {
    try {
      localStorage.setItem(TAG_RULES_KEY, JSON.stringify(next));
    } catch {
      // Demo-mode storage may be unavailable; rules simply do not persist.
    }
  }
}

/** Load the latest media snapshot the sniffer wrote (null if none). */
export async function getResources(): Promise<ResourcesSnapshot | null> {
  if (chromeStorageAvailable()) {
    const result = await chromeStorageGet(RESOURCES_KEY);
    return normaliseResources(result[RESOURCES_KEY]);
  }
  try {
    const raw = localStorage.getItem(RESOURCES_KEY);
    if (!raw) return null;
    return normaliseResources(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Persist a media snapshot (used by the content script via the
 * background's OM_REPORT_RESOURCES, and by tests/demo code). */
export async function saveResources(snapshot: ResourcesSnapshot): Promise<void> {
  const next = normaliseResources(snapshot);
  if (!next) return;
  if (chromeStorageAvailable()) {
    await chromeStorageSet({ [RESOURCES_KEY]: next });
  } else {
    try {
      localStorage.setItem(RESOURCES_KEY, JSON.stringify(next));
    } catch {
      // Demo-mode storage may be unavailable.
    }
  }
}
