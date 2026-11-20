// OpenMonkey for Safari — GM values persistence tests.
// GM_setValue / GM_getValue must survive a new registry instance sharing
// the same storage (navigation / reload / extension restart), and must be
// namespaced per script. The background message round-trip is covered too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUserScript } from '../extension/src/parser/metablock.js';
import {
  createRegistry,
  createInMemoryStorageAdapter,
} from '../extension/src/background/registry.js';
import { handleOmMessage } from '../extension/src/background/index.js';

const SAMPLE = `// ==UserScript==
// @name        Values Script
// @namespace   https://example.com/
// @version     1.0
// @match       https://example.com/*
// @grant       GM_setValue
// @grant       GM_getValue
// ==/UserScript==
GM_setValue('visits', 3);
`;

async function makeRegistry() {
  const storage = createInMemoryStorageAdapter();
  const registry = createRegistry(storage);
  const parsed = parseUserScript(SAMPLE);
  assert.deepEqual(parsed.errors, []);
  const saved = await registry.saveScript({ metadata: parsed.metadata, source: parsed.source });
  return { storage, registry, saved };
}

test('GM values persist across registry instances sharing the same storage', async () => {
  const { storage, registry, saved } = await makeRegistry();
  await registry.setGMValue(saved.id, 'visits', 3);
  await registry.setGMValue(saved.id, 'name', 'alice');
  await registry.setGMValue(saved.id, 'flags', { dark: true });

  // A fresh registry over the same storage is a fresh page load / restart.
  const reloaded = createRegistry(storage);
  assert.deepEqual(await reloaded.getGMValues(saved.id), {
    visits: 3,
    name: 'alice',
    flags: { dark: true },
  });
});

test('GM values are namespaced per script and deleted values stay deleted', async () => {
  const { registry, saved } = await makeRegistry();
  await registry.setGMValue(saved.id, 'k', 'v1');
  await registry.deleteGMValue(saved.id, 'k');
  assert.deepEqual(await registry.getGMValues(saved.id), {});

  // A second script gets its own empty namespace.
  const other = await registry.saveScript({
    metadata: { ...parseUserScript(SAMPLE).metadata, name: 'Other Script' },
    source: SAMPLE,
  });
  assert.deepEqual(await registry.getGMValues(other.id), {});
  await registry.setGMValue(other.id, 'k', 'v2');
  assert.deepEqual(await registry.getGMValues(saved.id), {});
  assert.deepEqual(await registry.getGMValues(other.id), { k: 'v2' });
});

test('removing a script clears its GM values', async () => {
  const { registry, saved } = await makeRegistry();
  await registry.setGMValue(saved.id, 'k', 1);
  assert.equal(await registry.removeScript(saved.id), true);
  assert.deepEqual(await registry.getGMValues(saved.id), {});
});

test('background OM_GM_* messages round-trip through the registry', async () => {
  const { registry, saved } = await makeRegistry();
  const deps = { registry };
  const setRes = await handleOmMessage(
    { type: 'OM_GM_SET_VALUE', scriptId: saved.id, name: 'visits', value: 7 },
    deps,
  );
  assert.equal(setRes.ok, true);
  const getRes = await handleOmMessage({ type: 'OM_GM_GET_VALUES', scriptId: saved.id }, deps);
  assert.deepEqual(getRes.values, { visits: 7 });
  const delRes = await handleOmMessage(
    { type: 'OM_GM_DELETE_VALUE', scriptId: saved.id, name: 'visits' },
    deps,
  );
  assert.equal(delRes.ok, true);
  const after = await handleOmMessage({ type: 'OM_GM_GET_VALUES', scriptId: saved.id }, deps);
  assert.deepEqual(after.values, {});
});
