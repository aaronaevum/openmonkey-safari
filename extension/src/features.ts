// OpenMonkey for Safari — v0.5.0 page features (pure logic).
//
// Everything in this file is pure (no DOM, no chrome.*) so it is
// unit-testable in Node. The DOM wiring lives in
// src/content/features.ts; the settings shape lives in settings.ts.

import { defaultSearchEngines, type SearchEngine } from './settings.js';

// ---------------------------------------------------------------------------
// 1. Ad filter
// ---------------------------------------------------------------------------

/**
 * Built-in ad selectors. Deliberately specific: attribute/class/id
 * patterns that ad networks actually use, plus well-known ad slots.
 * Nothing here matches bare structural elements (div, main, section,
 * article, body, html) or the universal selector, so page content is
 * never hidden by the built-in list. Custom user rules go through
 * isSafeAdSelector() before they are accepted (see below).
 */
export const DEFAULT_AD_SELECTORS: string[] = [
  'ins.adsbygoogle',
  '[id^="google_ads"]',
  '[id*="google-ad"]',
  '[class*="google-ad"]',
  '[id*="ad-banner"]',
  '[id*="ad-container"]',
  '[class*="ad-container"]',
  '[id^="ad_"]',
  '[class*="advert"]',
  '[id*="advert"]',
  '.advertisement',
  '#advertisement',
  '.adsbygoogle',
  '[class*="adsby"]',
  '[data-ad-client]',
  '[data-ad-slot]',
  '[data-ad]',
  'iframe[src*="doubleclick.net"]',
  'iframe[src*="googlesyndication.com"]',
  'iframe[src*="adsystem"]',
  '[aria-label*="Advertisement"]',
  '[aria-label*="advertisement"]',
  '[id*="sponsored"]',
  '[class*="sponsored-content"]',
  '.ad-slot',
  '[id*="taboola"]',
  '[class*="taboola"]',
];

/**
 * Is a user-supplied selector safe to inject as a hide rule?
 * Rejects anything that is not a selector at all (braces,
 * semicolons, `!important`, comments), the universal selector, bare
 * structural elements, and bare single-letter / very short element
 * names — any of those could hide main content. Attribute, class,
 * id and compound selectors (including descendant combinators of
 * safe parts) are accepted.
 */
export function isSafeAdSelector(selector: string): boolean {
  const sel = selector.trim();
  if (!sel) return false;
  if (sel.length > 300) return false;
  if (/[{;}!]|<!--|\*\//.test(sel)) return false;
  if (sel.includes('*') && !sel.includes('[class') && !sel.includes('[id')) {
    // A bare `*` or `*.foo` would match everything.
    if (/(^|[\s>+~])\*/.test(sel)) return false;
  }
  // Split on combinators and check every simple part.
  const parts = sel.split(/[\s>+~]+/).filter(Boolean);
  if (parts.length === 0) return false;
  const bareElement = /^(html|body|main|article|section|div|span|p|a|img|ul|ol|li|table|header|footer|nav|aside|h1|h2|h3|h4|h5|h6)$/i;
  for (const part of parts) {
    // Strip pseudo-classes/elements and attribute selectors for the
    // bare-element check, e.g. `div.ad` -> `div` is fine (class-qualified),
    // but a lone `div` is not.
    const base = part.replace(/\[.*?\]/g, '').replace(/::?[a-z-]+(\([^)]*\))?/gi, '');
    if (bareElement.test(base)) return false;
    if (base === '*') return false;
  }
  return true;
}

/** Build the `<style>` text that hides every given selector.
 * Invalid/unsafe selectors are dropped silently (they were already
 * rejected at input time; this is defence in depth). Returns '' when
 * nothing valid remains. */
export function buildAdFilterCss(selectors: string[]): string {
  const valid = selectors.map((s) => s.trim()).filter((s) => s && isSafeAdSelector(s));
  if (valid.length === 0) return '';
  return `${valid.join(',\n')}{display:none !important;visibility:hidden !important;}`;
}

// ---------------------------------------------------------------------------
// 2. Tag mode (tap-to-hide) — per-site rules
// ---------------------------------------------------------------------------

/** Per-site tag rules: host -> selectors hidden on that host. */
export type TagRules = Record<string, string[]>;

/** Add a selector for a host (deduped). Returns a new object. */
export function addTagRule(rules: TagRules, host: string, selector: string): TagRules {
  const cleanHost = host.trim().toLowerCase();
  const cleanSelector = selector.trim();
  if (!cleanHost || !cleanSelector) return { ...rules };
  const existing = rules[cleanHost] ?? [];
  if (existing.includes(cleanSelector)) return { ...rules };
  return { ...rules, [cleanHost]: [...existing, cleanSelector] };
}

/** Remove a selector for a host (drops the host when it becomes
 * empty). Returns a new object. */
export function removeTagRule(rules: TagRules, host: string, selector: string): TagRules {
  const cleanHost = host.trim().toLowerCase();
  const next: TagRules = { ...rules };
  const existing = (next[cleanHost] ?? []).filter((s) => s !== selector);
  if (existing.length === 0) delete next[cleanHost];
  else next[cleanHost] = existing;
  return next;
}

/**
 * Build the most specific stable selector for a tapped element.
 * Prefers #id, then tag + distinctive classes (first two, skipping
 * obviously generated/hashed class names), then tag + :nth-of-type()
 * as a last resort. Never returns a bare structural tag.
 */
export function selectorForElement(descriptor: {
  tag: string;
  id: string;
  classes: string[];
  nthOfType?: number;
}): string {
  const tag = descriptor.tag.toLowerCase();
  if (descriptor.id && /^[A-Za-z][\w:.-]*$/.test(descriptor.id)) {
    return `#${descriptor.id}`;
  }
  const stableClasses = descriptor.classes
    .filter((c) => /^[A-Za-z_][\w-]*$/.test(c))
    // Skip hashed/generated class names (long mixed-case/digit runs).
    .filter((c) => !/^[a-z]{2,}\d{4,}/.test(c) && c.length <= 40)
    .slice(0, 2);
  if (stableClasses.length > 0) {
    return `${tag}.${stableClasses.join('.')}`;
  }
  if (descriptor.nthOfType && descriptor.nthOfType > 0) {
    return `${tag}:nth-of-type(${descriptor.nthOfType})`;
  }
  return tag;
}

// ---------------------------------------------------------------------------
// 3. Dark mode
// ---------------------------------------------------------------------------

export function shouldApplyDarkMode(
  mode: 'auto' | 'light' | 'dark',
  prefersDark: boolean,
): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return prefersDark;
}

/**
 * The dark-mode stylesheet. Deliberate tradeoff (documented here
 * because it is a product decision, not an oversight):
 *
 * - It overrides background / text / border colours and sets
 *   `color-scheme: dark` so form controls and scrollbars go dark.
 * - It does NOT use a global `filter: invert()` — inversion wrecks
 *   photos, videos, charts and brand colours, and makes already-dark
 *   sites unreadable. Images, video, canvas, SVG and iframes are
 *   explicitly left alone (only their backgrounds are neutralised).
 * - What it cannot do: sites that paint everything with inline
 *   styles, canvas-drawn text, or white-background images will keep
 *   light patches. That is the honest limit of a stylesheet-only
 *   dark mode; a per-site fix list would be needed to go further.
 */
export function buildDarkModeCss(): string {
  return [
    ':root{color-scheme:dark}',
    'html{background-color:#121212 !important}',
    'body{background-color:#121212 !important;color:#e8e8e8 !important}',
    'body,div,span,p,a,li,ul,ol,section,article,header,footer,nav,aside,main,table,thead,tbody,tr,td,th,form,label,button,input,select,textarea{border-color:#3a3a3c !important}',
    'h1,h2,h3,h4,h5,h6{color:#f5f5f7 !important}',
    'p,span,div,li,td,th,label{color:#e8e8e8 !important}',
    'a{color:#8ab4f8 !important}',
    'a:visited{color:#c58af9 !important}',
    'input,select,textarea{background-color:#2c2c2e !important;color:#f5f5f7 !important}',
    'button{background-color:#2c2c2e !important;color:#f5f5f7 !important}',
    'pre,code{background-color:#1c1c1e !important;color:#e8e8e8 !important}',
    'img,video,canvas,svg,iframe,picture{filter:none !important}',
    'img,video{ background-color:transparent !important}',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 4. Smart search
// ---------------------------------------------------------------------------

export { defaultSearchEngines };

export interface SmartSearchResult {
  engine: SearchEngine;
  query: string;
  url: string;
}

/**
 * Resolve a smart-search input to an engine + URL.
 *
 * prefix mode: "bd 猫" -> Baidu, query "猫"; "g cats" -> Google.
 * suffix mode: "猫 bd" -> Baidu, query "猫"; "cats g" -> Google.
 * The trigger word must match exactly (case-insensitive); the query
 * is everything else, trimmed. When no trigger matches, the whole
 * text is the query on the default engine (the first engine in the
 * list). Returns null for empty input.
 */
export function parseSmartSearch(
  input: string,
  engines: SearchEngine[],
  trigger: 'prefix' | 'suffix',
): SmartSearchResult | null {
  const text = input.trim();
  if (!text) return null;
  const list = engines.length > 0 ? engines : defaultSearchEngines();
  const fallback = list[0];
  const tokens = text.split(/\s+/);
  const findEngine = (word: string): SearchEngine | undefined =>
    list.find((e) => e.trigger.toLowerCase() === word.toLowerCase());
  if (trigger === 'prefix') {
    const engine = findEngine(tokens[0]);
    if (engine) {
      const query = tokens.slice(1).join(' ');
      if (!query) return null;
      return { engine, query, url: engine.url.replace('{q}', encodeURIComponent(query)) };
    }
  } else {
    const engine = findEngine(tokens[tokens.length - 1]);
    if (engine) {
      const query = tokens.slice(0, -1).join(' ');
      if (!query) return null;
      return { engine, query, url: engine.url.replace('{q}', encodeURIComponent(query)) };
    }
  }
  return { engine: fallback, query: text, url: fallback.url.replace('{q}', encodeURIComponent(text)) };
}

// ---------------------------------------------------------------------------
// 5. Media detection (sniffing)
// ---------------------------------------------------------------------------

export type MediaType = 'video' | 'audio' | 'manifest' | 'other';

export interface MediaItem {
  url: string;
  type: MediaType;
  size?: number;
}

const MEDIA_EXTENSIONS: Record<string, MediaType> = {
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  mkv: 'video',
  m3u8: 'manifest',
  mpd: 'manifest',
  mp3: 'audio',
  m4a: 'audio',
  aac: 'audio',
  ogg: 'audio',
  wav: 'audio',
  flac: 'audio',
};

/** Classify a URL as media (or null when it is not recognisable
 * media). Handles query strings and fragments. */
export function classifyMediaUrl(url: string): MediaItem | null {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return null;
  }
  const match = /\.([a-z0-9]+)$/.exec(path);
  if (!match) return null;
  const type = MEDIA_EXTENSIONS[match[1]];
  if (!type) return null;
  return { url, type };
}

/** Classify + dedupe a list of candidate URLs (first occurrence
 * wins; blob: URLs are kept, data: URLs are dropped — they are not
 * downloadable or shareable). */
export function extractMediaItems(candidates: string[]): MediaItem[] {
  const seen = new Set<string>();
  const items: MediaItem[] = [];
  for (const candidate of candidates) {
    if (!candidate || candidate.startsWith('data:')) continue;
    const item = classifyMediaUrl(candidate);
    if (!item) continue;
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    items.push(item);
  }
  return items;
}

/** Merge a fresh scan into a previous list, keeping known sizes. */
export function mergeMediaItems(previous: MediaItem[], fresh: MediaItem[]): MediaItem[] {
  const sizes = new Map(previous.map((i) => [i.url, i.size]));
  return fresh.map((item) => {
    const size = sizes.get(item.url);
    return size !== undefined ? { ...item, size } : item;
  });
}

/**
 * One detected media resource in the native reportResources shape
 * (shared with the Swift host app): the native handler reads these
 * from the message and stores them under the shared key
 * openmonkey.resources.v1. detectedAt is a Unix timestamp in
 * seconds; the native side normalises it to ISO-8601.
 */
export interface NativeResource {
  url: string;
  title?: string;
  /** "video" | "audio" | "manifest" (HLS/DASH) — plain string so the
   * native side is not coupled to this module's MediaType. */
  type: string;
  pageURL?: string;
  detectedAt?: number;
}

function filenameOf(url: string): string {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    return name || url;
  } catch {
    return url;
  }
}

/** Convert scanned media items to the native reportResources shape. */
export function toNativeResources(items: MediaItem[], pageUrl: string, detectedAtSec?: number): NativeResource[] {
  const detectedAt = detectedAtSec ?? Math.floor(Date.now() / 1000);
  return items.map((item) => ({
    url: item.url,
    title: filenameOf(item.url),
    type: item.type,
    pageURL: pageUrl,
    detectedAt,
  }));
}
