// OpenMonkey for Safari — matcher tests.
// Run via `npm test` (the build agent wires a TS runner, e.g. ts-node or
// esbuild-register, for these TypeScript tests using node:test).
// These tests import the TypeScript sources directly; they are not meant
// to be run with plain `node` against uncompiled .ts files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchPatternToRegExp,
  matchesMatchPattern,
  matchesIncludeExclude,
  globToRegExp,
} from '../extension/src/matcher/matcher.js';

test('match pattern: exact scheme/host/path', () => {
  assert.equal(matchesMatchPattern('https://example.com/*', 'https://example.com/foo'), true);
  assert.equal(matchesMatchPattern('https://example.com/*', 'http://example.com/foo'), false);
  assert.equal(matchesMatchPattern('https://example.com/*', 'https://other.com/foo'), false);
});

test('match pattern: * scheme matches http and https only', () => {
  assert.equal(matchesMatchPattern('*://example.com/*', 'https://example.com/a'), true);
  assert.equal(matchesMatchPattern('*://example.com/*', 'http://example.com/a'), true);
  assert.equal(matchesMatchPattern('*://example.com/*', 'ftp://example.com/a'), false);
});

test('match pattern: *.example.com matches the bare domain and subdomains', () => {
  assert.equal(matchesMatchPattern('*://*.example.com/*', 'https://example.com/'), true);
  assert.equal(matchesMatchPattern('*://*.example.com/*', 'https://sub.example.com/'), true);
  assert.equal(matchesMatchPattern('*://*.example.com/*', 'https://a.b.example.com/x'), true);
  assert.equal(matchesMatchPattern('*://*.example.com/*', 'https://example.com.evil.com/'), false);
  assert.equal(matchesMatchPattern('*://*.example.com/*', 'https://notexample.com/'), false);
});

test('match pattern: * host and port', () => {
  assert.equal(matchesMatchPattern('https://*/*', 'https://anything.example/a'), true);
  assert.equal(matchesMatchPattern('https://example.com:8080/*', 'https://example.com:8080/a'), true);
  assert.equal(matchesMatchPattern('https://example.com:8080/*', 'https://example.com:9090/a'), false);
  assert.equal(matchesMatchPattern('https://example.com:*/*', 'https://example.com:1234/a'), true);
});

test('match pattern: path wildcards and invalid patterns', () => {
  assert.equal(matchesMatchPattern('https://example.com/foo/*', 'https://example.com/foo/bar'), true);
  assert.equal(matchesMatchPattern('https://example.com/foo/*', 'https://example.com/bar'), false);
  assert.equal(matchPatternToRegExp('not-a-pattern'), null);
  assert.equal(matchPatternToRegExp('https://example.com'), null);
});

test('glob: * and ? wildcards, /regex/ detection', () => {
  assert.equal(globToRegExp('https://example.com/*').test('https://example.com/a/b'), true);
  assert.equal(globToRegExp('https://example.com/?').test('https://example.com/x'), true);
  assert.equal(globToRegExp('https://example.com/?').test('https://example.com/xy'), false);
  assert.equal(globToRegExp('/^https:\\/\\/example\\.com\\/.*/').test('https://example.com/x'), true);
});

test('matchesIncludeExclude: include/exclude precedence', () => {
  const target = {
    match: ['https://example.com/*'],
    include: [],
    exclude: ['https://example.com/private/*'],
    excludeMatch: [],
  };
  assert.equal(matchesIncludeExclude(target, 'https://example.com/public'), true);
  assert.equal(matchesIncludeExclude(target, 'https://example.com/private/x'), false);
  assert.equal(matchesIncludeExclude(target, 'https://other.com/'), false);
});

test('matchesIncludeExclude: exclude-match vetoes a match', () => {
  const target = {
    match: ['*://*.example.com/*'],
    include: [],
    exclude: [],
    excludeMatch: ['https://sub.example.com/*'],
  };
  assert.equal(matchesIncludeExclude(target, 'https://example.com/'), true);
  assert.equal(matchesIncludeExclude(target, 'https://sub.example.com/'), false);
});

test('matchesIncludeExclude: @include glob alone can include', () => {
  const target = { match: [], include: ['https://*.example.com/*'], exclude: [], excludeMatch: [] };
  assert.equal(matchesIncludeExclude(target, 'https://a.example.com/x'), true);
  assert.equal(matchesIncludeExclude(target, 'https://other.com/x'), false);
});

test('matchesIncludeExclude: no rules means the script will not run', () => {
  const target = { match: [], include: [], exclude: [], excludeMatch: [] };
  assert.equal(matchesIncludeExclude(target, 'https://example.com/'), false);
});
