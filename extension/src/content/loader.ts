// OpenMonkey for Safari — content-script loader logic.
//
// Pure helpers (matching, ordering, injection planning) plus the GM
// postMessage bridge preamble and SPA history patching. Nothing in this
// file touches chrome.* directly; see content/index.ts for the wiring.
//
// Injection model: user code runs in the page world (so it sees the page's
// own JavaScript environment), while GM APIs live in the content-script
// world. The preamble below defines window.GM_* / window.GM in the page
// world as thin proxies that postMessage each call to the content script
// with a per-script token; the content script answers with the result.
// That keeps privileged APIs out of the page world.

import { matchesIncludeExclude } from '../matcher/matcher.js';
import type { UserScriptMetadata, RunAt, InjectInto } from '../parser/metablock.js';
import type { StoredScript } from '../background/registry.js';

export const RUN_AT_ORDER: Record<RunAt, number> = {
  'document-start': 0,
  'document-body': 1,
  'document-end': 2,
  'document-idle': 3,
};

export interface InjectionPlan {
  runAt: RunAt;
  injectInto: InjectInto;
  /** @require URLs to load before the user code runs. */
  requires: string[];
  /** Grants the script declared; the bridge only exposes these. */
  grants: string[];
  /** Resource names the script declared via @resource. */
  resources: string[];
  /** True when the script asked for the page's unsafeWindow. */
  unsafeWindow: boolean;
}

/** Enabled scripts whose @match/@include rules match `url`. */
export function getMatchingScripts(scripts: StoredScript[], url: string): StoredScript[] {
  return scripts.filter((s) => s.enabled && matchesIncludeExclude(s.metadata, url));
}

/** Sort by run-at: document-start < document-body < document-end < document-idle. Stable. */
export function sortByRunAt(scripts: StoredScript[]): StoredScript[] {
  return [...scripts].sort((a, b) => {
    const order = RUN_AT_ORDER[a.metadata.runAt] - RUN_AT_ORDER[b.metadata.runAt];
    if (order !== 0) return order;
    return (a.metadata.weight ?? 0) - (b.metadata.weight ?? 0);
  });
}

export function buildInjectionPlan(script: StoredScript, _url: string): InjectionPlan {
  const meta: UserScriptMetadata = script.metadata;
  return {
    runAt: meta.runAt,
    injectInto: meta.injectInto,
    requires: [...meta.require],
    grants: [...meta.grant],
    resources: Object.keys(meta.resource),
    unsafeWindow: meta.grant.includes('unsafeWindow'),
  };
}

function safeJson(value: unknown): string {
  return JSON.stringify(value) ?? 'null';
}

/**
 * Build the JS preamble injected into the page world before a script's
 * code. It defines window.GM_* and window.GM as proxies over
 * window.postMessage: each call posts
 * `{ type: 'OM_GM_CALL', token, api, args, callId }` and the content
 * script replies with `{ type: 'OM_GM_RESULT', token, callId, ok, value }`
 * (or `{ ok: false, error }`). GM_info is embedded synchronously because
 * scripts commonly read it at load time without awaiting anything.
 *
 * NOTE on unsafeWindow: the page world *is* the unsafe window. OpenMonkey
 * only exposes it when the script's metadata grants include
 * 'unsafeWindow' — see buildInjectionPlan().unsafeWindow — and in that
 * case `window.unsafeWindow` is simply aliased to `window` by the
 * preamble. Scripts without that grant get no unsafeWindow global.
 */
export function buildGMInjectionPreamble(
  script: StoredScript,
  gmApiNames: string[],
): string {
  // The bridge token is the script id: the content script looks the
  // running script up by this token when answering OM_GM_CALL messages.
  // It is not a secret (page code can read it) — it only scopes replies
  // to the script that made the call.
  const token = script.id;
  const meta = script.metadata;
  const info = {
    scriptHandler: 'OpenMonkey',
    version: '0.1.0',
    script: {
      name: meta.name,
      namespace: meta.namespace,
      version: meta.version,
      description: meta.description,
    },
    scriptMetaStr: '',
    scriptWillUpdate: false,
  };

  const lines: string[] = [];
  lines.push('(function () {');
  lines.push('  "use strict";');
  lines.push(`  var __omToken = ${safeJson(token)};`);
  lines.push('  var __omPending = {};');
  lines.push('  var __omCallId = 0;');
  lines.push('  function __omCall(api, args) {');
  lines.push('    return new Promise(function (resolve, reject) {');
  lines.push('      var callId = ++__omCallId;');
  lines.push('      __omPending[callId] = { resolve: resolve, reject: reject };');
  lines.push('      window.postMessage({ type: "OM_GM_CALL", token: __omToken, api: api, args: args, callId: callId }, "*");');
  lines.push('    });');
  lines.push('  }');
  lines.push('  window.addEventListener("message", function (event) {');
  lines.push('    if (event.source !== window) return;');
  lines.push('    var data = event.data;');
  lines.push('    if (!data || data.type !== "OM_GM_RESULT" || data.token !== __omToken) return;');
  lines.push('    var pending = __omPending[data.callId];');
  lines.push('    if (!pending) return;');
  lines.push('    delete __omPending[data.callId];');
  lines.push('    if (data.ok) pending.resolve(data.value);');
  lines.push('    else pending.reject(new Error(data.error || "GM call failed"));');
  lines.push('  });');
  // GM_info is synchronous and embedded.
  lines.push(`  var __omInfo = ${safeJson(info)};`);
  lines.push('  window.GM_info = __omInfo;');
  // Per-API proxies. GM_* names are async (Promise) proxies; GM.* mirrors them.
  for (const api of gmApiNames) {
    if (api === 'GM_info') continue;
    lines.push(`  window.${api} = function () { return __omCall(${safeJson(api)}, Array.prototype.slice.call(arguments)); };`);
  }
  lines.push('  window.GM = {};');
  lines.push('  window.GM.info = __omInfo;');
  for (const api of gmApiNames) {
    if (api === 'GM_info') continue;
    const dotName = api.replace(/^GM_/, '');
    // Map GM_xmlhttpRequest -> GM.xmlHttpRequest (Tampermonkey spelling).
    const dotKey = dotName === 'xmlhttpRequest' ? 'xmlHttpRequest' : dotName;
    lines.push(`  window.GM.${dotKey} = window.${api};`);
  }
  if (meta.grant.includes('unsafeWindow')) {
    lines.push('  window.unsafeWindow = window;');
  }
  lines.push('})();');
  return lines.join('\n');
}

/**
 * Patch history.pushState / replaceState and listen for popstate so SPA
 * navigations dispatch a `om:urlchange` CustomEvent on window with
 * `detail: { url }`. Returns an unsubscribe function that restores the
 * original methods and removes the listener.
 */
export function patchHistory(): () => void {
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  function dispatch(): void {
    window.dispatchEvent(
      new CustomEvent('om:urlchange', { detail: { url: window.location.href } }),
    );
  }

  function onPopState(): void {
    dispatch();
  }

  const patchedPushState = function (
    this: History,
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    originalPushState(data as never, unused, url as never);
    dispatch();
  } as typeof history.pushState;

  const patchedReplaceState = function (
    this: History,
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    originalReplaceState(data as never, unused, url as never);
    dispatch();
  } as typeof history.replaceState;

  history.pushState = patchedPushState;
  history.replaceState = patchedReplaceState;
  window.addEventListener('popstate', onPopState);

  return () => {
    history.pushState = originalPushState as typeof history.pushState;
    history.replaceState = originalReplaceState as typeof history.replaceState;
    window.removeEventListener('popstate', onPopState);
  };
}
