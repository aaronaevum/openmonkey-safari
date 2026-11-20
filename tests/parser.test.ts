// OpenMonkey for Safari — parser tests.
// Run via `npm test` (the build agent wires a TS runner, e.g. ts-node or
// esbuild-register, for these TypeScript tests using node:test).
// These tests import the TypeScript sources directly; they are not meant
// to be run with plain `node` against uncompiled .ts files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUserScript } from '../extension/src/parser/metablock.js';

const SAMPLE = `// ==UserScript==
// @name        Example Script
// @name:zh-CN  示例脚本
// @namespace   https://example.com/
// @version     1.2.3
// @description A test script
// @description:de Ein Testskript
// @author      Alice
// @match       https://example.com/*
// @match       https://*.example.org/*
// @include     https://other.com/*
// @grant       GM_setValue
// @grant       GM_getValue
// @connect     example.com
// @run-at      document-start
// ==/UserScript==
console.log('hello');
`;

test('parses name, version, author and multi-value @match', () => {
  const { metadata, errors } = parseUserScript(SAMPLE);
  assert.deepEqual(errors, []);
  assert.equal(metadata.name, 'Example Script');
  assert.equal(metadata.namespace, 'https://example.com/');
  assert.equal(metadata.version, '1.2.3');
  assert.equal(metadata.author, 'Alice');
  assert.deepEqual(metadata.match, ['https://example.com/*', 'https://*.example.org/*']);
  assert.deepEqual(metadata.include, ['https://other.com/*']);
  assert.deepEqual(metadata.grant, ['GM_setValue', 'GM_getValue']);
  assert.deepEqual(metadata.connect, ['example.com']);
  assert.equal(metadata.runAt, 'document-start');
});

test('parses locale names and descriptions', () => {
  const { metadata } = parseUserScript(SAMPLE);
  assert.equal(metadata.nameLocales['zh-CN'], '示例脚本');
  assert.equal(metadata.descriptionLocales['de'], 'Ein Testskript');
  assert.equal(metadata.description, 'A test script');
});

test('code is the source after the metadata block; source is verbatim', () => {
  const parsed = parseUserScript(SAMPLE);
  assert.equal(parsed.code.trim(), "console.log('hello');");
  assert.equal(parsed.source, SAMPLE);
  assert.ok(!parsed.code.includes('==UserScript=='));
});

test('missing metadata block is an error', () => {
  const parsed = parseUserScript("console.log('no block');");
  assert.ok(parsed.errors.length > 0);
  assert.match(parsed.errors.join(' '), /Missing metadata block/);
  assert.equal(parsed.code, "console.log('no block');");
});

test('missing @match/@include warns the script will not run', () => {
  const parsed = parseUserScript(
    '// ==UserScript==\n// @name No Rules\n// @version 1.0\n// ==/UserScript==\nvoid 0;\n',
  );
  assert.ok(parsed.warnings.some((w) => w.includes('will not run')));
});

test('@grant none plus GM_* use in code warns', () => {
  const parsed = parseUserScript(
    '// ==UserScript==\n// @name None Grant\n// @version 1.0\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nGM_setValue("k", 1);\n',
  );
  assert.ok(parsed.warnings.some((w) => w.includes('GM_*')));
});

test('@grant none without GM use does not warn about GM use', () => {
  const parsed = parseUserScript(
    '// ==UserScript==\n// @name None Grant\n// @version 1.0\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\nconsole.log(1);\n',
  );
  assert.ok(!parsed.warnings.some((w) => w.includes('GM_*')));
});

test('parses @resource, booleans, @inject-into and @weight', () => {
  const parsed = parseUserScript(
    '// ==UserScript==\n// @name R\n// @version 1.0\n// @match https://example.com/*\n' +
      '// @resource css https://example.com/style.css\n// @noframes\n// @inject-into page\n// @weight 5\n// ==/UserScript==\nvoid 0;\n',
  );
  assert.equal(parsed.metadata.resource['css'], 'https://example.com/style.css');
  assert.equal(parsed.metadata.noframes, true);
  assert.equal(parsed.metadata.injectInto, 'page');
  assert.equal(parsed.metadata.weight, 5);
});

test('missing @name is an error', () => {
  const parsed = parseUserScript(
    '// ==UserScript==\n// @version 1.0\n// @match https://example.com/*\n// ==/UserScript==\nvoid 0;\n',
  );
  assert.ok(parsed.errors.some((e) => e.includes('@name')));
});
