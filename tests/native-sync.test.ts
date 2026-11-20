// OpenMonkey for Safari — native settings sync tests (v0.4.0).
//
// The shared contract (docs/ui-redesign.md §8): the native host app
// owns OpenMonkeyGlobalEnabled / OpenMonkeyLanguage in the App Group;
// the background merges its getSettings reply into
// openmonkey.settings.v1 — native wins for globalEnabled and language
// when present, updateCheckIntervalDays is never clobbered, and any
// failure keeps the local values. Run via `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleOmMessage,
  mergeNativeSettings,
  syncNativeSettings,
  type BackgroundDeps,
  type ExtensionSettings,
} from '../extension/src/background/index.js';
import { DEFAULT_SETTINGS } from '../extension/src/settings.js';
import { createInMemoryStorageAdapter, createRegistry } from '../extension/src/background/registry.js';

const LOCAL: ExtensionSettings = {
  ...DEFAULT_SETTINGS,
  updateCheckIntervalDays: 7,
  language: 'zh',
};

function fakeDeps(): BackgroundDeps {
  return { registry: createRegistry(createInMemoryStorageAdapter()) };
}

test('native sync: native wins for globalEnabled and language', () => {
  const merged = mergeNativeSettings(LOCAL, {
    ok: true,
    globalEnabled: false,
    language: 'en',
  });
  assert.equal(merged.globalEnabled, false);
  assert.equal(merged.language, 'en');
  assert.equal(merged.updateCheckIntervalDays, 7);
});

test('native sync: native "system" language wins over a local explicit language', () => {
  const merged = mergeNativeSettings(LOCAL, { ok: true, language: 'system' });
  assert.equal(merged.language, 'system');
  assert.equal(merged.globalEnabled, true);
});

test('native sync: updateCheckIntervalDays is never clobbered', () => {
  const merged = mergeNativeSettings(LOCAL, {
    ok: true,
    globalEnabled: false,
    language: 'en',
    updateCheckIntervalDays: 30,
  });
  assert.equal(merged.updateCheckIntervalDays, 7);
});

test('native sync: a partial native reply only overrides what it carries', () => {
  assert.deepEqual(mergeNativeSettings(LOCAL, { ok: true, globalEnabled: false }), {
    ...LOCAL,
    globalEnabled: false,
  });
  assert.deepEqual(mergeNativeSettings(LOCAL, { ok: true, language: 'en' }), {
    ...LOCAL,
    language: 'en',
  });
  assert.deepEqual(mergeNativeSettings(LOCAL, { ok: true }), { ...LOCAL });
});

test('native sync: native failure keeps the local settings', () => {
  for (const native of [
    null,
    undefined,
    'oops',
    42,
    { ok: false, error: 'host not found' },
    { ok: true, globalEnabled: 'yes', language: 'fr' },
    { ok: true, globalEnabled: 1, language: null },
  ]) {
    assert.deepEqual(mergeNativeSettings(LOCAL, native), { ...LOCAL });
  }
});

test('native sync: OM_SYNC_NATIVE_SETTINGS returns local settings when native messaging is absent', async () => {
  // Node has no chrome runtime, so the native query fails silently
  // and the local (default) settings are returned unchanged.
  const response = await handleOmMessage({ type: 'OM_SYNC_NATIVE_SETTINGS' }, fakeDeps());
  assert.equal(response.ok, true);
  assert.deepEqual(response.settings, { ...DEFAULT_SETTINGS });
  // The exported sync helper behaves the same way standalone.
  assert.deepEqual(await syncNativeSettings(), { ...DEFAULT_SETTINGS });
});
