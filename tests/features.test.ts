// OpenMonkey for Safari — v0.5.0 page-feature tests.
//
// Covers the pure logic in src/features.ts (ad filter, tag rules,
// dark mode, smart search, media detection) and the shared settings
// contract in src/settings.ts (defaults, migration, native merge).
// Run via `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AD_SELECTORS,
  addTagRule,
  buildAdFilterCss,
  buildDarkModeCss,
  classifyMediaUrl,
  extractMediaItems,
  isSafeAdSelector,
  mergeMediaItems,
  parseSmartSearch,
  removeTagRule,
  selectorForElement,
  shouldApplyDarkMode,
  toNativeResources,
} from '../extension/src/features.js';
import {
  DEFAULT_SETTINGS,
  mergeNativeSettings,
  normaliseSettings,
} from '../extension/src/settings.js';
import { defaultSearchEngines } from '../extension/src/features.js';

// --- Ad filter -----------------------------------------------------------

test('ad filter: built-in list is specific — no bare structural selectors', () => {
  assert.ok(DEFAULT_AD_SELECTORS.length >= 20);
  for (const selector of DEFAULT_AD_SELECTORS) {
    assert.ok(!/^(div|main|article|section|body|html|\*)$/.test(selector.trim()), selector);
    assert.ok(isSafeAdSelector(selector), selector);
  }
});

test('ad filter: CSS hides the selectors and nothing else', () => {
  const css = buildAdFilterCss(['ins.adsbygoogle', '[id^="google_ads"]']);
  assert.ok(css.includes('ins.adsbygoogle'));
  assert.ok(css.includes('[id^="google_ads"]'));
  assert.ok(css.includes('display:none !important'));
  assert.equal(buildAdFilterCss([]), '');
  assert.equal(buildAdFilterCss(['div']), '');
});

test('ad filter: unsafe user selectors are rejected', () => {
  for (const bad of [
    '',
    'div',
    'body',
    'main',
    '*',
    'html',
    'div { color: red }',
    '.ad; color: red',
    '.ad !important',
    'span',
    'a',
  ]) {
    assert.equal(isSafeAdSelector(bad), false, bad);
  }
  for (const good of [
    '.my-ad-banner',
    '#sponsored-box',
    '[data-ad="1"]',
    'div.ad-slot',
    'iframe[src*="doubleclick"]',
    '.sidebar .ad-unit',
  ]) {
    assert.equal(isSafeAdSelector(good), true, good);
  }
});

// --- Tag rules -----------------------------------------------------------

test('tag rules: add dedupes, remove drops empty hosts', () => {
  const rules = addTagRule({}, 'Example.com', '#ad-box');
  assert.deepEqual(rules, { 'example.com': ['#ad-box'] });
  assert.deepEqual(addTagRule(rules, 'example.com', '#ad-box'), rules);
  const added = addTagRule(rules, 'example.com', '.promo');
  assert.deepEqual(added['example.com'], ['#ad-box', '.promo']);
  const removed = removeTagRule(added, 'example.com', '#ad-box');
  assert.deepEqual(removed, { 'example.com': ['.promo'] });
  assert.deepEqual(removeTagRule(removed, 'example.com', '.promo'), {});
});

test('tag rules: selector prefers id, then stable classes, then nth-of-type', () => {
  assert.equal(
    selectorForElement({ tag: 'DIV', id: 'promo-box', classes: ['a', 'b'] }),
    '#promo-box',
  );
  assert.equal(
    selectorForElement({ tag: 'div', id: '', classes: ['ad-unit', 'x'] }),
    'div.ad-unit.x',
  );
  assert.equal(
    selectorForElement({ tag: 'section', id: '', classes: [], nthOfType: 3 }),
    'section:nth-of-type(3)',
  );
});

// --- Dark mode -----------------------------------------------------------

test('dark mode: auto follows the system, light/dark force it', () => {
  assert.equal(shouldApplyDarkMode('auto', true), true);
  assert.equal(shouldApplyDarkMode('auto', false), false);
  assert.equal(shouldApplyDarkMode('dark', false), true);
  assert.equal(shouldApplyDarkMode('light', true), false);
});

test('dark mode: stylesheet overrides colours, never inverts images', () => {
  const css = buildDarkModeCss();
  assert.ok(css.includes('color-scheme:dark'));
  assert.ok(css.includes('background-color:#121212'));
  assert.ok(!css.includes('invert('), 'must not use a filter inversion');
  assert.ok(css.includes('img,video,canvas,svg,iframe,picture{filter:none'));
});

// --- Smart search --------------------------------------------------------

test('smart search: prefix trigger resolves the engine and query', () => {
  const engines = defaultSearchEngines();
  const result = parseSmartSearch('bd 猫', engines, 'prefix');
  assert.ok(result);
  assert.equal(result.engine.trigger, 'bd');
  assert.equal(result.query, '猫');
  assert.equal(result.url, 'https://www.baidu.com/s?wd=%E7%8C%AB');
  const google = parseSmartSearch('g cats', engines, 'prefix');
  assert.equal(google?.engine.trigger, 'g');
  assert.equal(google?.url, 'https://www.google.com/search?q=cats');
});

test('smart search: suffix trigger takes the last word', () => {
  const engines = defaultSearchEngines();
  const result = parseSmartSearch('猫 bd', engines, 'suffix');
  assert.equal(result?.engine.trigger, 'bd');
  assert.equal(result?.query, '猫');
  // A prefix-style input in suffix mode falls back to the default engine.
  const fallback = parseSmartSearch('bd 猫', engines, 'suffix');
  assert.equal(fallback?.engine.trigger, 'bd');
  assert.equal(fallback?.query, 'bd 猫');
});

test('smart search: no trigger falls back to the default engine', () => {
  const engines = defaultSearchEngines();
  const result = parseSmartSearch('just a query', engines, 'prefix');
  assert.equal(result?.engine.id, 'baidu');
  assert.equal(result?.query, 'just a query');
  assert.equal(result?.url, 'https://www.baidu.com/s?wd=just%20a%20query');
  assert.equal(parseSmartSearch('   ', engines, 'prefix'), null);
  assert.equal(parseSmartSearch('bd', engines, 'prefix'), null);
  // Trigger matching is case-insensitive.
  assert.equal(parseSmartSearch('BD 猫', engines, 'prefix')?.engine.trigger, 'bd');
});

// --- Media detection ------------------------------------------------------

test('media detection: classifies known extensions, ignores the rest', () => {
  assert.deepEqual(classifyMediaUrl('https://x.com/v.mp4'), {
    url: 'https://x.com/v.mp4',
    type: 'video',
  });
  assert.equal(classifyMediaUrl('https://x.com/list.m3u8')?.type, 'manifest');
  assert.equal(classifyMediaUrl('https://x.com/a.mp3?token=1')?.type, 'audio');
  assert.equal(classifyMediaUrl('https://x.com/page.html'), null);
  assert.equal(classifyMediaUrl('https://x.com/img.png'), null);
  assert.equal(classifyMediaUrl('not a url'), null);
});

test('media detection: extraction dedupes and drops data URLs', () => {
  const items = extractMediaItems([
    'https://x.com/a.mp4',
    'https://x.com/a.mp4',
    'data:video/mp4;base64,AAAA',
    'https://x.com/b.mp3',
    'https://x.com/c.html',
  ]);
  assert.deepEqual(items.map((i) => i.url), ['https://x.com/a.mp4', 'https://x.com/b.mp3']);
});

test('media detection: merge keeps known sizes', () => {
  const merged = mergeMediaItems(
    [{ url: 'https://x.com/a.mp4', type: 'video', size: 123 }],
    [
      { url: 'https://x.com/a.mp4', type: 'video' },
      { url: 'https://x.com/b.mp4', type: 'video' },
    ],
  );
  assert.equal(merged[0].size, 123);
  assert.equal(merged[1].size, undefined);
});

test('media detection: native reportResources shape', () => {
  const resources = toNativeResources(
    [
      { url: 'https://x.com/v.mp4', type: 'video' },
      { url: 'https://x.com/list.m3u8', type: 'manifest' },
    ],
    'https://x.com/page',
    1794800000,
  );
  assert.deepEqual(resources, [
    {
      url: 'https://x.com/v.mp4',
      title: 'v.mp4',
      type: 'video',
      pageURL: 'https://x.com/page',
      detectedAt: 1794800000,
    },
    {
      url: 'https://x.com/list.m3u8',
      title: 'list.m3u8',
      type: 'manifest',
      pageURL: 'https://x.com/page',
      detectedAt: 1794800000,
    },
  ]);
  // detectedAt defaults to a Unix timestamp in seconds.
  const now = Math.floor(Date.now() / 1000);
  const [one] = toNativeResources([{ url: 'https://x.com/a.mp3', type: 'audio' }], 'https://x.com/');
  assert.ok(typeof one.detectedAt === 'number');
  assert.ok(Math.abs((one.detectedAt ?? 0) - now) < 5);
});

// --- Settings contract ----------------------------------------------------

test('settings: v0.5.0 defaults match the shared contract', () => {
  assert.equal(DEFAULT_SETTINGS.darkMode, 'auto');
  assert.equal(DEFAULT_SETTINGS.darkModeEnabled, false);
  assert.equal(DEFAULT_SETTINGS.adFilterEnabled, false);
  assert.deepEqual(DEFAULT_SETTINGS.customAdRules, []);
  assert.equal(DEFAULT_SETTINGS.tagModeEnabled, false);
  assert.equal(DEFAULT_SETTINGS.smartSearchEnabled, false);
  assert.equal(DEFAULT_SETTINGS.smartSearchTrigger, 'prefix');
  assert.deepEqual(
    DEFAULT_SETTINGS.smartSearchEngines.map((e) => e.trigger),
    ['bd', 'g', 'bing'],
  );
  assert.equal(DEFAULT_SETTINGS.sniffEnabled, false);
  assert.equal(DEFAULT_SETTINGS.resourceDetectionEnabled, true);
  assert.equal(DEFAULT_SETTINGS.showSniffButton, true);
  assert.equal(DEFAULT_SETTINGS.longPressSniff, true);
  assert.equal(DEFAULT_SETTINGS.fileSort, 'timeAsc');
  assert.equal(DEFAULT_SETTINGS.showPromptPopups, true);
  assert.equal(DEFAULT_SETTINGS.syncEnabled, false);
  assert.equal(DEFAULT_SETTINGS.language, 'system');
});

test('settings: v0.4.0 stored settings migrate cleanly', () => {
  const migrated = normaliseSettings({
    globalEnabled: false,
    updateCheckIntervalDays: 7,
    language: 'zh',
  });
  assert.equal(migrated.globalEnabled, false);
  assert.equal(migrated.updateCheckIntervalDays, 7);
  assert.equal(migrated.language, 'zh');
  assert.equal(migrated.darkMode, 'auto');
  assert.equal(migrated.darkModeEnabled, false);
  assert.equal(migrated.adFilterEnabled, false);
  assert.equal(migrated.resourceDetectionEnabled, true);
  assert.deepEqual(migrated.smartSearchEngines.map((e) => e.trigger), ['bd', 'g', 'bing']);
  assert.equal(migrated.fileSort, 'timeAsc');
});

test('settings: normalise rejects bad values and bad engines', () => {
  const settings = normaliseSettings({
    darkMode: 'purple',
    adFilterEnabled: 'yes',
    customAdRules: ['.ok', 42, null],
    smartSearchTrigger: 'middle',
    smartSearchEngines: [{ id: 'x', name: 'X', trigger: 'x', url: 'https://x.com/?q=nope' }],
    fileSort: 'random',
  });
  assert.equal(settings.darkMode, 'auto');
  assert.equal(settings.adFilterEnabled, false);
  assert.deepEqual(settings.customAdRules, ['.ok']);
  assert.equal(settings.smartSearchTrigger, 'prefix');
  assert.deepEqual(
    settings.smartSearchEngines.map((e) => e.trigger),
    ['bd', 'g', 'bing'],
  );
  assert.equal(settings.fileSort, 'timeAsc');
});

test('settings: native merge wins for the new OpenMonkey* keys', () => {
  const merged = mergeNativeSettings(DEFAULT_SETTINGS, {
    ok: true,
    OpenMonkeyDarkMode: 'dark',
    OpenMonkeyDarkModeEnabled: true,
    OpenMonkeyAdFilterEnabled: true,
    OpenMonkeyTagModeEnabled: true,
    OpenMonkeySmartSearchEnabled: true,
    OpenMonkeySmartSearchTrigger: 'suffix',
    OpenMonkeySniffEnabled: true,
    OpenMonkeyResourceDetectionEnabled: false,
    OpenMonkeyShowSniffButton: false,
    OpenMonkeyLongPressSniff: false,
  });
  assert.equal(merged.darkMode, 'dark');
  assert.equal(merged.darkModeEnabled, true);
  assert.equal(merged.adFilterEnabled, true);
  assert.equal(merged.tagModeEnabled, true);
  assert.equal(merged.smartSearchEnabled, true);
  assert.equal(merged.smartSearchTrigger, 'suffix');
  assert.equal(merged.sniffEnabled, true);
  assert.equal(merged.resourceDetectionEnabled, false);
  assert.equal(merged.showSniffButton, false);
  assert.equal(merged.longPressSniff, false);
  // Never clobbered by the native side.
  assert.equal(merged.updateCheckIntervalDays, 1);
  assert.deepEqual(merged.customAdRules, []);
});

test('settings: native merge still accepts the v0.4.0 camelCase reply', () => {
  const merged = mergeNativeSettings(
    { ...DEFAULT_SETTINGS, globalEnabled: true, language: 'zh' },
    { ok: true, globalEnabled: false, language: 'en' },
  );
  assert.equal(merged.globalEnabled, false);
  assert.equal(merged.language, 'en');
  const bad = mergeNativeSettings(DEFAULT_SETTINGS, {
    ok: true,
    OpenMonkeyDarkMode: 'purple',
    OpenMonkeyAdFilterEnabled: 'yes',
  });
  assert.equal(bad.darkMode, 'auto');
  assert.equal(bad.adFilterEnabled, false);
});

// --- Native reportResources bridge ----------------------------------------

test('resources: OM_REPORT_RESOURCES forwards natively and stores the dual shape', async () => {
  const { handleOmMessage } = await import('../extension/src/background/index.js');
  const { createRegistry, createInMemoryStorageAdapter } = await import(
    '../extension/src/background/registry.js'
  );
  const nativeMessages: unknown[] = [];
  const stored: Record<string, unknown> = {};
  const g = globalThis as Record<string, unknown>;
  const previousChrome = g.chrome;
  g.chrome = {
    runtime: {
      sendNativeMessage: (_host: string, message: unknown, cb: (r: unknown) => void) => {
        nativeMessages.push(message);
        cb({ ok: true });
      },
    },
    storage: {
      local: {
        set: (items: Record<string, unknown>, cb: () => void) => {
          Object.assign(stored, items);
          cb();
        },
      },
    },
  };
  try {
    const response = await handleOmMessage(
      {
        type: 'OM_REPORT_RESOURCES',
        url: 'https://x.com/page',
        items: [{ url: 'https://x.com/v.mp4', type: 'video', size: 10 }],
      },
      { registry: createRegistry(createInMemoryStorageAdapter()) },
      { tab: { id: 7 } },
    );
    assert.equal(response.ok, true);
    assert.equal(nativeMessages.length, 1);
    const native = nativeMessages[0] as {
      type: string;
      resources: Array<Record<string, unknown>>;
    };
    assert.equal(native.type, 'reportResources');
    assert.equal(native.resources[0].url, 'https://x.com/v.mp4');
    assert.equal(native.resources[0].type, 'video');
    assert.equal(native.resources[0].pageURL, 'https://x.com/page');
    assert.equal(typeof native.resources[0].detectedAt, 'number');
    const snapshot = stored['openmonkey.resources.v1'] as {
      tabId: number;
      url: string;
      items: Array<Record<string, unknown>>;
      resources: Array<Record<string, unknown>>;
    };
    assert.equal(snapshot.tabId, 7);
    assert.equal(snapshot.url, 'https://x.com/page');
    assert.equal(snapshot.items[0].url, 'https://x.com/v.mp4');
    assert.equal(snapshot.resources[0].url, 'https://x.com/v.mp4');
  } finally {
    if (previousChrome === undefined) delete g.chrome;
    else g.chrome = previousChrome;
  }
});
