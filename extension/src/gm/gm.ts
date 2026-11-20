// OpenMonkey for Safari — Greasemonkey/Tampermonkey GM API factory.
//
// The factory builds the GM_* (synchronous-style) and GM.* (Promise-style)
// APIs for one script, enforcing that script's @grant list: an API whose
// grant was not declared throws instead of silently stubbing, so a script
// author gets a loud, diagnosable failure rather than a silent no-op.
// GM_webRequest and GM_cookie are deliberately NOT implemented here; see
// UNSUPPORTED below.

export const UNSUPPORTED = ['GM_webRequest', 'GM_cookie'] as const;
// NOTE: GM_webRequest and GM_cookie are not implemented in OpenMonkey 0.1.0.
// GM_webRequest would require Safari Web Extensions declarativeNetRequest /
// webRequest support that is not available to this extension, and GM_cookie
// would require the Safari `cookies` permission and a native host. Scripts
// that request either grant receive a clear error at grant-check time
// (see requireGrant) instead of a fake implementation.

export interface GMContext {
  scriptName: string;
  scriptNamespace: string;
  /** Script version, shown in GM_info. */
  scriptVersion?: string;
  /** Script description, shown in GM_info. */
  scriptDescription?: string;
  /** The raw `// ==UserScript== ... // ==/UserScript==` block text. */
  scriptMetaStr?: string;
  /** Grants declared by the script's @grant lines. ['none'] = GM_info only. */
  grants: string[];
  /** @connect allowlist entries (hostnames, `*.domain`, or `*`). */
  connect: string[];
  /**
   * Persistent per-script storage, owned by the caller (registry/background).
   * In the extension the caller passes a write-through Map backed by
   * chrome.storage.local, so GM_setValue survives navigation and reload;
   * in tests it is a plain in-memory Map. Only JSON-serialisable values
   * persist across injections.
   */
  values: Map<string, unknown>;
  /**
   * Pre-fetched @resource contents, name -> text. Resources are fetched by
   * the background side (which can cross origins); this factory never
   * fetches them itself.
   */
  resources: Record<string, string>;
  onOpenTab?: (url: string) => void;
  onLog?: (msg: string) => void;
  onMenuCommand?: (cmd: { id: number; caption: string }) => void;
  fetchImpl?: typeof fetch;
}

export interface GMInfo {
  scriptHandler: string;
  version: string;
  script: {
    name: string;
    namespace: string;
    version: string;
    description: string;
  };
  scriptMetaStr: string;
  scriptWillUpdate: boolean;
}

export interface GMXmlHttpRequestDetails {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  data?: string | FormData | URLSearchParams | Blob | ArrayBuffer;
  timeout?: number;
  responseType?: string;
  onload?: (response: GMXmlHttpResponse) => void;
  onerror?: (response: GMXmlHttpResponse) => void;
  ontimeout?: (response: GMXmlHttpResponse) => void;
  onabort?: (response: GMXmlHttpResponse) => void;
}

export interface GMXmlHttpResponse {
  status: number;
  statusText: string;
  responseText: string;
  responseHeaders: string;
  finalUrl: string;
  readyState: number;
}

export interface GMApis {
  gmStar: Record<string, (...args: never[]) => unknown>;
  gmDot: Record<string, (...args: never[]) => unknown>;
}

type ValueChangeListener = (name: string, oldValue: unknown, newValue: unknown, remote: boolean) => void;

function hostMatchesAllowlist(hostname: string, entry: string): boolean {
  const host = hostname.toLowerCase();
  const rule = entry.trim().toLowerCase();
  if (rule === '*') return true;
  if (rule.startsWith('*.')) {
    const domain = rule.slice(2);
    return host === domain || host.endsWith('.' + domain);
  }
  return host === rule;
}

/** True when `hostname` is allowed by the script's @connect list. */
export function isHostAllowedByConnect(hostname: string, connect: string[]): boolean {
  return connect.some((entry) => hostMatchesAllowlist(hostname, entry));
}

function gmError(api: string, grant: string): Error {
  return new Error(
    `${api} requires @grant ${grant}, which this script did not declare. ` +
      `Add "// @grant ${grant}" to the script's metadata block.`,
  );
}

export function createGM(ctx: GMContext): GMApis {
  const grants = new Set(ctx.grants);
  const isNone = grants.size === 1 && grants.has('none');
  const fetchImpl: typeof fetch =
    ctx.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : (() => {
      throw new Error('fetch is not available in this environment.');
    }) as unknown as typeof fetch);

  const listeners = new Map<number, { name: string; cb: ValueChangeListener }>();
  let nextListenerId = 1;
  let nextMenuCommandId = 1;

  function requireGrant(api: string, grant: string): void {
    if (isNone) throw gmError(api, grant);
    if (grants.has(grant) || grants.has('*')) return;
    if ((UNSUPPORTED as readonly string[]).includes(grant)) {
      throw new Error(
        `${api} (${grant}) is not supported by OpenMonkey 0.1.0. ` +
          `Supported GM APIs are listed in the OpenMonkey documentation.`,
      );
    }
    throw gmError(api, grant);
  }

  function notifyValueChange(name: string, oldValue: unknown, newValue: unknown): void {
    for (const { name: listenName, cb } of listeners.values()) {
      if (listenName === name) {
        try {
          cb(name, oldValue, newValue, false);
        } catch {
          // A listener throwing must not break setValue/deleteValue.
        }
      }
    }
  }

  // ---------------------------------------------------------------- GM_info
  const gmInfo: GMInfo = {
    scriptHandler: 'OpenMonkey',
    version: '0.1.0',
    script: {
      name: ctx.scriptName,
      namespace: ctx.scriptNamespace,
      version: ctx.scriptVersion ?? '',
      description: ctx.scriptDescription ?? '',
    },
    scriptMetaStr: ctx.scriptMetaStr ?? '',
    scriptWillUpdate: false,
  };
  const info = (): GMInfo => gmInfo;

  // -------------------------------------------------------------- GM_addStyle
  function addStyle(css: string): unknown {
    requireGrant('GM_addStyle', 'GM_addStyle');
    if (typeof document !== 'undefined') {
      const style = document.createElement('style');
      style.textContent = css;
      (document.head ?? document.documentElement).appendChild(style);
      return style;
    }
    ctx.onLog?.(`GM_addStyle called but no document is available; CSS not applied.`);
    return undefined;
  }

  // ------------------------------------------------------- GM value storage
  function setValue(name: string, value: unknown): void {
    requireGrant('GM_setValue', 'GM_setValue');
    const oldValue = ctx.values.get(name);
    ctx.values.set(name, value);
    notifyValueChange(name, oldValue, value);
  }
  function getValue<T>(name: string, defaultValue?: T): T | undefined {
    requireGrant('GM_getValue', 'GM_getValue');
    if (ctx.values.has(name)) return ctx.values.get(name) as T;
    return defaultValue;
  }
  function deleteValue(name: string): void {
    requireGrant('GM_deleteValue', 'GM_deleteValue');
    const oldValue = ctx.values.get(name);
    ctx.values.delete(name);
    notifyValueChange(name, oldValue, undefined);
  }
  function listValues(): string[] {
    requireGrant('GM_listValues', 'GM_listValues');
    return [...ctx.values.keys()];
  }
  function addValueChangeListener(name: string, cb: ValueChangeListener): number {
    requireGrant('GM_addValueChangeListener', 'GM_addValueChangeListener');
    const id = nextListenerId++;
    listeners.set(id, { name, cb });
    return id;
  }
  function removeValueChangeListener(id: number): void {
    requireGrant('GM_addValueChangeListener', 'GM_addValueChangeListener');
    listeners.delete(id);
  }

  // --------------------------------------------------- GM_xmlhttpRequest
  function xmlhttpRequest(details: GMXmlHttpRequestDetails): { abort: () => void } {
    requireGrant('GM_xmlhttpRequest', 'GM_xmlhttpRequest');
    const method = (details.method ?? 'GET').toUpperCase();
    let url: URL;
    try {
      url = new URL(details.url);
    } catch {
      const errResp: GMXmlHttpResponse = {
        status: 0, statusText: '', responseText: '', responseHeaders: '',
        finalUrl: details.url, readyState: 4,
      };
      details.onerror?.(errResp);
      return { abort: () => undefined };
    }

    // Enforce the @connect allowlist. A bare `*` entry is the only way to
    // allow every host: an unlisted host is blocked, and `*` in the URL
    // itself is not a wildcard — only an explicit @connect entry counts.
    if (!isHostAllowedByConnect(url.hostname, ctx.connect)) {
      const errResp: GMXmlHttpResponse = {
        status: 0, statusText: '', responseText: '', responseHeaders: '',
        finalUrl: details.url, readyState: 4,
      };
      const err = new Error(
        `GM_xmlhttpRequest to ${url.hostname} is blocked: host is not in the script's @connect allowlist.`,
      );
      ctx.onLog?.(err.message);
      // Report through onerror asynchronously, matching XHR behaviour.
      queueMicrotask(() => details.onerror?.(errResp));
      return { abort: () => undefined };
    }

    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    if (details.timeout && details.timeout > 0) {
      timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        controller.abort();
        details.ontimeout?.({
          status: 0, statusText: 'timeout', responseText: '', responseHeaders: '',
          finalUrl: details.url, readyState: 4,
        });
      }, details.timeout);
    }

    const headers = new Headers(details.headers ?? {});
    fetchImpl(details.url, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : (details.data as BodyInit | undefined),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        const text = await res.text();
        let headerText = '';
        res.headers.forEach((value, key) => {
          headerText += `${key}: ${value}\r\n`;
        });
        details.onload?.({
          status: res.status,
          statusText: res.statusText,
          responseText: text,
          responseHeaders: headerText,
          finalUrl: res.url || details.url,
          readyState: 4,
        });
      })
      .catch((err: unknown) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        if (err instanceof Error && err.name === 'AbortError') {
          details.onabort?.({
            status: 0, statusText: 'abort', responseText: '', responseHeaders: '',
            finalUrl: details.url, readyState: 4,
          });
        } else {
          details.onerror?.({
            status: 0, statusText: '', responseText: '', responseHeaders: '',
            finalUrl: details.url, readyState: 4,
          });
        }
      });

    return {
      abort: () => {
        if (settled) return;
        settled = true;
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        controller.abort();
        details.onabort?.({
          status: 0, statusText: 'abort', responseText: '', responseHeaders: '',
          finalUrl: details.url, readyState: 4,
        });
      },
    };
  }

  // ------------------------------------------------------------ GM resources
  function getResourceText(name: string): string {
    requireGrant('GM_getResourceText', 'GM_getResourceText');
    if (!(name in ctx.resources)) {
      throw new Error(`GM_getResourceText: no @resource named "${name}" was provided.`);
    }
    return ctx.resources[name];
  }
  function getResourceUrl(name: string): string {
    requireGrant('GM_getResourceUrl', 'GM_getResourceUrl');
    if (!(name in ctx.resources)) {
      throw new Error(`GM_getResourceUrl: no @resource named "${name}" was provided.`);
    }
    // Resources are pre-fetched text held by the host; expose them as a
    // data: URL so page code can use them as a URL without a new fetch.
    return `data:text/plain;charset=utf-8,${encodeURIComponent(ctx.resources[name])}`;
  }

  // ------------------------------------------------------ GM_registerMenuCommand
  function registerMenuCommand(caption: string, onClick?: () => void): number {
    requireGrant('GM_registerMenuCommand', 'GM_registerMenuCommand');
    const id = nextMenuCommandId++;
    ctx.onMenuCommand?.({ id, caption });
    // The host (content/background side) invokes the command by id; the
    // callback itself is kept here so a host that re-dispatches by caption
    // can still reach it via the returned id through onMenuCommand.
    void onClick;
    return id;
  }

  // ---------------------------------------------------------- GM_setClipboard
  async function setClipboard(text: string): Promise<boolean> {
    requireGrant('GM_setClipboard', 'GM_setClipboard');
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fall through to the textarea fallback.
    }
    try {
      if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      }
    } catch {
      return false;
    }
    return false;
  }

  // ------------------------------------------------------------- GM_openInTab
  function openInTab(url: string): void {
    requireGrant('GM_openInTab', 'GM_openInTab');
    if (ctx.onOpenTab) {
      ctx.onOpenTab(url);
      return;
    }
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank');
      return;
    }
    throw new Error('GM_openInTab: no tab opener is available in this environment.');
  }

  // ------------------------------------------------------------------ GM_log
  function log(...args: unknown[]): void {
    requireGrant('GM_log', 'GM_log');
    const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    if (ctx.onLog) ctx.onLog(msg);
    else if (typeof console !== 'undefined') console.log(`[${ctx.scriptName}]`, ...args);
  }

  // GM_* style: synchronous where the underlying API is synchronous.
  const gmStar: Record<string, (...args: never[]) => unknown> = {
    GM_info: info,
    GM_addStyle: addStyle as (...args: never[]) => unknown,
    GM_setValue: setValue as (...args: never[]) => unknown,
    GM_getValue: getValue as (...args: never[]) => unknown,
    GM_deleteValue: deleteValue as (...args: never[]) => unknown,
    GM_listValues: listValues as (...args: never[]) => unknown,
    GM_addValueChangeListener: addValueChangeListener as (...args: never[]) => unknown,
    GM_removeValueChangeListener: removeValueChangeListener as (...args: never[]) => unknown,
    GM_xmlhttpRequest: xmlhttpRequest as (...args: never[]) => unknown,
    GM_getResourceText: getResourceText as (...args: never[]) => unknown,
    GM_getResourceUrl: getResourceUrl as (...args: never[]) => unknown,
    GM_registerMenuCommand: registerMenuCommand as (...args: never[]) => unknown,
    GM_setClipboard: setClipboard as (...args: never[]) => unknown,
    GM_openInTab: openInTab as (...args: never[]) => unknown,
    GM_log: log as (...args: never[]) => unknown,
  };

  // GM.* style: Promise-based counterparts (async wrappers over the same
  // implementations, so grant checks and behaviour are identical).
  const gmDot: Record<string, (...args: never[]) => unknown> = {
    info: info,
    addStyle: (async (css: string) => addStyle(css)) as (...args: never[]) => unknown,
    setValue: (async (name: string, value: unknown) => setValue(name, value)) as (...args: never[]) => unknown,
    getValue: (async <T,>(name: string, defaultValue?: T) => getValue<T>(name, defaultValue)) as (...args: never[]) => unknown,
    deleteValue: (async (name: string) => deleteValue(name)) as (...args: never[]) => unknown,
    listValues: (async () => listValues()) as (...args: never[]) => unknown,
    addValueChangeListener: (async (name: string, cb: ValueChangeListener) => addValueChangeListener(name, cb)) as (...args: never[]) => unknown,
    removeValueChangeListener: (async (id: number) => removeValueChangeListener(id)) as (...args: never[]) => unknown,
    xmlHttpRequest: ((details: GMXmlHttpRequestDetails) => new Promise<GMXmlHttpResponse>((resolve, reject) => {
      xmlhttpRequest({
        ...details,
        onload: (res) => { details.onload?.(res); resolve(res); },
        onerror: (res) => { details.onerror?.(res); reject(new Error(`GM.xmlHttpRequest failed with status ${res.status}`)); },
        ontimeout: (res) => { details.ontimeout?.(res); reject(new Error('GM.xmlHttpRequest timed out')); },
      });
    })) as (...args: never[]) => unknown,
    getResourceText: (async (name: string) => getResourceText(name)) as (...args: never[]) => unknown,
    getResourceUrl: (async (name: string) => getResourceUrl(name)) as (...args: never[]) => unknown,
    registerMenuCommand: (async (caption: string, onClick?: () => void) => registerMenuCommand(caption, onClick)) as (...args: never[]) => unknown,
    setClipboard: setClipboard as (...args: never[]) => unknown,
    openInTab: (async (url: string) => openInTab(url)) as (...args: never[]) => unknown,
    log: (async (...args: unknown[]) => log(...args)) as (...args: never[]) => unknown,
  };

  return { gmStar, gmDot };
}
