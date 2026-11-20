// OpenMonkey for Safari — background (service worker) entry point.
//
// Wires chrome.runtime messaging and a daily chrome.alarms update check.
// Every chrome.* access is guarded by `typeof chrome !== 'undefined'` (and
// per-API existence checks), so this module also loads safely outside an
// extension context — in that case initBackground() is a no-op and the
// exported handleOmMessage() can still be exercised directly.

// The chrome global is declared once, project-wide, in
// extension/src/chrome.d.ts (ambient `any`); this file only ever reads it
// behind `typeof chrome !== 'undefined'` guards.

import { parseUserScript } from '../parser/metablock.js';
import { matchesIncludeExclude } from '../matcher/matcher.js';
import { createRegistry, type Registry } from './registry.js';
import { checkForUpdate } from './updater.js';
import { toNativeResources } from '../features.js';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  mergeNativeSettings,
  normaliseSettings,
  type ExtensionSettings,
} from '../settings.js';
import type { MediaItem } from '../features.js';

export type { ExtensionSettings } from '../settings.js';
export { mergeNativeSettings } from '../settings.js';

export type OmMessage =
  | { type: 'OM_GET_MATCHING_SCRIPTS'; url: string }
  | { type: 'OM_INSTALL_SCRIPT'; source: string; sourceUrl?: string }
  | { type: 'OM_CHECK_UPDATES' }
  | { type: 'OM_GM_GET_VALUES'; scriptId: string }
  | { type: 'OM_GM_SET_VALUE'; scriptId: string; name: string; value: unknown }
  | { type: 'OM_GM_DELETE_VALUE'; scriptId: string; name: string }
  | { type: 'OM_SET_SETTINGS'; settings: { globalEnabled?: unknown; updateCheckIntervalDays?: unknown } }
  | { type: 'OM_SYNC_NATIVE_SETTINGS' }
  | { type: 'OM_REPORT_RESOURCES'; url: string; items: MediaItem[] }
  | { type: 'OM_NATIVE'; payload: unknown };

export const DAILY_UPDATE_ALARM = 'om-daily-update-check';
export const NATIVE_HOST = 'com.openmonkey.native';

export interface BackgroundDeps {
  registry: Registry;
  fetchImpl?: typeof fetch;
  /** Called with a native-host response, or an error string, for OM_NATIVE. */
  onNativeResponse?: (response: unknown) => void;
}

function isOmMessage(value: unknown): value is OmMessage {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === 'OM_GET_MATCHING_SCRIPTS' ||
    type === 'OM_INSTALL_SCRIPT' ||
    type === 'OM_CHECK_UPDATES' ||
    type === 'OM_GM_GET_VALUES' ||
    type === 'OM_GM_SET_VALUE' ||
    type === 'OM_GM_DELETE_VALUE' ||
    type === 'OM_SET_SETTINGS' ||
    type === 'OM_SYNC_NATIVE_SETTINGS' ||
    type === 'OM_REPORT_RESOURCES' ||
    type === 'OM_NATIVE'
  );
}

/**
 * Extension settings as stored by the dashboard/popup
 * (`openmonkey.settings.v1` in chrome.storage.local; see
 * src/pages/storage.ts and src/settings.ts, the single source of
 * truth for the shape, defaults and native mapping). The background
 * reads them to gate injection, size the update alarm, and apply
 * the v0.5.0 page features (ad filter, dark mode, tag mode,
 * sniffing) in the content scripts.
 */
const FALLBACK_SETTINGS: ExtensionSettings = { ...DEFAULT_SETTINGS };

function readSettings(): Promise<ExtensionSettings> {
  const fallback: ExtensionSettings = { ...FALLBACK_SETTINGS };
  if (
    typeof chrome === 'undefined' ||
    typeof chrome.storage === 'undefined' ||
    typeof chrome.storage.local === 'undefined' ||
    typeof chrome.storage.local.get !== 'function'
  ) {
    return Promise.resolve(fallback);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), 500);
    try {
      const maybePromise = chrome.storage.local.get(
        SETTINGS_KEY,
        (items: Record<string, unknown>) => {
          clearTimeout(timer);
          resolve(normaliseSettings(items?.[SETTINGS_KEY]));
        },
      ) as unknown;
      if (maybePromise && typeof (maybePromise as { then?: unknown }).then === 'function') {
        (maybePromise as Promise<Record<string, unknown>>).then(
          (items) => {
            clearTimeout(timer);
            resolve(normaliseSettings(items?.[SETTINGS_KEY]));
          },
          () => {
            clearTimeout(timer);
            resolve(fallback);
          },
        );
      }
    } catch {
      clearTimeout(timer);
      resolve(fallback);
    }
  });
}

/** Persist settings to chrome.storage.local; best-effort, never throws. */
function writeSettings(settings: ExtensionSettings): Promise<void> {
  if (
    typeof chrome === 'undefined' ||
    typeof chrome.storage === 'undefined' ||
    typeof chrome.storage.local === 'undefined' ||
    typeof chrome.storage.local.set !== 'function'
  ) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), 500);
    try {
      const maybePromise = chrome.storage.local.set(
        { [SETTINGS_KEY]: settings },
        () => {
          clearTimeout(timer);
          resolve();
        },
      ) as unknown;
      if (maybePromise && typeof (maybePromise as { then?: unknown }).then === 'function') {
        (maybePromise as Promise<void>).then(
          () => {
            clearTimeout(timer);
            resolve();
          },
          () => {
            clearTimeout(timer);
            resolve();
          },
        );
      }
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

// ---------------------------------------------------------------------------
// Native settings sync (shared contract with the Swift host app).
//
// App Group suite group.com.openmonkey.safari keys (see
// src/settings.ts NATIVE_BOOL_KEYS / SETTINGS_TO_NATIVE_KEY):
//   OpenMonkeyGlobalEnabled, OpenMonkeyLanguage,
//   OpenMonkeyDarkMode, OpenMonkeyAdFilterEnabled,
//   OpenMonkeyTagModeEnabled, OpenMonkeySmartSearchEnabled,
//   OpenMonkeySmartSearchTrigger, OpenMonkeySniffEnabled,
//   OpenMonkeyShowSniffButton, OpenMonkeyLongPressSniff
// Native messages (via chrome.runtime.sendNativeMessage, host
// 'com.openmonkey.native'):
//   {"type": "getSettings"} -> {"ok": true, ...native keys...}
//   {"type": "setSettings", <native keys>} -> {"ok": true}
//
// The merge itself lives in src/settings.ts (mergeNativeSettings):
// native wins for every key it carries with a valid value;
// updateCheckIntervalDays, customAdRules and smartSearchEngines are
// never clobbered (the native app does not own them). The web side
// queries the native side on background init and whenever a UI asks
// (OM_SYNC_NATIVE_SETTINGS). Every failure — no native messaging, a
// native error, a timeout — is silent: local values are kept and
// the merged/local settings are returned.
// ---------------------------------------------------------------------------

/** Ask the native side for its settings; null on any failure/timeout. */
function queryNativeSettings(timeoutMs = 1500): Promise<unknown> {
  return new Promise((resolve) => {
    if (
      typeof chrome === 'undefined' ||
      typeof chrome.runtime === 'undefined' ||
      typeof chrome.runtime.sendNativeMessage !== 'function'
    ) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST,
        { type: 'getSettings' },
        (response: unknown) => {
          clearTimeout(timer);
          const err = chrome.runtime.lastError as { message: string } | undefined;
          if (err) resolve(null);
          else resolve(response ?? null);
        },
      );
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/**
 * Query the native side for settings and merge the result into
 * chrome.storage.local (native wins for globalEnabled and language).
 * Never throws; on any failure the local settings are returned
 * unchanged. The merged settings are returned so a UI caller can
 * re-render from them.
 */
export async function syncNativeSettings(): Promise<ExtensionSettings> {
  const local = await readSettings();
  try {
    const native = await queryNativeSettings();
    if (native === null) return local;
    const merged = mergeNativeSettings(local, native);
    if (JSON.stringify(merged) !== JSON.stringify(local)) {
      await writeSettings(merged);
    }
    return merged;
  } catch {
    return local;
  }
}

/** Persist a media snapshot reported by a content script's sniffer.
 * The tab id comes from the message sender (a content script cannot
 * know its own tab id); when there is no sender, tabId is 0.
 *
 * Two deliveries, both best-effort:
 *   1. Native: sendNativeMessage {type: 'reportResources',
 *      resources: [{url, title?, type, pageURL?, detectedAt?}]}
 *      to the host app, which stores them under the shared key
 *      openmonkey.resources.v1. detectedAt is a Unix timestamp
 *      (seconds); the native side normalises it to ISO-8601.
 *   2. Storage fallback: the same snapshot is written to
 *      chrome.storage.local under openmonkey.resources.v1 (dual
 *      shape — the legacy {tabId, url, items} list plus the native
 *      {resources} list) so the popup/dashboard can show it even
 *      when native messaging is unavailable. */
async function storeResources(
  url: string,
  items: MediaItem[],
  tabId: number,
): Promise<void> {
  const resources = toNativeResources(items, url);
  if (
    typeof chrome !== 'undefined' &&
    typeof chrome.runtime !== 'undefined' &&
    typeof chrome.runtime.sendNativeMessage === 'function'
  ) {
    try {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST,
        { type: 'reportResources', resources },
        () => undefined,
      );
    } catch {
      // The storage fallback below still runs.
    }
  }
  if (
    typeof chrome === 'undefined' ||
    typeof chrome.storage === 'undefined' ||
    typeof chrome.storage.local === 'undefined' ||
    typeof chrome.storage.local.set !== 'function'
  ) {
    return;
  }
  const snapshot = { tabId, url, items, resources };
  try {
    const maybePromise = chrome.storage.local.set(
      { 'openmonkey.resources.v1': snapshot },
      () => undefined,
    ) as unknown;
    if (maybePromise && typeof (maybePromise as { then?: unknown }).then === 'function') {
      await (maybePromise as Promise<void>).catch(() => undefined);
    }
  } catch {
    // Best-effort; a failed write must not break messaging.
  }
}

/**
 * Tell every open tab to re-read the feature settings (ad filter,
 * dark mode, tag mode, sniffing). Fired when the settings object
 * changes in storage — whether the change came from the popup, the
 * dashboard, or the native host app. Content scripts also listen to
 * chrome.storage.onChanged directly, so this broadcast is a second
 * path, not the only one. Best-effort and silent on failure.
 */
function broadcastFeaturesChanged(): void {
  if (
    typeof chrome === 'undefined' ||
    typeof chrome.tabs === 'undefined' ||
    typeof chrome.tabs.query !== 'function' ||
    typeof chrome.tabs.sendMessage !== 'function'
  ) {
    return;
  }
  try {
    const maybePromise = chrome.tabs.query({}, (tabs: Array<{ id?: number }>) => {
      for (const tab of tabs ?? []) {
        if (typeof tab.id !== 'number') continue;
        try {
          chrome.tabs.sendMessage(tab.id, { type: 'OM_FEATURES_CHANGED' }, () => undefined);
        } catch {
          // One tab failing must not stop the rest.
        }
      }
    }) as unknown;
    if (maybePromise && typeof (maybePromise as { then?: unknown }).then === 'function') {
      (maybePromise as Promise<Array<{ id?: number }>>).then(
        (tabs) => {
          for (const tab of tabs ?? []) {
            if (typeof tab.id !== 'number') continue;
            try {
              chrome.tabs.sendMessage(tab.id, { type: 'OM_FEATURES_CHANGED' }, () => undefined);
            } catch {
              // One tab failing must not stop the rest.
            }
          }
        },
        () => undefined,
      );
    }
  } catch {
    // Best-effort only.
  }
}

/** (Re)create the periodic update-check alarm for the given interval. */
function scheduleUpdateAlarm(intervalDays: number): void {
  if (typeof chrome === 'undefined' || typeof chrome.alarms === 'undefined') return;
  try {
    chrome.alarms.clear(DAILY_UPDATE_ALARM);
    if (intervalDays > 0) {
      chrome.alarms.create(DAILY_UPDATE_ALARM, { periodInMinutes: intervalDays * 24 * 60 });
    }
  } catch {
    // Alarms are best-effort; a failure must not break messaging.
  }
}

/**
 * Handle one extension message. Pure with respect to chrome except for
 * OM_NATIVE (native messaging), OM_GET_MATCHING_SCRIPTS (reads the
 * global-injection setting from chrome.storage.local),
 * OM_SYNC_NATIVE_SETTINGS (queries the native side and merges its
 * settings into storage), and OM_SET_SETTINGS (rebuilds the
 * chrome.alarms update alarm). Returns a plain JSON-able response
 * object; throws are converted to `{ ok: false, error }` by the
 * caller-facing wrapper below.
 */
export async function handleOmMessage(
  message: OmMessage,
  deps: BackgroundDeps,
  sender?: { tab?: { id?: number } },
): Promise<Record<string, unknown>> {
  switch (message.type) {
    case 'OM_GET_MATCHING_SCRIPTS': {
      const settings = await readSettings();
      const scripts = await deps.registry.listScripts();
      const matching = settings.globalEnabled
        ? scripts.filter(
            (s) => s.enabled && matchesIncludeExclude(s.metadata, message.url),
          )
        : [];
      return {
        ok: true,
        globalEnabled: settings.globalEnabled,
        scripts: matching.map((s) => ({
          id: s.id,
          metadata: s.metadata,
          source: s.source,
        })),
      };
    }

    case 'OM_INSTALL_SCRIPT': {
      const parsed = parseUserScript(message.source);
      if (parsed.errors.length > 0) {
        return { ok: false, error: parsed.errors.join(' ') };
      }
      const saved = await deps.registry.saveScript({
        metadata: parsed.metadata,
        source: parsed.source,
      });
      return { ok: true, id: saved.id, warnings: parsed.warnings };
    }

    case 'OM_GM_GET_VALUES': {
      return { ok: true, values: await deps.registry.getGMValues(message.scriptId) };
    }

    case 'OM_GM_SET_VALUE': {
      await deps.registry.setGMValue(message.scriptId, message.name, message.value);
      return { ok: true };
    }

    case 'OM_GM_DELETE_VALUE': {
      await deps.registry.deleteGMValue(message.scriptId, message.name);
      return { ok: true };
    }

    case 'OM_CHECK_UPDATES': {
      const fetchImpl = deps.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
      if (!fetchImpl) return { ok: false, error: 'fetch is not available.' };
      const scripts = await deps.registry.listScripts();
      const results: Record<string, unknown>[] = [];
      for (const script of scripts) {
        if (!script.enabled) continue;
        const result = await checkForUpdate(script, fetchImpl);
        results.push({ id: script.id, name: script.metadata.name, ...result });
      }
      return { ok: true, results };
    }

    case 'OM_SET_SETTINGS': {
      // The caller (dashboard / popup) already persisted the settings
      // through storage.ts; this message only nudges the background to
      // rebuild the periodic update-check alarm for the new interval
      // (0 days = no alarm). The global switch itself is read from
      // storage on every OM_GET_MATCHING_SCRIPTS, so it needs no nudge.
      const raw = message.settings ?? {};
      const interval =
        typeof raw.updateCheckIntervalDays === 'number' && raw.updateCheckIntervalDays >= 0
          ? raw.updateCheckIntervalDays
          : 1;
      scheduleUpdateAlarm(interval);
      return { ok: true };
    }

    case 'OM_SYNC_NATIVE_SETTINGS': {
      // Best-effort pull of the native host app's settings into
      // chrome.storage.local (native wins for the keys it carries;
      // failures keep the local values). Returns the merged settings
      // so the calling UI can re-render from them.
      const settings = await syncNativeSettings();
      return { ok: true, settings };
    }

    case 'OM_REPORT_RESOURCES': {
      // The content script's sniffer reports the media it found on
      // its page; the background stamps it with the sender's tab id
      // and stores it under openmonkey.resources.v1 for the
      // dashboard / host app to read.
      const items = Array.isArray(message.items) ? message.items : [];
      await storeResources(
        typeof message.url === 'string' ? message.url : '',
        items,
        typeof sender?.tab?.id === 'number' ? sender.tab.id : 0,
      );
      return { ok: true };
    }

    case 'OM_NATIVE': {
      if (
        typeof chrome === 'undefined' ||
        typeof chrome.runtime === 'undefined' ||
        typeof chrome.runtime.sendNativeMessage !== 'function'
      ) {
        return { ok: false, error: 'Native messaging is unavailable in this environment.' };
      }
      const payload = message.payload as { host?: unknown; message?: unknown } | null;
      const host =
        payload !== null && typeof payload === 'object' && typeof payload.host === 'string'
          ? payload.host
          : NATIVE_HOST;
      const nativeMessage =
        payload !== null && typeof payload === 'object' && 'message' in payload
          ? payload.message
          : message.payload;
      return new Promise((resolve) => {
        chrome.runtime.sendNativeMessage(host, nativeMessage, (response: unknown) => {
          const err = chrome.runtime.lastError as { message: string } | undefined;
          if (err) resolve({ ok: false, error: err.message });
          else resolve({ ok: true, response });
        });
      });
    }

    default:
      return { ok: false, error: 'Unknown message type.' };
  }
}

/** Register the runtime message listener and the daily update alarm. */
export function initBackground(deps?: Partial<BackgroundDeps>): void {
  const registry = deps?.registry ?? createRegistry();
  const fullDeps: BackgroundDeps = {
    registry,
    fetchImpl: deps?.fetchImpl,
    onNativeResponse: deps?.onNativeResponse,
  };

  if (typeof chrome === 'undefined' || typeof chrome.runtime === 'undefined') {
    return;
  }

  chrome.runtime.onMessage.addListener(
    (message: unknown, sender: { tab?: { id?: number } }, sendResponse: (response: unknown) => void) => {
    if (!isOmMessage(message)) {
      sendResponse({ ok: false, error: 'Unknown message type.' });
      return false;
    }
    handleOmMessage(message, fullDeps, sender)
      .then((response) => sendResponse(response))
      .catch((err: unknown) => {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    // Async response: keep the message channel open.
    return true;
  });

  // Best-effort native settings sync on start: if the host app changed
  // a setting while the extension was closed, pick it up now. Silent
  // on every failure (see syncNativeSettings).
  void syncNativeSettings();

  // When the settings object (or the tag rules) change in storage,
  // tell every tab to re-apply the page features. Content scripts
  // also watch storage.onChanged directly; this is the second path.
  if (
    typeof chrome.storage !== 'undefined' &&
    typeof chrome.storage.onChanged !== 'undefined' &&
    typeof chrome.storage.onChanged.addListener === 'function'
  ) {
    try {
      chrome.storage.onChanged.addListener(
        (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
          if (areaName !== 'local') return;
          if (changes['openmonkey.settings.v1'] || changes['openmonkey.tagRules.v1']) {
            broadcastFeaturesChanged();
          }
        },
      );
    } catch {
      // Best-effort only.
    }
  }

  // Periodic update check (guarded: Safari may not expose chrome.alarms).
  // The interval comes from the stored settings; the alarm is rebuilt
  // whenever the dashboard saves new settings (OM_SET_SETTINGS).
  if (typeof chrome.alarms !== 'undefined') {
    void readSettings().then((settings) => {
      scheduleUpdateAlarm(settings.updateCheckIntervalDays);
    });
    chrome.alarms.onAlarm.addListener((alarm: { name: string }) => {
      if (alarm.name !== DAILY_UPDATE_ALARM) return;
      void handleOmMessage({ type: 'OM_CHECK_UPDATES' }, fullDeps).catch(() => {
        // Update checks are best-effort; failures are silent by design.
      });
    });
  }
}

// Start automatically when loaded as the extension background page/worker.
initBackground();
