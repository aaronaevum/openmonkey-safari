// OpenMonkey for Safari — content-script entry point.
//
// Wires the loader to chrome.runtime messaging (all chrome.* access
// guarded), injects matching scripts into the page world at their
// @run-at time, answers GM bridge calls from the page world via the
// GM factory, and re-matches scripts on SPA navigations.

import { parseUserScript } from '../parser/metablock.js';
import { createGM, type GMContext } from '../gm/gm.js';
import {
  getMatchingScripts,
  sortByRunAt,
  buildInjectionPlan,
  buildGMInjectionPreamble,
  patchHistory,
} from './loader.js';
import { applyPageFeatures, watchFeatureSettings, type FeatureUiStrings } from './features.js';
import { resolveLanguage, translate } from '../i18n.js';
import type { StoredScript } from '../background/registry.js';

// The chrome global is declared once, project-wide, in
// extension/src/chrome.d.ts (ambient `any`); this file only ever reads it
// behind `typeof chrome !== 'undefined'` guards.

const GM_API_NAMES = [
  'GM_info',
  'GM_addStyle',
  'GM_setValue',
  'GM_getValue',
  'GM_deleteValue',
  'GM_listValues',
  'GM_addValueChangeListener',
  'GM_xmlhttpRequest',
  'GM_getResourceText',
  'GM_getResourceUrl',
  'GM_registerMenuCommand',
  'GM_setClipboard',
  'GM_openInTab',
  'GM_log',
];

/** Per-script runtime state held in the content-script world. */
interface RunningScript {
  script: StoredScript;
  gmStar: Record<string, (...args: never[]) => unknown>;
  token: string;
}

const runningScripts = new Map<string, RunningScript>();
let historyUnsubscribe: (() => void) | null = null;

function hasChromeRuntime(): boolean {
  return typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined';
}

function requestMatchingScripts(url: string): Promise<StoredScript[]> {
  if (!hasChromeRuntime()) return Promise.resolve([]);
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'OM_GET_MATCHING_SCRIPTS', url },
      (response: unknown) => {
        const res = response as { ok?: boolean; scripts?: StoredScript[] } | undefined;
        resolve(res?.ok && Array.isArray(res.scripts) ? res.scripts : []);
      },
    );
  });
}

/**
 * Persistent GM values, backed by the background registry
 * (chrome.storage.local, one JSON object per script). The content script
 * loads them once per injection and writes through on every set/delete,
 * so GM_setValue survives navigation, reload and extension restart.
 * Without a background (tests / non-extension hosts) values stay in
 * memory only, as before.
 */
function requestGMValues(scriptId: string): Promise<Record<string, unknown>> {
  if (!hasChromeRuntime()) return Promise.resolve({});
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'OM_GM_GET_VALUES', scriptId },
      (response: unknown) => {
        const res = response as { ok?: boolean; values?: Record<string, unknown> } | undefined;
        resolve(res?.ok && res.values && typeof res.values === 'object' ? res.values : {});
      },
    );
  });
}

function persistGMValue(scriptId: string, name: string, value: unknown): void {
  if (!hasChromeRuntime()) return;
  chrome.runtime.sendMessage({ type: 'OM_GM_SET_VALUE', scriptId, name, value }, () => undefined);
}

function persistGMDelete(scriptId: string, name: string): void {
  if (!hasChromeRuntime()) return;
  chrome.runtime.sendMessage({ type: 'OM_GM_DELETE_VALUE', scriptId, name }, () => undefined);
}

/** A Map whose set/delete also write through to the background store. */
class PersistentValuesMap extends Map<string, unknown> {
  constructor(
    entries: Iterable<[string, unknown]>,
    private readonly onSet: (name: string, value: unknown) => void,
    private readonly onDelete: (name: string) => void,
  ) {
    super(entries);
  }

  override set(name: string, value: unknown): this {
    super.set(name, value);
    this.onSet(name, value);
    return this;
  }

  override delete(name: string): boolean {
    const had = super.delete(name);
    if (had) this.onDelete(name);
    return had;
  }
}

function injectScriptTag(code: string): void {
  const el = document.createElement('script');
  el.textContent = code;
  (document.head ?? document.documentElement).appendChild(el);
  el.remove();
}

/** Inject one script into the page world with its GM bridge preamble. */
export async function injectScript(script: StoredScript): Promise<void> {
  const plan = buildInjectionPlan(script, window.location.href);
  const preamble = buildGMInjectionPreamble(script, GM_API_NAMES);

  const persisted = await requestGMValues(script.id);
  const values = new PersistentValuesMap(
    Object.entries(persisted),
    (name, value) => persistGMValue(script.id, name, value),
    (name) => persistGMDelete(script.id, name),
  );

  const ctx: GMContext = {
    scriptName: script.metadata.name,
    scriptNamespace: script.metadata.namespace,
    scriptVersion: script.metadata.version,
    scriptDescription: script.metadata.description,
    grants: script.metadata.grant,
    connect: script.metadata.connect,
    values,
    resources: {},
    onLog: (msg) => console.log(`[OpenMonkey:${script.metadata.name}]`, msg),
    onOpenTab: (url) => {
      if (hasChromeRuntime()) {
        // Tabs are opened by the background side in the full extension;
        // fall back to window.open when no background is reachable.
        window.open(url, '_blank');
      } else {
        window.open(url, '_blank');
      }
    },
    onMenuCommand: (cmd) => {
      console.log(`[OpenMonkey] menu command registered: ${cmd.caption} (#${cmd.id})`);
    },
  };
  const { gmStar } = createGM(ctx);
  runningScripts.set(script.id, { script, gmStar, token: script.id });

  const parsed = parseUserScript(script.source);
  const userCode = parsed.code;
  const fullCode = `${preamble}\n${userCode}`;
  void plan;

  const run = (): void => {
    if (plan.runAt === 'document-start') {
      injectScriptTag(fullCode);
      return;
    }
    // document-body / document-end / document-idle: wait for the document
    // to be at least interactive before injecting.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => injectScriptTag(fullCode), {
        once: true,
      });
    } else {
      injectScriptTag(fullCode);
    }
  };
  run();
}

/** Answer GM bridge calls posted from the page world. */
function onBridgeMessage(event: MessageEvent): void {
  if (event.source !== window) return;
  const data = event.data as {
    type?: unknown;
    token?: unknown;
    api?: unknown;
    args?: unknown;
    callId?: unknown;
  } | null;
  if (!data || data.type !== 'OM_GM_CALL') return;
  // The token is the script id in this wiring; look up the running script.
  const target = [...runningScripts.values()].find((r) => r.script.id === data.token);
  if (!target || typeof data.api !== 'string') return;
  const fn = target.gmStar[data.api] as ((...args: unknown[]) => unknown) | undefined;
  if (typeof fn !== 'function') {
    window.postMessage(
      { type: 'OM_GM_RESULT', token: data.token, callId: data.callId, ok: false, error: `Unknown GM API: ${data.api}` },
      '*',
    );
    return;
  }
  const args = Array.isArray(data.args) ? data.args : [];
  Promise.resolve()
    .then(() => fn(...args))
    .then((value) => {
      window.postMessage(
        { type: 'OM_GM_RESULT', token: data.token, callId: data.callId, ok: true, value },
        '*',
      );
    })
    .catch((err: unknown) => {
      window.postMessage(
        {
          type: 'OM_GM_RESULT',
          token: data.token,
          callId: data.callId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        },
        '*',
      );
    });
}

async function runForCurrentUrl(): Promise<void> {
  const scripts = await requestMatchingScripts(window.location.href);
  const matching = sortByRunAt(getMatchingScripts(scripts, window.location.href));
  for (const script of matching) {
    try {
      await injectScript(script);
    } catch (err) {
      console.error(`[OpenMonkey] failed to inject ${script.metadata.name}:`, err);
    }
  }
}

/** Start the content script. Safe to call in non-extension environments. */
export function initContentScript(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.addEventListener('message', onBridgeMessage);
  historyUnsubscribe = patchHistory();
  window.addEventListener('om:urlchange', () => {
    void runForCurrentUrl();
  });
  void runForCurrentUrl();
  // v0.5.0 page features (ad filter, dark mode, tag mode, sniffing):
  // read the shared settings and apply them; re-apply on storage
  // changes and on the background's OM_FEATURES_CHANGED broadcast.
  // The feature UI strings follow the browser language (the content
  // script has no settings UI of its own to read the preference
  // from); the popup/dashboard use the stored language instead.
  try {
    const lang = resolveLanguage('system');
    const tr = (key: Parameters<typeof translate>[0]): string => translate(key, lang);
    const strings: FeatureUiStrings = {
      tagHint: tr('tagModeHint'),
      tagExit: tr('tagModeExit'),
      title: tr('resourcesTitle'),
      empty: tr('resourcesEmpty'),
      copy: tr('resourcesCopy'),
      copied: tr('resourcesCopied'),
      open: tr('resourcesOpen'),
      download: tr('resourcesDownload'),
      downloadUnavailable: tr('resourcesDownloadUnavailable'),
      close: tr('editorClose'),
      sniffButtonLabel: tr('sniffButtonLabel'),
      unknownSize: tr('resourcesUnknownSize'),
    };
    watchFeatureSettings(strings);
    void applyPageFeatures(strings).catch(() => {
      // Page features must never break script injection.
    });
  } catch {
    // Page features are best-effort; injection continues without them.
  }
}

export function stopContentScript(): void {
  window.removeEventListener('message', onBridgeMessage);
  if (historyUnsubscribe) {
    historyUnsubscribe();
    historyUnsubscribe = null;
  }
  runningScripts.clear();
}

// Start automatically when loaded as the extension content script.
initContentScript();
