// OpenMonkey for Safari — i18n tests (v0.4.0).
//
// The English dictionary is the reference: every key must exist in
// Chinese too, with no empty strings, and language resolution must
// follow the stored preference (explicit zh/en wins; "system" follows
// navigator.language). Run via `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  i18nKeys,
  resolveLanguage,
  translate,
  type I18nKey,
  type Language,
} from '../extension/src/i18n.js';
import { DEFAULT_SETTINGS, getSettings } from '../extension/src/pages/storage.js';

const LANGUAGES: Language[] = ['en', 'zh'];

test('i18n: every key is present in both languages with a non-empty string', () => {
  const keys = i18nKeys();
  assert.ok(keys.length > 50, `expected a large dictionary, got ${keys.length}`);
  for (const key of keys) {
    for (const lang of LANGUAGES) {
      const value = translate(key, lang);
      assert.equal(typeof value, 'string', `${key} (${lang}) must be a string`);
      assert.ok(value.length > 0, `${key} (${lang}) must not be empty`);
    }
  }
});

test('i18n: the Chinese and English dictionaries carry the same key set', () => {
  // translate() indexes the zh record typed as Record<I18nKey, string>,
  // so a missing zh key would be a type error; this test pins the
  // runtime shape too: every en key must resolve to a defined zh value.
  for (const key of i18nKeys()) {
    assert.notEqual(translate(key, 'zh'), undefined, `zh is missing ${key}`);
  }
});

test('i18n: interpolation fills every placeholder', () => {
  const keysWithVars: Array<[I18nKey, Record<string, string | number>]> = [
    ['runningMatched', { running: 2, matched: 5 }],
    ['updatedOn', { date: '2026-11-16' }],
    ['libraryCount', { enabled: 3, total: 4 }],
    ['updateAvailable', { version: '1.2.3' }],
    ['deleteConfirm', { name: 'Demo script' }],
  ];
  for (const [key, vars] of keysWithVars) {
    for (const lang of LANGUAGES) {
      const value = translate(key, lang, vars);
      assert.ok(!value.includes('{'), `${key} (${lang}) has an unfilled placeholder: ${value}`);
      for (const v of Object.values(vars)) {
        assert.ok(value.includes(String(v)), `${key} (${lang}) is missing ${v}: ${value}`);
      }
    }
  }
});

test('i18n: language resolution — system follows the browser language', () => {
  assert.equal(resolveLanguage('system', 'zh-CN'), 'zh');
  assert.equal(resolveLanguage('system', 'zh-TW'), 'zh');
  assert.equal(resolveLanguage('system', 'zh-HK'), 'zh');
  assert.equal(resolveLanguage('system', 'zh'), 'zh');
  assert.equal(resolveLanguage('system', 'en-US'), 'en');
  assert.equal(resolveLanguage('system', 'en'), 'en');
  assert.equal(resolveLanguage('system', 'de-DE'), 'en');
  assert.equal(resolveLanguage('system', ''), 'en');
});

test('i18n: language resolution — an explicit setting beats the system language', () => {
  assert.equal(resolveLanguage('zh', 'en-US'), 'zh');
  assert.equal(resolveLanguage('en', 'zh-CN'), 'en');
  assert.equal(resolveLanguage('zh', undefined), 'zh');
  assert.equal(resolveLanguage('en', undefined), 'en');
});

test('i18n: language resolution — a missing or unknown setting follows the system', () => {
  assert.equal(resolveLanguage(undefined, 'zh-CN'), 'zh');
  assert.equal(resolveLanguage(null, 'en-US'), 'en');
  assert.equal(resolveLanguage('fr' as never, 'zh-CN'), 'zh');
});

test('settings: defaults carry language "system"', () => {
  assert.equal(DEFAULT_SETTINGS.language, 'system');
  assert.equal(DEFAULT_SETTINGS.globalEnabled, true);
  assert.equal(DEFAULT_SETTINGS.updateCheckIntervalDays, 1);
});

test('settings: old stored settings without a language migrate to "system"', async () => {
  // Node has no chrome or localStorage; stub the localStorage fallback
  // that storage.ts reads when the extension API is absent.
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  try {
    store.set(
      'openmonkey.settings.v1',
      JSON.stringify({ globalEnabled: false, updateCheckIntervalDays: 7 }),
    );
    const migrated = await getSettings();
    assert.equal(migrated.language, 'system');
    assert.equal(migrated.globalEnabled, false);
    assert.equal(migrated.updateCheckIntervalDays, 7);

    store.set(
      'openmonkey.settings.v1',
      JSON.stringify({ globalEnabled: true, updateCheckIntervalDays: 1, language: 'zh' }),
    );
    assert.equal((await getSettings()).language, 'zh');

    store.set(
      'openmonkey.settings.v1',
      JSON.stringify({ globalEnabled: true, updateCheckIntervalDays: 1, language: 'fr' }),
    );
    assert.equal((await getSettings()).language, 'system');
  } finally {
    delete (globalThis as Record<string, unknown>).localStorage;
  }
});
