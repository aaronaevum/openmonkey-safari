// OpenMonkey for Safari — v0.5.0 page features (content script).
//
// DOM wiring for the features whose pure logic lives in
// src/features.ts: ad filter, web dark mode, tap-to-hide (tag mode),
// and media sniffing. Everything here is best-effort and guarded:
// a feature that fails to start (a page that blocks style injection,
// a storage error) must never break script injection, which is the
// content script's main job.
//
// Honest limits, stated where they apply:
//   - Ad filter: a CSS hide list + a MutationObserver that re-hides
//     newly added ad nodes. It cannot block ad *requests* (no
//     declarativeNetRequest / webRequestBlocking in a Safari web
//     extension content script) and cannot see inside cross-origin
//     iframes or shadow roots it has no access to.
//   - Dark mode: a stylesheet override, not an invert filter (see
//     buildDarkModeCss). Inline-styled pages and white-background
//     images keep light patches.
//   - Sniffing: scans the DOM + resource-timing entries for media
//     URLs, but ONLY while resourceDetectionEnabled is true (the
//     Home 资源管理 toggle). Reports go to the background, which
//     forwards them to the host app via the native reportResources
//     message and also stores them under openmonkey.resources.v1.
//     It cannot see media loaded through XHR/fetch blobs that
//     never appear in the DOM, and it cannot merge/convert m3u8
//     into mp4 — that needs a native downloader, not a content
//     script. Downloads only work for same-origin media (or
//     CORS-enabled hosts); cross-origin items offer copy-link only.
//   - The floating sniff button is an in-page element: pages that
//     remove foreign DOM nodes, or that run inside a top-level frame
//     Safari does not inject into, will not show it. The same media
//     list is always available in the popup/dashboard, so the button
//     is a convenience, not the only path.

import {
  DEFAULT_AD_SELECTORS,
  buildAdFilterCss,
  buildDarkModeCss,
  extractMediaItems,
  selectorForElement,
  shouldApplyDarkMode,
  toNativeResources,
  type MediaItem,
  type TagRules,
} from '../features.js';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  normaliseSettings,
  type ExtensionSettings,
} from '../settings.js';

const AD_STYLE_ID = 'openmonkey-ad-filter';
const DARK_STYLE_ID = 'openmonkey-dark-mode';
const TAG_STYLE_ID = 'openmonkey-tag-rules';
const TAG_BAR_ID = 'openmonkey-tag-bar';
const SNIFF_BUTTON_ID = 'openmonkey-sniff-button';
const SNIFF_PANEL_ID = 'openmonkey-sniff-panel';
const TAG_RULES_KEY = 'openmonkey.tagRules.v1';

function hasChromeStorage(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    typeof chrome.storage !== 'undefined' &&
    typeof chrome.storage.local !== 'undefined' &&
    typeof chrome.storage.local.get === 'function'
  );
}

function storageGet<T>(key: string): Promise<T | undefined> {
  if (!hasChromeStorage()) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), 800);
    try {
      const maybePromise = chrome.storage.local.get(key, (items: Record<string, unknown>) => {
        clearTimeout(timer);
        resolve(items?.[key] as T | undefined);
      }) as unknown;
      if (maybePromise && typeof (maybePromise as { then?: unknown }).then === 'function') {
        (maybePromise as Promise<Record<string, unknown>>).then(
          (items) => {
            clearTimeout(timer);
            resolve(items?.[key] as T | undefined);
          },
          () => {
            clearTimeout(timer);
            resolve(undefined);
          },
        );
      }
    } catch {
      clearTimeout(timer);
      resolve(undefined);
    }
  });
}

function storageSet(items: Record<string, unknown>): void {
  if (!hasChromeStorage()) return;
  try {
    chrome.storage.local.set(items, () => undefined);
  } catch {
    // Best-effort.
  }
}

function readFeatureSettings(): Promise<ExtensionSettings> {
  return storageGet<unknown>(SETTINGS_KEY).then((raw) =>
    raw === undefined ? { ...DEFAULT_SETTINGS } : normaliseSettings(raw),
  );
}

function readTagRules(): Promise<TagRules> {
  return storageGet<unknown>(TAG_RULES_KEY).then((raw) => {
    if (!raw || typeof raw !== 'object') return {};
    const out: TagRules = {};
    for (const [host, value] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        const selectors = value.filter((v): v is string => typeof v === 'string');
        if (selectors.length > 0) out[host] = selectors;
      }
    }
    return out;
  });
}

/** Create (or replace the text of) a managed <style> element. */
function ensureStyle(id: string, css: string): HTMLStyleElement | null {
  const root = document.head ?? document.documentElement;
  if (!root) return null;
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    style.setAttribute('data-openmonkey', '1');
    root.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
  return style;
}

function removeStyle(id: string): void {
  document.getElementById(id)?.remove();
}

// ---------------------------------------------------------------------------
// Ad filter
// ---------------------------------------------------------------------------

let adObserver: MutationObserver | null = null;

function hideMatchingAds(root: ParentNode, selectors: string[]): void {
  for (const selector of selectors) {
    try {
      root.querySelectorAll(selector).forEach((node) => {
        const el = node as HTMLElement;
        if (el.style.display !== 'none') el.style.setProperty('display', 'none', 'important');
      });
    } catch {
      // One bad selector must not stop the rest.
    }
  }
}

export function startAdFilter(settings: ExtensionSettings, builtin: string[]): void {
  stopAdFilter();
  if (!settings.adFilterEnabled) return;
  const selectors = [...new Set([...builtin, ...(settings.customAdRules ?? [])])];
  const css = buildAdFilterCss(selectors);
  if (!css) return;
  ensureStyle(AD_STYLE_ID, css);
  // Belt and braces for nodes the CSS cannot reach (e.g. elements
  // whose inline style fights the rule, or nodes added inside a
  // subtree the style element does not cover): hide matching nodes
  // inline as they appear, and re-insert the style element if the
  // page removes it.
  adObserver = new MutationObserver((mutations) => {
    if (!document.getElementById(AD_STYLE_ID)) ensureStyle(AD_STYLE_ID, css);
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as Element;
        if (el.matches) {
          for (const selector of selectors) {
            try {
              if (el.matches(selector)) {
                (el as HTMLElement).style.setProperty('display', 'none', 'important');
              }
            } catch {
              // Ignore invalid selectors.
            }
          }
        }
        hideMatchingAds(el, selectors);
      }
    }
  });
  adObserver.observe(document.documentElement ?? document.body, {
    childList: true,
    subtree: true,
  });
  hideMatchingAds(document, selectors);
}

export function stopAdFilter(): void {
  adObserver?.disconnect();
  adObserver = null;
  removeStyle(AD_STYLE_ID);
}

// ---------------------------------------------------------------------------
// Dark mode
// ---------------------------------------------------------------------------

export function applyDarkMode(settings: ExtensionSettings): void {
  // Dark-mode injection applies ONLY when darkModeEnabled is true
  // (the Home toggle); darkMode is then just the mode choice.
  if (!settings.darkModeEnabled) {
    removeStyle(DARK_STYLE_ID);
    return;
  }
  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (shouldApplyDarkMode(settings.darkMode, prefersDark)) {
    ensureStyle(DARK_STYLE_ID, buildDarkModeCss());
  } else {
    removeStyle(DARK_STYLE_ID);
  }
}

// ---------------------------------------------------------------------------
// Tag rules (per-site hides) + tag mode
// ---------------------------------------------------------------------------

export function applyTagRules(rules: TagRules, host: string): void {
  const selectors = rules[host] ?? [];
  if (selectors.length === 0) {
    removeStyle(TAG_STYLE_ID);
    return;
  }
  const css = buildAdFilterCss(selectors);
  if (css) ensureStyle(TAG_STYLE_ID, css);
  else removeStyle(TAG_STYLE_ID);
}

export interface TagModeCallbacks {
  /** Called when the user taps an element to hide it. */
  onHide: (host: string, selector: string) => void;
  /** Called when the user leaves tag mode. */
  onExit: () => void;
  /** Localised hint text for the floating bar. */
  hintText: string;
  exitText: string;
}

let tagModeActive = false;
let tagModeCleanup: (() => void) | null = null;

function buildTagBar(hintText: string, exitText: string, onExit: () => void): HTMLElement {
  const bar = document.createElement('div');
  bar.id = TAG_BAR_ID;
  bar.setAttribute('data-openmonkey', '1');
  bar.style.cssText =
    'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;' +
    'display:flex;align-items:center;gap:10px;max-width:92vw;' +
    'background:rgba(28,28,30,0.95);color:#f5f5f7;font:14px/1.4 -apple-system,sans-serif;' +
    'padding:10px 12px;border-radius:20px;box-shadow:0 4px 16px rgba(0,0,0,0.4);';
  const text = document.createElement('span');
  text.textContent = hintText;
  const exit = document.createElement('button');
  exit.type = 'button';
  exit.textContent = exitText;
  exit.style.cssText =
    'flex:none;background:#3a3a3c;color:#f5f5f7;border:none;border-radius:12px;' +
    'padding:6px 12px;font:inherit;cursor:pointer;';
  exit.addEventListener('click', (event) => {
    event.stopPropagation();
    onExit();
  });
  bar.append(text, exit);
  return bar;
}

export function isTagModeActive(): boolean {
  return tagModeActive;
}

/**
 * Enter tap-to-hide mode: a floating hint bar appears, the element
 * under the pointer is outlined, and tapping hides it (display:none
 * via a per-site rule) and reports it through onHide. A long-press
 * (600ms) anywhere, or the Exit button, leaves the mode. All
 * listeners are capture-phase and stopPropagation so the tap never
 * activates the page underneath.
 */
export function startTagMode(callbacks: TagModeCallbacks): void {
  stopTagMode();
  tagModeActive = true;
  const host = window.location.hostname;
  const bar = buildTagBar(callbacks.hintText, callbacks.exitText, () => {
    callbacks.onExit();
  });
  document.body?.appendChild(bar);
  let highlighted: Element | null = null;
  let pressTimer: number | null = null;

  const clearHighlight = (): void => {
    if (highlighted) {
      (highlighted as HTMLElement).style.removeProperty('outline');
      highlighted = null;
    }
  };
  const onPointerMove = (event: PointerEvent): void => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || target === bar || bar.contains(target)) return;
    if (target === highlighted) return;
    clearHighlight();
    highlighted = target;
    (target as HTMLElement).style.setProperty('outline', '2px solid #ff9500', 'important');
  };
  const onPointerDown = (event: PointerEvent): void => {
    pressTimer = window.setTimeout(() => {
      // Long-press exits tag mode (Addons behaviour).
      callbacks.onExit();
    }, 600);
    void event;
  };
  const onPointerUp = (): void => {
    if (pressTimer !== null) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
  };
  const onClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (pressTimer !== null) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
    const target = event.target as Element | null;
    if (!target || target === bar || bar.contains(target as Node)) return;
    clearHighlight();
    const parent = target.parentElement;
    let nthOfType = 0;
    if (parent) {
      const siblings = [...parent.children].filter((c) => c.tagName === target.tagName);
      nthOfType = siblings.indexOf(target) + 1;
    }
    const selector = selectorForElement({
      tag: target.tagName,
      id: (target as HTMLElement).id || '',
      classes: [...((target as HTMLElement).classList ?? [])],
      nthOfType,
    });
    try {
      (target as HTMLElement).style.setProperty('display', 'none', 'important');
    } catch {
      // Ignore.
    }
    callbacks.onHide(host, selector);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') callbacks.onExit();
  };
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
  tagModeCleanup = () => {
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    if (pressTimer !== null) window.clearTimeout(pressTimer);
    clearHighlight();
    bar.remove();
  };
}

export function stopTagMode(): void {
  tagModeActive = false;
  tagModeCleanup?.();
  tagModeCleanup = null;
  document.getElementById(TAG_BAR_ID)?.remove();
}

// ---------------------------------------------------------------------------
// Media sniffing
// ---------------------------------------------------------------------------

const MEDIA_ATTRIBUTES = ['src', 'href'] as const;

/** Scan the current page for media URLs (DOM + resource timing). */
export function scanPageMedia(): MediaItem[] {
  const candidates: string[] = [];
  const push = (value: string | null | undefined): void => {
    if (typeof value === 'string' && value) {
      try {
        candidates.push(new URL(value, document.baseURI).href);
      } catch {
        // Ignore unresolvable URLs.
      }
    }
  };
  for (const el of document.querySelectorAll('video, audio')) {
    push((el as HTMLMediaElement).currentSrc);
    push(el.getAttribute('src'));
    push(el.getAttribute('poster'));
  }
  for (const el of document.querySelectorAll('source')) {
    push(el.getAttribute('src'));
    const srcset = el.getAttribute('srcset');
    if (srcset) {
      for (const part of srcset.split(',')) push(part.trim().split(/\s+/)[0]);
    }
  }
  for (const el of document.querySelectorAll('a[href]')) {
    const href = el.getAttribute('href');
    if (href && /\.(mp4|webm|mov|mkv|m3u8|mpd|mp3|m4a|aac|ogg|wav|flac)(\?|#|$)/i.test(href)) {
      push(href);
    }
  }
  // Resource timing catches media fetched by the page's own scripts
  // (e.g. an HLS manifest loaded via fetch/XHR) that never appears
  // in the DOM.
  try {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    for (const entry of entries) push(entry.name);
  } catch {
    // Performance API unavailable; DOM scan stands alone.
  }
  return extractMediaItems(candidates);
}

/** Best-effort HEAD for same-origin URLs to learn Content-Length.
 * Cross-origin HEADs fail CORS from a content script and are skipped
 * silently — the size simply stays unknown. */
export async function enrichMediaSizes(items: MediaItem[]): Promise<MediaItem[]> {
  const origin = window.location.origin;
  return Promise.all(
    items.map(async (item) => {
      if (item.size !== undefined) return item;
      let sameOrigin = false;
      try {
        sameOrigin = new URL(item.url).origin === origin;
      } catch {
        return item;
      }
      if (!sameOrigin || item.url.startsWith('blob:')) return item;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(item.url, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timer);
        const length = response.headers.get('content-length');
        if (length) {
          const size = Number(length);
          if (Number.isFinite(size) && size > 0) return { ...item, size };
        }
      } catch {
        // CORS / network failure: size stays unknown.
      }
      return item;
    }),
  );
}

/** Report a scan to the background, which stamps the tab id, forwards
 * it to the host app via the native reportResources message, and
 * stores it under openmonkey.resources.v1. Falls back to writing
 * storage directly (tabId 0, dual shape: the legacy {items} list
 * plus the native {resources} list) when there is no background. */
export function reportResources(items: MediaItem[]): void {
  const payload = { type: 'OM_REPORT_RESOURCES', url: window.location.href, items };
  if (typeof chrome !== 'undefined' && typeof chrome.runtime?.sendMessage === 'function') {
    try {
      chrome.runtime.sendMessage(payload, () => undefined);
      return;
    } catch {
      // Fall through to direct storage.
    }
  }
  storageSet({
    'openmonkey.resources.v1': {
      tabId: 0,
      url: window.location.href,
      items,
      resources: toNativeResources(items, window.location.href),
    },
  });
}

// --- In-page media panel + floating sniff button --------------------------

export interface SniffUiStrings {
  title: string;
  empty: string;
  copy: string;
  copied: string;
  open: string;
  download: string;
  downloadUnavailable: string;
  close: string;
  sniffButtonLabel: string;
  unknownSize: string;
}

function formatSize(size: number | undefined, unknownLabel: string): string {
  if (size === undefined) return unknownLabel;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${size} B`;
}

function mediaTypeLabel(type: MediaItem['type']): string {
  return type === 'manifest' ? 'HLS/DASH' : type.toUpperCase();
}

/** Open the in-page media panel (used by the floating button, its
 * long-press, and the popup's "view resources" path). */
export function openSniffPanel(items: MediaItem[], strings: SniffUiStrings): void {
  closeSniffPanel();
  const panel = document.createElement('div');
  panel.id = SNIFF_PANEL_ID;
  panel.setAttribute('data-openmonkey', '1');
  panel.style.cssText =
    'position:fixed;right:12px;bottom:72px;z-index:2147483647;width:min(340px,92vw);' +
    'max-height:60vh;overflow:auto;background:rgba(28,28,30,0.97);color:#f5f5f7;' +
    'font:14px/1.45 -apple-system,sans-serif;border-radius:16px;padding:14px;' +
    'box-shadow:0 8px 24px rgba(0,0,0,0.5);';
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
  const title = document.createElement('strong');
  title.style.flex = '1';
  title.textContent = strings.title;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '✕';
  close.setAttribute('aria-label', strings.close);
  close.style.cssText =
    'background:#3a3a3c;color:#f5f5f7;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;';
  close.addEventListener('click', () => closeSniffPanel());
  head.append(title, close);
  panel.appendChild(head);
  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'color:#98989d;margin:4px 0;';
    empty.textContent = strings.empty;
    panel.appendChild(empty);
  }
  for (const item of items) {
    const row = document.createElement('div');
    row.style.cssText = 'border-top:1px solid rgba(255,255,255,0.12);padding:8px 0;';
    const label = document.createElement('div');
    label.style.cssText = 'font-weight:600;overflow-wrap:break-word;';
    label.textContent = `${mediaTypeLabel(item.type)} · ${formatSize(item.size, strings.unknownSize)}`;
    const url = document.createElement('div');
    url.style.cssText =
      'font-size:12px;color:#98989d;overflow-wrap:break-word;word-break:break-all;';
    url.textContent = item.url;
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;';
    const buttonStyle =
      'background:#3a3a3c;color:#f5f5f7;border:none;border-radius:10px;padding:5px 10px;font:inherit;cursor:pointer;';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = strings.copy;
    copy.style.cssText = buttonStyle;
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(item.url);
        copy.textContent = strings.copied;
        setTimeout(() => {
          copy.textContent = strings.copy;
        }, 1200);
      } catch {
        window.prompt(strings.copy, item.url);
      }
    });
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = strings.open;
    open.style.cssText = buttonStyle;
    open.addEventListener('click', () => window.open(item.url, '_blank'));
    actions.append(copy, open);
    // Download: same-origin (or blob:) media can be fetched and
    // saved via a blob anchor; cross-origin media is blocked by
    // CORS, so no download button is shown for it — the copy-link
    // action is the honest fallback (see the module header).
    let sameOrigin = false;
    try {
      sameOrigin = item.url.startsWith('blob:') || new URL(item.url).origin === window.location.origin;
    } catch {
      sameOrigin = false;
    }
    if (sameOrigin && item.type !== 'manifest') {
      const download = document.createElement('button');
      download.type = 'button';
      download.textContent = strings.download;
      download.style.cssText = buttonStyle;
      download.addEventListener('click', async () => {
        try {
          const response = await fetch(item.url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = blobUrl;
          anchor.download = decodeURIComponent(item.url.split('/').pop()?.split('?')[0] ?? 'media');
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        } catch {
          window.alert(strings.downloadUnavailable);
        }
      });
      actions.appendChild(download);
    } else if (item.type === 'manifest') {
      const note = document.createElement('span');
      note.style.cssText = 'font-size:12px;color:#98989d;align-self:center;';
      note.textContent = strings.downloadUnavailable;
      actions.appendChild(note);
    }
    row.append(label, url, actions);
    panel.appendChild(row);
  }
  document.body?.appendChild(panel);
}

export function closeSniffPanel(): void {
  document.getElementById(SNIFF_PANEL_ID)?.remove();
}

let sniffButton: HTMLElement | null = null;

/**
 * Show the floating sniff button. Click opens the media panel;
 * a long-press (600ms, when longPressSniff is on) opens it too.
 * The button is an in-page element: pages that strip foreign nodes
 * will remove it, and it is re-created on the next settings apply.
 */
export function showSniffButton(
  settings: ExtensionSettings,
  strings: SniffUiStrings,
  onOpen: () => MediaItem[],
): void {
  hideSniffButton();
  if (!settings.sniffEnabled || !settings.showSniffButton) return;
  const button = document.createElement('button');
  button.id = SNIFF_BUTTON_ID;
  button.type = 'button';
  button.setAttribute('data-openmonkey', '1');
  button.setAttribute('aria-label', strings.sniffButtonLabel);
  button.textContent = '⬇';
  button.style.cssText =
    'position:fixed;right:14px;bottom:14px;z-index:2147483646;width:48px;height:48px;' +
    'border-radius:50%;border:none;background:#6c5cff;color:#fff;font-size:22px;' +
    'box-shadow:0 4px 14px rgba(0,0,0,0.45);cursor:pointer;';
  let pressTimer: number | null = null;
  let longPressed = false;
  button.addEventListener('pointerdown', () => {
    longPressed = false;
    if (!settings.longPressSniff) return;
    pressTimer = window.setTimeout(() => {
      longPressed = true;
      openSniffPanel(onOpen(), strings);
    }, 600);
  });
  button.addEventListener('pointerup', () => {
    if (pressTimer !== null) {
      window.clearTimeout(pressTimer);
      pressTimer = null;
    }
  });
  button.addEventListener('click', () => {
    if (longPressed) {
      longPressed = false;
      return;
    }
    openSniffPanel(onOpen(), strings);
  });
  document.body?.appendChild(button);
  sniffButton = button;
}

export function hideSniffButton(): void {
  sniffButton?.remove();
  sniffButton = null;
  document.getElementById(SNIFF_BUTTON_ID)?.remove();
}

// ---------------------------------------------------------------------------
// Orchestration: read settings + tag rules, apply everything, re-apply
// on storage changes and on the background's OM_FEATURES_CHANGED.
// ---------------------------------------------------------------------------

export interface FeatureUiStrings extends SniffUiStrings {
  tagHint: string;
  tagExit: string;
}

export async function applyPageFeatures(strings: FeatureUiStrings): Promise<void> {
  const settings = await readFeatureSettings();
  const host = window.location.hostname;
  const rules = await readTagRules();
  applyTagRules(rules, host);
  startAdFilter(settings, DEFAULT_AD_SELECTORS);
  applyDarkMode(settings);
  if (settings.tagModeEnabled) {
    startTagMode({
      hintText: strings.tagHint,
      exitText: strings.tagExit,
      onHide: (hideHost, selector) => {
        void readTagRules().then((current) => {
          const next: TagRules = { ...current };
          const list = next[hideHost] ?? [];
          if (!list.includes(selector)) next[hideHost] = [...list, selector];
          storageSet({ [TAG_RULES_KEY]: next });
          applyTagRules(next, hideHost);
        });
      },
      onExit: () => {
        stopTagMode();
        void readFeatureSettings().then(async (current) => {
          const next = { ...current, tagModeEnabled: false };
          storageSet({ [SETTINGS_KEY]: next });
        });
      },
    });
  } else {
    stopTagMode();
  }
  // Media detection runs whenever resourceDetectionEnabled is true
  // (the Home 资源管理 toggle, default on) — independently of the
  // sniff button. The sniffer reports nothing while it is off.
  if (settings.resourceDetectionEnabled) {
    const items = scanPageMedia();
    reportResources(items);
    void enrichMediaSizes(items).then((enriched) => {
      if (JSON.stringify(enriched) !== JSON.stringify(items)) reportResources(enriched);
    });
  }
  if (settings.sniffEnabled && settings.resourceDetectionEnabled) {
    showSniffButton(settings, strings, () => scanPageMedia());
  } else {
    hideSniffButton();
    closeSniffPanel();
  }
  // Watch the system colour scheme for darkMode "auto": a macOS/iOS
  // appearance change should re-apply without a reload.
  if (typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      void readFeatureSettings().then((s) => applyDarkMode(s));
    };
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
  }
}

/** Re-apply features when settings/tag rules change in storage. */
export function watchFeatureSettings(strings: FeatureUiStrings): void {
  if (
    typeof chrome === 'undefined' ||
    typeof chrome.storage === 'undefined' ||
    typeof chrome.storage.onChanged === 'undefined' ||
    typeof chrome.storage.onChanged.addListener !== 'function'
  ) {
    return;
  }
  try {
    chrome.storage.onChanged.addListener(
      (changes: Record<string, unknown>, areaName: string) => {
        if (areaName !== 'local') return;
        if (changes[SETTINGS_KEY] || changes[TAG_RULES_KEY]) {
          void applyPageFeatures(strings);
        }
      },
    );
  } catch {
    // Best-effort only.
  }
  if (typeof chrome.runtime?.onMessage?.addListener === 'function') {
    try {
      chrome.runtime.onMessage.addListener((message: unknown) => {
        const type = (message as { type?: unknown } | null)?.type;
        if (type === 'OM_FEATURES_CHANGED') void applyPageFeatures(strings);
        return undefined;
      });
    } catch {
      // Best-effort only.
    }
  }
}
