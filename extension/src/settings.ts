// OpenMonkey for Safari — shared extension settings (v0.5.0).
//
// Single source of truth for `openmonkey.settings.v1` in
// chrome.storage.local. The pages/popup UIs (storage.ts), the
// background (background/index.ts) and the content script all read
// through normaliseSettings() here, so a stored value written by any
// of them — or by the Swift host app via the native sync — means the
// same thing everywhere.
//
// Stored key name for the language preference is `language`
// (values "system" | "zh" | "en"); that name predates v0.5.0 and is
// unchanged.
//
// Native sync contract (shared with the Swift host app, App Group
// keys — see NATIVE_KEY_MAP): the native side wins for the mapped
// keys when its getSettings reply carries a valid value; every other
// key stays local. The web side pushes changes back with the same
// native key names via OM_NATIVE {type: 'setSettings', ...}.

import type { LanguageSetting } from './i18n.js';
export type { LanguageSetting } from './i18n.js';

export type DarkModeSetting = 'auto' | 'light' | 'dark';
export type SmartSearchTrigger = 'prefix' | 'suffix';
export type FileSort = 'timeAsc' | 'timeDesc' | 'name';

/** One smart-search engine: a trigger word plus a URL template
 * containing exactly one {q} placeholder for the URL-encoded query. */
export interface SearchEngine {
  id: string;
  name: string;
  trigger: string;
  url: string;
}

export interface ExtensionSettings {
  globalEnabled: boolean;
  updateCheckIntervalDays: number;
  language: LanguageSetting;
  /** Web dark mode: follow the system, force off, or force on. */
  darkMode: DarkModeSetting;
  /** The Home 暗黑模式 toggle: dark-mode injection applies ONLY
   * when this is true; darkMode above is then just the mode choice
   * (auto = prefers-color-scheme, light = off, dark = force). */
  darkModeEnabled: boolean;
  adFilterEnabled: boolean;
  /** User-added ad-hiding CSS selectors (see features.ts). */
  customAdRules: string[];
  tagModeEnabled: boolean;
  smartSearchEnabled: boolean;
  smartSearchTrigger: SmartSearchTrigger;
  smartSearchEngines: SearchEngine[];
  sniffEnabled: boolean;
  /** The Home 资源管理 toggle: the sniffer only scans/reports
   * media while this is true. Independent of sniffEnabled (the
   * floating button / in-page panel), which defaults off. */
  resourceDetectionEnabled: boolean;
  showSniffButton: boolean;
  longPressSniff: boolean;
  /** The script editor is dark-themed; stored so the host app can
   * show the same preference. (Not present in the v0.4.0 web
   * settings — added in v0.5.0 with the editor's existing behaviour
   * as the default.) */
  darkEditor: boolean;
  /** File/task list sort order (Addons 任务设置: 时间升序 default). */
  fileSort: FileSort;
  /** Whether in-page prompt popups are shown. Stored on the web side;
   * no web UI prompt reads it yet (see the v0.5.0 report). */
  showPromptPopups: boolean;
  /** iCloud sync is owned by the host app; the extension only stores
   * the preference so both sides agree on it. */
  syncEnabled: boolean;
}

/** The default smart-search engines (see features.ts for the same
 * list in pure-logic form). */
export function defaultSearchEngines(): SearchEngine[] {
  return [
    { id: 'baidu', name: 'Baidu', trigger: 'bd', url: 'https://www.baidu.com/s?wd={q}' },
    { id: 'google', name: 'Google', trigger: 'g', url: 'https://www.google.com/search?q={q}' },
    { id: 'bing', name: 'Bing', trigger: 'bing', url: 'https://www.bing.com/search?q={q}' },
  ];
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  globalEnabled: true,
  updateCheckIntervalDays: 1,
  language: 'system',
  darkMode: 'auto',
  darkModeEnabled: false,
  adFilterEnabled: false,
  customAdRules: [],
  tagModeEnabled: false,
  smartSearchEnabled: false,
  smartSearchTrigger: 'prefix',
  smartSearchEngines: defaultSearchEngines(),
  sniffEnabled: false,
  resourceDetectionEnabled: true,
  showSniffButton: true,
  longPressSniff: true,
  darkEditor: true,
  fileSort: 'timeAsc',
  showPromptPopups: true,
  syncEnabled: false,
};

const SETTINGS_KEY = 'openmonkey.settings.v1';
export { SETTINGS_KEY };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normaliseEngines(raw: unknown): SearchEngine[] {
  if (!Array.isArray(raw)) return defaultSearchEngines();
  const engines = raw
    .filter(isRecord)
    .map((e) => ({
      id: typeof e.id === 'string' && e.id ? e.id : '',
      name: typeof e.name === 'string' && e.name ? e.name : '',
      trigger: typeof e.trigger === 'string' ? e.trigger.trim() : '',
      url: typeof e.url === 'string' ? e.url.trim() : '',
    }))
    .filter((e) => e.id && e.name && e.trigger && e.url.includes('{q}'));
  return engines.length > 0 ? engines : defaultSearchEngines();
}

/** Normalise an unknown stored settings value. Unknown/missing keys
 * fall back to the defaults above, so settings written by v0.4.0
 * (which only had globalEnabled / updateCheckIntervalDays /
 * language) migrate cleanly, and a stored value the host app wrote
 * with a newer/older shape never breaks the UIs. */
export function normaliseSettings(raw: unknown): ExtensionSettings {
  const r = isRecord(raw) ? raw : {};
  const customAdRules = Array.isArray(r.customAdRules)
    ? (r.customAdRules as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  return {
    globalEnabled: bool(r.globalEnabled, true),
    updateCheckIntervalDays:
      typeof r.updateCheckIntervalDays === 'number' && r.updateCheckIntervalDays >= 0
        ? r.updateCheckIntervalDays
        : 1,
    language:
      r.language === 'zh' || r.language === 'en' || r.language === 'system'
        ? r.language
        : 'system',
    darkMode:
      r.darkMode === 'auto' || r.darkMode === 'light' || r.darkMode === 'dark'
        ? r.darkMode
        : 'auto',
    darkModeEnabled: bool(r.darkModeEnabled, false),
    adFilterEnabled: bool(r.adFilterEnabled, false),
    customAdRules,
    tagModeEnabled: bool(r.tagModeEnabled, false),
    smartSearchEnabled: bool(r.smartSearchEnabled, false),
    smartSearchTrigger: r.smartSearchTrigger === 'suffix' ? 'suffix' : 'prefix',
    smartSearchEngines: normaliseEngines(r.smartSearchEngines),
    sniffEnabled: bool(r.sniffEnabled, false),
    resourceDetectionEnabled: bool(r.resourceDetectionEnabled, true),
    showSniffButton: bool(r.showSniffButton, true),
    longPressSniff: bool(r.longPressSniff, true),
    darkEditor: bool(r.darkEditor, true),
    fileSort:
      r.fileSort === 'timeDesc' || r.fileSort === 'name' ? r.fileSort : 'timeAsc',
    showPromptPopups: bool(r.showPromptPopups, true),
    syncEnabled: bool(r.syncEnabled, false),
  };
}

// ---------------------------------------------------------------------------
// Native sync mapping (App Group keys <-> settings fields).
//
// The native side sends/receives these exact key names in its
// getSettings / setSettings messages. Values are validated the same
// way as local storage: a wrong-typed native value is ignored, never
// stored.
// ---------------------------------------------------------------------------

/** Native key -> settings field, for the boolean native keys. */
export const NATIVE_BOOL_KEYS: Readonly<Record<string, keyof ExtensionSettings>> = {
  OpenMonkeyGlobalEnabled: 'globalEnabled',
  OpenMonkeyDarkModeEnabled: 'darkModeEnabled',
  OpenMonkeyAdFilterEnabled: 'adFilterEnabled',
  OpenMonkeyTagModeEnabled: 'tagModeEnabled',
  OpenMonkeySmartSearchEnabled: 'smartSearchEnabled',
  OpenMonkeySniffEnabled: 'sniffEnabled',
  OpenMonkeyResourceDetectionEnabled: 'resourceDetectionEnabled',
  OpenMonkeyShowSniffButton: 'showSniffButton',
  OpenMonkeyLongPressSniff: 'longPressSniff',
};

/** Settings field -> native key, for pushing web-side changes to the
 * native side. String-valued keys (language, dark mode, trigger)
 * are included here; booleans come from NATIVE_BOOL_KEYS above. */
export const SETTINGS_TO_NATIVE_KEY: Readonly<Partial<Record<keyof ExtensionSettings, string>>> = {
  globalEnabled: 'OpenMonkeyGlobalEnabled',
  language: 'OpenMonkeyLanguage',
  darkMode: 'OpenMonkeyDarkMode',
  darkModeEnabled: 'OpenMonkeyDarkModeEnabled',
  adFilterEnabled: 'OpenMonkeyAdFilterEnabled',
  tagModeEnabled: 'OpenMonkeyTagModeEnabled',
  smartSearchEnabled: 'OpenMonkeySmartSearchEnabled',
  smartSearchTrigger: 'OpenMonkeySmartSearchTrigger',
  sniffEnabled: 'OpenMonkeySniffEnabled',
  resourceDetectionEnabled: 'OpenMonkeyResourceDetectionEnabled',
  showSniffButton: 'OpenMonkeyShowSniffButton',
  longPressSniff: 'OpenMonkeyLongPressSniff',
};

/**
 * Merge a native getSettings reply into local settings. Pure and
 * exported for tests. Native wins for every key it carries with a
 * valid value; updateCheckIntervalDays, customAdRules and
 * smartSearchEngines are never clobbered (the native app does not
 * own them); a native error reply (ok: false) or a non-object reply
 * leaves the local settings untouched.
 */
export function mergeNativeSettings(
  local: ExtensionSettings,
  native: unknown,
): ExtensionSettings {
  if (!isRecord(native)) return { ...local, smartSearchEngines: [...local.smartSearchEngines], customAdRules: [...local.customAdRules] };
  if (native.ok === false) return { ...local, smartSearchEngines: [...local.smartSearchEngines], customAdRules: [...local.customAdRules] };
  const merged: ExtensionSettings = {
    ...local,
    smartSearchEngines: [...local.smartSearchEngines],
    customAdRules: [...local.customAdRules],
  };
  // Prefer the OpenMonkey* App Group key names; also accept the
  // camelCase names the native getSettings reply used in v0.4.0
  // (globalEnabled / language), so an older host app still syncs.
  const pick = (nativeKey: string, camelKey: string): unknown =>
    native[nativeKey] !== undefined ? native[nativeKey] : native[camelKey];
  for (const [nativeKey, field] of Object.entries(NATIVE_BOOL_KEYS)) {
    const camelKey = String(field);
    if (typeof pick(nativeKey, camelKey) === 'boolean') {
      (merged as unknown as Record<string, unknown>)[field] = pick(nativeKey, camelKey);
    }
  }
  const language = pick('OpenMonkeyLanguage', 'language');
  if (language === 'zh' || language === 'en' || language === 'system') {
    merged.language = language;
  }
  const darkMode = pick('OpenMonkeyDarkMode', 'darkMode');
  if (darkMode === 'auto' || darkMode === 'light' || darkMode === 'dark') {
    merged.darkMode = darkMode;
  }
  const trigger = pick('OpenMonkeySmartSearchTrigger', 'smartSearchTrigger');
  if (trigger === 'prefix' || trigger === 'suffix') {
    merged.smartSearchTrigger = trigger;
  }
  return merged;
}
