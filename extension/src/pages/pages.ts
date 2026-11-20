// OpenMonkey for Safari — management dashboard + script editor.
//
// Features:
//   - Script library: card list with search, sort (name / last
//     updated), bulk enable/disable, counts, and separate userscript /
//     userstyle sections. Cards show an avatar, name/version, author,
//     a status badge, an update-available badge, and an iOS-style switch.
//   - Per-script detail panel: version, author, homepage, update URL
//     and update state (check / update to the new version), grants,
//     last run / last error, and a test-URL matcher.
//   - Settings panel: a global injection switch, the update-check
//     interval, and import/export. The global switch gates injection
//     in the background (OM_GET_MATCHING_SCRIPTS returns no scripts
//     while it is off); the interval is sent to the background as
//     OM_SET_SETTINGS so it can resize the update-check alarm.
//   - Update checks run through the background's OM_CHECK_UPDATES
//     message (background/updater.ts); the dashboard never fetches
//     update URLs itself. Applying an update downloads the new source
//     and saves it over the installed script.
//   - Enable toggle, delete, duplicate, export .user.js.
//   - Import .user.js file, paste from clipboard, import/export JSON,
//     import/export ZIP (stored entries only, see ./zip.ts).
//   - CodeMirror 6 editor (JavaScript, find/replace via @codemirror/search,
//     Ctrl/Cmd+S to save, line numbers, discard changes).
//   - Userstyles: a userstyle is a script with @match rules and a CSS
//     body, stored with type 'userstyle' and injected at runtime via
//     the GM_addStyle equivalent. The dashboard lists userstyles
//     separately and can create one.
//   - Opening pages.html?new=1 (used by the popup's "New script"
//     button) creates and opens a new script immediately.
//
// State: the registry from ../background/registry.js is the primary
// backend when it is available; storage.ts (chrome.storage.local with
// a localStorage fallback) is the fallback. The parser and matcher
// from the core agent are used for every import and for the test-URL
// check — no duplicate parsing logic lives here.

import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, type ViewUpdate } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { parseUserScript, type UserScriptMetadata } from '../parser/metablock.js';
import { matchesIncludeExclude } from '../matcher/matcher.js';
import { createRegistry } from '../background/registry.js';
import { isSafeAdSelector } from '../features.js';
import {
  applyStaticStrings,
  resolveLanguage,
  translate,
  type Language,
  type LanguageSetting,
} from '../i18n.js';
import {
  DEFAULT_SETTINGS,
  chromeAvailable,
  generateId,
  getResources,
  getSettings,
  getTagRules,
  loadScripts,
  normaliseScript,
  pushSettingsToNative,
  removeScript as removeFromStorage,
  saveResources,
  saveScript as saveToStorage,
  saveSettings,
  saveTagRules,
  scriptIdFor,
  seedDemoScripts,
  setEnabled as setEnabledInStorage,
  type DarkModeSetting,
  type ExtensionSettings,
  type FileSort,
  type MediaItem,
  type SearchEngine,
  type SmartSearchTrigger,
  type StoredScript,
  type TagRules,
} from './storage.js';
import { createZip, downloadBlob, parseZip, safeFilename } from './zip.js';

/** The registry surface as contracted by the core agent. */
interface RegistryLike {
  listScripts?: () => unknown;
  getScript?: (id: string) => unknown;
  saveScript?: (script: unknown) => unknown;
  removeScript?: (id: string) => unknown;
  setEnabled?: (id: string, enabled: boolean) => unknown;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Dashboard element missing: #${id}`);
  return node as T;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Parse a ==UserStyle== block (name/version/match) without the JS parser. */
function parseUserStyle(source: string): {
  name: string;
  version: string;
  matches: string[];
  author: string;
} {
  const block = /\/\*\s*==UserStyle==([\s\S]*?)==\/UserStyle==\s*\*\//.exec(source);
  const result = { name: '', version: '', matches: [] as string[], author: '' };
  if (!block) return result;
  for (const line of block[1].split(/\r\n|\r|\n/)) {
    const m = /^\s*@([A-Za-z-]+)\s+(.*)$/.exec(line.trim());
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'name') result.name = value;
    else if (key === 'version') result.version = value;
    else if (key === 'author') result.author = value;
    else if (key === 'match' && value) result.matches.push(value);
  }
  return result;
}

function scriptFromSource(source: string, sourceName: string): StoredScript {
  const now = Date.now();
  if (source.includes('==UserStyle==')) {
    const style = parseUserStyle(source);
    const name = style.name || sourceName || tr('unnamedUserstyle');
    return {
      id: scriptIdFor(name, ''),
      name,
      version: style.version,
      description: '',
      author: style.author,
      homepage: '',
      updateURL: '',
      type: 'userstyle',
      code: source,
      enabled: true,
      metadata: { name, version: style.version, match: style.matches },
      matches: style.matches,
      grants: [],
      createdAt: now,
      updatedAt: now,
      lastRun: null,
      lastError: null,
    };
  }
  const parsed = parseUserScript(source);
  const meta: UserScriptMetadata = parsed.metadata;
  const name = meta.name || sourceName || tr('unnamedScript');
  return {
    id: scriptIdFor(name, meta.namespace),
    name,
    version: meta.version,
    description: meta.description,
    author: meta.author,
    homepage: meta.homepage,
    updateURL: meta.updateURL,
    type: 'userscript',
    code: source,
    enabled: true,
    metadata: meta as unknown as Record<string, unknown>,
    matches: [...meta.match, ...meta.include],
    grants: [...meta.grant],
    createdAt: now,
    updatedAt: now,
    lastRun: null,
    lastError: null,
  };
}

function newScriptTemplate(): string {
  return [
    '// ==UserScript==',
    '// @name        New script',
    '// @namespace   openmonkey',
    '// @version     1.0.0',
    '// @description A new userscript.',
    '// @author      You',
    '// @match       *://example.com/*',
    '// @grant       none',
    '// ==/UserScript==',
    '',
    '(function () {',
    "  'use strict';",
    '  // Your code here.',
    '})();',
    '',
  ].join('\n');
}

function newUserstyleTemplate(): string {
  return [
    '/* ==UserStyle==',
    '@name New userstyle',
    '@namespace openmonkey',
    '@version 1.0.0',
    '@match *://example.com/*',
    '==/UserStyle== */',
    '',
    'body {',
    '  /* Your CSS here. Applied with the GM_addStyle equivalent. */',
    '}',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Backend: registry first, storage.ts fallback.
// ---------------------------------------------------------------------------

let registry: RegistryLike | null = null;
// The registry is only used when the extension API is present: without
// chrome its storage adapter is an in-memory Map that lives and dies
// with this page load, while storage.ts (localStorage) is the documented
// demo fallback — mixing the two would silently lose edits.
if (chromeAvailable()) {
  try {
    const created = createRegistry() as unknown;
    registry =
      created && typeof created === 'object' && typeof (created as RegistryLike).listScripts === 'function'
        ? (created as RegistryLike)
        : null;
  } catch {
    registry = null;
  }
}

async function backendLoad(): Promise<StoredScript[]> {
  if (registry?.listScripts) {
    try {
      const raw = await registry.listScripts();
      if (Array.isArray(raw)) {
        return raw
          .map((entry) => {
            const unwrapped =
              entry && typeof entry === 'object' && 'script' in (entry as Record<string, unknown>)
                ? (entry as Record<string, unknown>).script
                : entry;
            return normaliseScript(unwrapped);
          })
          .filter((s): s is StoredScript => s !== null);
      }
    } catch {
      // Fall through to storage.ts.
    }
  }
  return loadScripts();
}

async function backendSave(script: StoredScript, markModified = false): Promise<void> {
  if (registry?.saveScript) {
    try {
      // The registry's SaveScriptInput is {metadata, source, enabled,
      // id?, installedAt?, updatedAt?, lastError?, userModified?} — not
      // this file's StoredScript shape ({code, name, ...}), so convert.
      await registry.saveScript({
        metadata: script.metadata as unknown as UserScriptMetadata,
        source: script.code,
        enabled: script.enabled,
        id: script.id,
        installedAt: script.createdAt,
        updatedAt: script.updatedAt,
        ...(script.lastError ? { lastError: script.lastError } : {}),
        ...(markModified ? { userModified: true } : {}),
      });
      return;
    } catch {
      // Fall through to storage.ts.
    }
  }
  await saveToStorage(script);
}

async function backendRemove(id: string): Promise<void> {
  if (registry?.removeScript) {
    try {
      // removeScript returns false when the id is unknown to the
      // registry; only then fall through to storage.ts.
      const removed = (await registry.removeScript(id)) as boolean;
      if (removed) return;
    } catch {
      // Fall through to storage.ts.
    }
  }
  await removeFromStorage(id);
}

async function backendSetEnabled(id: string, enabled: boolean): Promise<void> {
  if (registry?.setEnabled) {
    try {
      // setEnabled returns null when the id is unknown to the registry;
      // only then fall through to storage.ts.
      const updated = await registry.setEnabled(id, enabled);
      if (updated) return;
    } catch {
      // Fall through to storage.ts.
    }
  }
  await setEnabledInStorage(id, enabled);
}

// ---------------------------------------------------------------------------
// Background messaging (update checks, settings alarm).
// ---------------------------------------------------------------------------

type BackgroundResponse = Record<string, unknown>;

/** One script's update-check outcome, as returned by OM_CHECK_UPDATES. */
interface UpdateInfo {
  id: string;
  name: string;
  available: boolean;
  newVersion?: string;
  downloadUrl?: string;
  blockedByLocalEdits: boolean;
}

async function sendToBackground(message: Record<string, unknown>): Promise<BackgroundResponse | null> {
  if (!chromeAvailable() || typeof chrome.runtime?.sendMessage !== 'function') return null;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 5000);
    try {
      chrome.runtime.sendMessage(message, (response: unknown) => {
        window.clearTimeout(timer);
        resolve((response as BackgroundResponse | undefined) ?? null);
      });
    } catch {
      window.clearTimeout(timer);
      resolve(null);
    }
  });
}

/** Set an iOS-style switch button (role="switch") to on/off. */
function setSwitch(button: HTMLButtonElement, on: boolean): void {
  button.classList.toggle('on', on);
  button.setAttribute('aria-checked', String(on));
}

/** Deterministic avatar hue from a script name. */
function avatarHue(name: string): number {
  let hue = 0;
  for (const ch of name) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return hue;
}

// ---------------------------------------------------------------------------
// Dashboard state and rendering.
// ---------------------------------------------------------------------------

let scripts: StoredScript[] = [];
let selectedId: string | null = null;
let searchQuery = '';
let sortMode: 'name' | 'updated' | 'oldest' = 'updated';
/** Stay-style segment: Activated = enabled, Stopped = disabled,
 * Featured = has an @updateURL (can be updated at all). */
let segment: 'activated' | 'stopped' | 'featured' = 'activated';
let editorView: EditorView | null = null;
let editingId: string | null = null;
let editorOriginal = '';
/** Latest update-check results by script id (empty until checked). */
const updateResults = new Map<string, UpdateInfo>();
/** Current extension settings (loaded once in refresh()). */
let currentSettings: ExtensionSettings = { ...DEFAULT_SETTINGS };
/** Effective UI language and the stored preference behind it. */
let currentLanguage: Language = 'en';
let currentLanguageSetting: LanguageSetting = 'system';
/** v0.5.0 feature state: per-site tag rules and the latest sniffed
 * media snapshot, loaded by refresh(). */
let tagRules: TagRules = {};
let resourcesItems: MediaItem[] = [];
let resourcesUrl = '';

/** Translate one UI string in the dashboard's current language. */
function tr(
  key: Parameters<typeof translate>[0],
  vars?: Record<string, string | number>,
): string {
  return translate(key, currentLanguage, vars);
}

/** Ask the background to pull the native host app's settings into
 * chrome.storage.local (OM_SYNC_NATIVE_SETTINGS) and apply the merged
 * language. Best-effort: a null answer (no background, timeout) just
 * leaves the local settings in place. */
async function syncNativeOnOpen(): Promise<void> {
  const response = await sendToBackground({ type: 'OM_SYNC_NATIVE_SETTINGS' });
  if (!response || response.ok !== true) return;
  const settings = response.settings as { language?: unknown } | undefined;
  if (!settings || typeof settings !== 'object') return;
  currentLanguageSetting =
    settings.language === 'zh' || settings.language === 'en' || settings.language === 'system'
      ? settings.language
      : currentLanguageSetting;
  currentLanguage = resolveLanguage(currentLanguageSetting);
}

/** Switch the UI language now: persist the preference, push it to the
 * native side (best-effort), and re-render every string immediately. */
async function setLanguage(setting: LanguageSetting): Promise<void> {
  const next = { ...currentSettings, language: setting };
  await saveSettings(next);
  void pushSettingsToNative({ language: setting });
  currentSettings = next;
  currentLanguageSetting = setting;
  currentLanguage = resolveLanguage(setting);
  applyStrings();
  renderLists();
  renderDetail();
  renderFeatureSettings();
  renderEngines();
  renderAdRules();
  renderTagRules();
  renderResources();
  if (editingId) {
    const script = scripts.find((s) => s.id === editingId);
    if (script) {
      el<HTMLElement>('editor-title').textContent = `${tr('editorTitle')} — ${script.name}`;
    }
  }
}

/** Dark editor theme (the editor is always dark, like the reference
 * code editor): near-black background, light text, muted gutters,
 * and a matching syntax palette. */
const darkHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#c678dd' },
  { tag: tags.comment, color: '#7f848e', fontStyle: 'italic' },
  { tag: tags.string, color: '#98c379' },
  { tag: tags.number, color: '#d19a66' },
  { tag: tags.bool, color: '#d19a66' },
  { tag: tags.variableName, color: '#e5c07b' },
  { tag: tags.function(tags.variableName), color: '#61afef' },
  { tag: tags.typeName, color: '#e5c07b' },
  { tag: tags.operator, color: '#56b6c2' },
  { tag: tags.propertyName, color: '#e06c75' },
  { tag: tags.punctuation, color: '#abb2bf' },
]);
const darkTheme = EditorView.theme({
  '&': { backgroundColor: '#1e1e1e', color: '#d4d4d4' },
  '.cm-content': { caretColor: '#ffffff' },
  '.cm-gutters': { backgroundColor: '#1e1e1e', color: '#858585', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: '#2a2d2e' },
  '.cm-activeLine': { backgroundColor: '#2a2d2e' },
  '.cm-selectionBackground': { backgroundColor: '#264f78 !important' },
  '&.cm-focused .cm-cursor': { borderLeftColor: '#ffffff' },
}, { dark: true });

/** Format an updatedAt timestamp as YYYY-MM-DD for the status line. */
function updatedDate(script: StoredScript): string {
  if (!script.updatedAt) return '';
  try {
    return new Date(script.updatedAt).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function visibleScripts(): StoredScript[] {
  const q = searchQuery.trim().toLowerCase();
  const filtered = scripts.filter((s) => {
    if (segment === 'activated' && !s.enabled) return false;
    if (segment === 'stopped' && s.enabled) return false;
    if (segment === 'featured' && !s.updateURL) return false;
    if (!q) return true;
    return [s.name, s.description, s.author, s.matches.join(' ')]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
  return [...filtered].sort((a, b) =>
    sortMode === 'name'
      ? a.name.localeCompare(b.name)
      : sortMode === 'oldest'
        ? a.updatedAt - b.updatedAt
        : b.updatedAt - a.updatedAt,
  );
}

function renderLists(): void {
  const visible = visibleScripts();
  const scriptList = el<HTMLUListElement>('userscript-list');
  const styleList = el<HTMLUListElement>('userstyle-list');
  scriptList.innerHTML = '';
  styleList.innerHTML = '';
  const userScripts = visible.filter((s) => s.type !== 'userstyle');
  const userStyles = visible.filter((s) => s.type === 'userstyle');
  const enabledCount = visible.filter((s) => s.enabled).length;
  el<HTMLElement>('library-count').textContent = tr('libraryCount', {
    enabled: enabledCount,
    total: visible.length,
  });
  el<HTMLElement>('userscript-count').textContent = String(userScripts.length);
  el<HTMLElement>('userstyle-count').textContent = String(userStyles.length);
  el<HTMLElement>('empty-state').hidden = visible.length !== 0;
  for (const script of visible) {
    // One Stay-style row: 40px rounded-square icon, bold name + version,
    // one-line description, status line ("● Activated | ⓥ v | Updated date"),
    // green switch on the right.
    const li = document.createElement('li');
    li.className = `script-row${script.id === selectedId ? ' selected' : ''}${!script.enabled ? ' disabled' : ''}`;
    li.onclick = () => selectScript(script.id);
    const icon = document.createElement('span');
    icon.className = 'script-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = (script.name.trim()[0] ?? 'O').toUpperCase();
    icon.style.background = `hsl(${avatarHue(script.name)} 70% 45%)`;
    const body = document.createElement('div');
    body.className = 'script-body';
    const name = document.createElement('div');
    name.className = 'script-name';
    name.textContent = script.name;
    const desc = document.createElement('div');
    desc.className = 'script-desc';
    desc.textContent = script.description
      || script.author
      || script.matches.slice(0, 1).join(', ')
      || '';
    body.append(name, desc);
    const statusLine = document.createElement('div');
    statusLine.className = 'status-line';
    const dot = document.createElement('span');
    dot.className = `status-dot${!script.enabled ? ' stopped' : ''}`;
    const statusText = document.createElement('span');
    statusText.className = `status-text${!script.enabled ? ' stopped' : ''}`;
    statusText.textContent = script.enabled ? tr('statusActivated') : tr('statusStopped');
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '|';
    const versionText = document.createElement('span');
    versionText.textContent = script.version ? `ⓥ ${script.version}` : '';
    statusLine.append(dot, statusText, sep, versionText);
    const updated = updatedDate(script);
    if (updated) {
      const updatedText = document.createElement('span');
      updatedText.className = 'updated';
      updatedText.textContent = tr('updatedOn', { date: updated });
      statusLine.appendChild(updatedText);
    }
    body.appendChild(statusLine);
    if (script.type === 'userstyle') {
      const cssChip = document.createElement('span');
      cssChip.className = 'badge css';
      cssChip.textContent = 'CSS';
      statusLine.appendChild(cssChip);
    }
    const update = updateResults.get(script.id);
    if (update?.available) {
      const updateBadge = document.createElement('span');
      updateBadge.className = 'badge update';
      updateBadge.textContent = `${tr('updateBadge')}${update.newVersion ? ` · v${update.newVersion}` : ''}`;
      statusLine.appendChild(updateBadge);
    }
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = `switch small${script.enabled ? ' on' : ''}`;
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(script.enabled));
    toggle.setAttribute(
      'aria-label',
      script.enabled
        ? tr('disableAria', { name: script.name })
        : tr('enableAria', { name: script.name }),
    );
    toggle.onclick = async (event) => {
      event.stopPropagation();
      await backendSetEnabled(script.id, !script.enabled);
      await refresh();
    };
    li.append(icon, body, toggle);
    (script.type === 'userstyle' ? styleList : scriptList).appendChild(li);
  }
}

function matchTargetOf(script: StoredScript): {
  match: string[];
  include: string[];
  exclude: string[];
  excludeMatch: string[];
} {
  const meta = script.metadata as Record<string, unknown>;
  const asList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  return {
    match: asList(meta.match).length > 0 ? asList(meta.match) : script.matches,
    include: asList(meta.include),
    exclude: asList(meta.exclude),
    excludeMatch: asList(meta.excludeMatch),
  };
}

function renderDetail(): void {
  const panel = el<HTMLElement>('detail-panel');
  const script = scripts.find((s) => s.id === selectedId) ?? null;
  panel.hidden = script === null;
  if (!script) return;
  const icon = el<HTMLElement>('detail-icon');
  icon.textContent = (script.name.trim()[0] ?? 'O').toUpperCase();
  icon.style.background = `hsl(${avatarHue(script.name)} 70% 45%)`;
  el<HTMLElement>('detail-name').textContent = script.name;
  el<HTMLElement>('detail-version').textContent = script.version ? `v${script.version}` : '—';
  el<HTMLElement>('detail-author').textContent = script.author || '—';
  el<HTMLElement>('detail-author-wrap').hidden = !script.author;
  el<HTMLElement>('detail-description').textContent = script.description || '';
  el<HTMLElement>('detail-description').hidden = !script.description;
  const homepage = el<HTMLAnchorElement>('detail-homepage');
  homepage.textContent = script.homepage || '—';
  homepage.href = script.homepage || '#';
  el<HTMLElement>('detail-update-url').textContent = script.updateURL || '—';
  // Update state: the last OM_CHECK_UPDATES result for this script, if any.
  const update = updateResults.get(script.id);
  const updateLabel = el<HTMLElement>('detail-update');
  const applyButton = el<HTMLButtonElement>('detail-update-apply');
  if (!script.updateURL) {
    updateLabel.textContent = tr('updateNoUrl');
    applyButton.hidden = true;
  } else if (update?.available) {
    updateLabel.textContent = update.blockedByLocalEdits
      ? tr('updateAvailableBlocked', { version: update.newVersion ?? '' })
      : tr('updateAvailable', { version: update.newVersion ?? '' });
    applyButton.hidden = false;
    applyButton.textContent = tr('updateApply', { version: update.newVersion ?? '' });
  } else if (update) {
    updateLabel.textContent = tr('updateUpToDate');
    applyButton.hidden = true;
  } else {
    updateLabel.textContent = tr('updateNotChecked');
    applyButton.hidden = true;
  }
  const grantsList = el<HTMLUListElement>('detail-grants');
  grantsList.innerHTML = '';
  if (script.grants.length === 0) {
    const li = document.createElement('li');
    li.textContent = tr('noGrants');
    grantsList.appendChild(li);
  } else {
    for (const grant of script.grants) {
      const li = document.createElement('li');
      li.textContent = grant;
      grantsList.appendChild(li);
    }
  }
  el<HTMLElement>('detail-last-run').textContent = script.lastRun ?? '—';
  el<HTMLElement>('detail-last-error').textContent = script.lastError ?? '—';
  el<HTMLElement>('detail-matches').textContent =
    script.matches.length > 0 ? script.matches.join(', ') : '—';
  setSwitch(el<HTMLButtonElement>('detail-enable'), script.enabled);
  updateTestResult();
}

function updateTestResult(): void {
  const script = scripts.find((s) => s.id === selectedId) ?? null;
  const result = el<HTMLElement>('test-result');
  if (!script) {
    result.textContent = '';
    return;
  }
  const url = el<HTMLInputElement>('test-url').value.trim();
  if (!url) {
    result.textContent = '';
    return;
  }
  try {
    result.textContent = matchesIncludeExclude(matchTargetOf(script), url)
      ? tr('testMatches')
      : tr('testNoMatch');
  } catch {
    result.textContent = tr('testError');
  }
}

function selectScript(id: string): void {
  selectedId = id;
  renderLists();
  renderDetail();
}

async function refresh(): Promise<void> {
  scripts = await backendLoad();
  if (scripts.length === 0 && !chromeAvailable()) {
    scripts = seedDemoScripts();
    el<HTMLElement>('demo-note').hidden = false;
  }
  currentSettings = await getSettings();
  currentLanguageSetting = currentSettings.language;
  currentLanguage = resolveLanguage(currentSettings.language);
  applyStrings();
  setSwitch(el<HTMLButtonElement>('global-enabled'), currentSettings.globalEnabled);
  el<HTMLSelectElement>('update-interval').value = String(currentSettings.updateCheckIntervalDays);
  // The library sort follows the fileSort setting (Addons 任务设置):
  // timeAsc = oldest first, timeDesc = last updated first.
  sortMode =
    currentSettings.fileSort === 'timeAsc'
      ? 'oldest'
      : currentSettings.fileSort === 'name'
        ? 'name'
        : 'updated';
  el<HTMLSelectElement>('sort').value = sortMode;
  renderFeatureSettings();
  await renderFeatureLists();
  if (selectedId && !scripts.some((s) => s.id === selectedId)) selectedId = null;
  renderLists();
  renderDetail();
}

// ---------------------------------------------------------------------------
// v0.5.0 feature settings + editors (engines, ad rules, tag rules,
// sniffed media).
// ---------------------------------------------------------------------------

/** Apply the loaded settings to the settings-panel controls. */
function renderFeatureSettings(): void {
  const s = currentSettings;
  setSwitch(el<HTMLButtonElement>('toggle-darkmode-enabled'), s.darkModeEnabled);
  for (const [id, mode] of [
    ['dark-auto', 'auto'],
    ['dark-light', 'light'],
    ['dark-dark', 'dark'],
  ] as Array<[string, DarkModeSetting]>) {
    const button = el<HTMLButtonElement>(id);
    button.classList.toggle('selected', s.darkMode === mode);
    button.setAttribute('aria-selected', String(s.darkMode === mode));
  }
  setSwitch(el<HTMLButtonElement>('toggle-adfilter'), s.adFilterEnabled);
  setSwitch(el<HTMLButtonElement>('toggle-tagmode'), s.tagModeEnabled);
  setSwitch(el<HTMLButtonElement>('toggle-smartsearch'), s.smartSearchEnabled);
  for (const [id, value] of [
    ['trigger-prefix', 'prefix'],
    ['trigger-suffix', 'suffix'],
  ] as Array<[string, SmartSearchTrigger]>) {
    const button = el<HTMLButtonElement>(id);
    button.classList.toggle('selected', s.smartSearchTrigger === value);
    button.setAttribute('aria-selected', String(s.smartSearchTrigger === value));
  }
  setSwitch(el<HTMLButtonElement>('toggle-sniff'), s.sniffEnabled);
  setSwitch(el<HTMLButtonElement>('toggle-resource-detection'), s.resourceDetectionEnabled);
  setSwitch(el<HTMLButtonElement>('toggle-show-sniff'), s.showSniffButton);
  setSwitch(el<HTMLButtonElement>('toggle-longpress-sniff'), s.longPressSniff);
  el<HTMLSelectElement>('file-sort').value = s.fileSort;
  setSwitch(el<HTMLButtonElement>('toggle-prompts'), s.showPromptPopups);
  setSwitch(el<HTMLButtonElement>('toggle-sync'), s.syncEnabled);
}

/** Persist one settings change, push it to the native side, and
 * nudge the background (which re-applies the feature in every tab). */
async function updateSettings(patch: Partial<ExtensionSettings>): Promise<void> {
  const next = { ...currentSettings, ...patch };
  await saveSettings(next);
  currentSettings = next;
  void pushSettingsToNative(patch);
  await sendToBackground({ type: 'OM_SET_SETTINGS', settings: next });
  renderFeatureSettings();
}

/** Load the tag rules + media snapshot and render all four editors. */
async function renderFeatureLists(): Promise<void> {
  tagRules = await getTagRules();
  const snapshot = await getResources();
  resourcesItems = snapshot?.items ?? [];
  resourcesUrl = snapshot?.url ?? '';
  renderEngines();
  renderAdRules();
  renderTagRules();
  renderResources();
}

function renderEngines(): void {
  const list = el<HTMLUListElement>('engine-list');
  list.innerHTML = '';
  for (const engine of currentSettings.smartSearchEngines) {
    const li = document.createElement('li');
    li.className = 'rule-row';
    const text = document.createElement('span');
    text.className = 'rule-text';
    text.textContent = `${engine.name} · ${engine.trigger} · ${engine.url}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'mini-button danger';
    remove.textContent = tr('deleteButton');
    remove.onclick = async () => {
      const engines = currentSettings.smartSearchEngines.filter((e) => e.id !== engine.id);
      // The defaults are restored when the list would become empty
      // (normaliseSettings guarantees at least one engine).
      await updateSettings({ smartSearchEngines: engines });
      renderEngines();
    };
    li.append(text, remove);
    list.appendChild(li);
  }
}

function renderAdRules(): void {
  const list = el<HTMLUListElement>('adrule-list');
  list.innerHTML = '';
  const rules = currentSettings.customAdRules;
  if (rules.length === 0) {
    const li = document.createElement('li');
    li.className = 'rule-row muted';
    li.textContent = tr('noRules');
    list.appendChild(li);
    return;
  }
  for (const rule of rules) {
    const li = document.createElement('li');
    li.className = 'rule-row';
    const text = document.createElement('span');
    text.className = 'rule-text mono';
    text.textContent = rule;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'mini-button danger';
    remove.textContent = tr('deleteButton');
    remove.onclick = async () => {
      await updateSettings({
        customAdRules: currentSettings.customAdRules.filter((r) => r !== rule),
      });
      renderAdRules();
    };
    li.append(text, remove);
    list.appendChild(li);
  }
}

function renderTagRules(): void {
  const list = el<HTMLUListElement>('tagrule-list');
  list.innerHTML = '';
  const hosts = Object.keys(tagRules).sort();
  if (hosts.length === 0) {
    const li = document.createElement('li');
    li.className = 'rule-row muted';
    li.textContent = tr('noTagRules');
    list.appendChild(li);
    return;
  }
  for (const host of hosts) {
    for (const selector of tagRules[host]) {
      const li = document.createElement('li');
      li.className = 'rule-row';
      const text = document.createElement('span');
      text.className = 'rule-text mono';
      text.textContent = `${host} — ${selector}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'mini-button danger';
      remove.textContent = tr('deleteButton');
      remove.onclick = async () => {
        const next: TagRules = { ...tagRules };
        next[host] = (next[host] ?? []).filter((s) => s !== selector);
        if (next[host].length === 0) delete next[host];
        tagRules = next;
        await saveTagRules(next);
        renderTagRules();
      };
      li.append(text, remove);
      list.appendChild(li);
    }
  }
}

function formatMediaSize(size: number | undefined): string {
  if (size === undefined) return tr('resourcesUnknownSize');
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${size} B`;
}

function renderResources(): void {
  const list = el<HTMLUListElement>('resources-list');
  list.innerHTML = '';
  if (resourcesItems.length === 0) {
    const li = document.createElement('li');
    li.className = 'rule-row muted';
    li.textContent = tr('resourcesEmpty');
    list.appendChild(li);
    return;
  }
  if (resourcesUrl) {
    const source = document.createElement('li');
    source.className = 'rule-row muted';
    source.textContent = resourcesUrl;
    list.appendChild(source);
  }
  for (const item of resourcesItems) {
    const li = document.createElement('li');
    li.className = 'rule-row media-row';
    const text = document.createElement('span');
    text.className = 'rule-text';
    const label = document.createElement('strong');
    label.textContent = `${item.type === 'manifest' ? 'HLS/DASH' : item.type.toUpperCase()} · ${formatMediaSize(item.size)}`;
    const url = document.createElement('span');
    url.className = 'mono';
    url.textContent = item.url;
    text.append(label, document.createElement('br'), url);
    const actions = document.createElement('span');
    actions.className = 'rule-actions';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'mini-button';
    copy.textContent = tr('resourcesCopy');
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(item.url);
        copy.textContent = tr('resourcesCopied');
        setTimeout(() => {
          copy.textContent = tr('resourcesCopy');
        }, 1200);
      } catch {
        window.prompt(tr('resourcesCopy'), item.url);
      }
    };
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'mini-button';
    open.textContent = tr('resourcesOpen');
    open.onclick = () => window.open(item.url, '_blank');
    actions.append(copy, open);
    // Download only for same-origin media: a cross-origin fetch is
    // blocked by CORS from an extension page, so no button is shown
    // for it (copy-link is the fallback).
    let sameOrigin = false;
    try {
      sameOrigin = new URL(item.url).origin === window.location.origin;
    } catch {
      sameOrigin = false;
    }
    if (sameOrigin && item.type !== 'manifest') {
      const download = document.createElement('button');
      download.type = 'button';
      download.className = 'mini-button primary';
      download.textContent = tr('resourcesDownload');
      download.onclick = async () => {
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
          window.alert(tr('resourcesDownloadUnavailable'));
        }
      };
      actions.appendChild(download);
    }
    li.append(text, actions);
    list.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// Update checks (via the background's OM_CHECK_UPDATES).
// ---------------------------------------------------------------------------

async function checkUpdates(): Promise<void> {
  const status = el<HTMLElement>('update-status');
  const button = el<HTMLButtonElement>('check-updates');
  button.disabled = true;
  status.textContent = tr('checkingUpdates');
  const response = await sendToBackground({ type: 'OM_CHECK_UPDATES' });
  button.disabled = false;
  if (!response || response.ok !== true || !Array.isArray(response.results)) {
    // Demo mode (no extension API) or a background that did not answer.
    status.textContent = chromeAvailable() ? tr('updateCheckFailed') : tr('updateCheckDemo');
    return;
  }
  updateResults.clear();
  let available = 0;
  for (const raw of response.results as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string') continue;
    const info: UpdateInfo = {
      id: r.id,
      name: typeof r.name === 'string' ? r.name : r.id,
      available: r.available === true,
      newVersion: typeof r.newVersion === 'string' ? r.newVersion : undefined,
      downloadUrl: typeof r.downloadUrl === 'string' ? r.downloadUrl : undefined,
      blockedByLocalEdits: r.blockedByLocalEdits === true,
    };
    updateResults.set(info.id, info);
    if (info.available) available += 1;
  }
  const checked = updateResults.size;
  status.textContent =
    available > 0
      ? tr('updatesAvailable', { available, checked })
      : tr('allUpToDate', { checked });
  renderLists();
  renderDetail();
}

async function applyUpdate(id: string): Promise<void> {
  const info = updateResults.get(id);
  const script = scripts.find((s) => s.id === id);
  const status = el<HTMLElement>('update-status');
  if (!info?.downloadUrl || !script) return;
  status.textContent = tr('downloading', { name: info.name });
  try {
    const response = await fetch(info.downloadUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const source = await response.text();
    // Download the new source and save it over the installed script.
    // A fresh parse keeps name/version/matches in sync; the original
    // id is kept so the update does not create a duplicate entry.
    const next = scriptFromSource(source, script.name);
    next.id = script.id;
    next.enabled = script.enabled;
    next.createdAt = script.createdAt;
    next.updatedAt = Date.now();
    await backendSave(next);
    updateResults.delete(id);
    status.textContent = tr('updatedTo', {
      name: script.name,
      version: next.version || info.newVersion || '',
    });
    await refresh();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status.textContent = tr('updateFailed', { name: script.name, message });
  }
}

// ---------------------------------------------------------------------------
// Editor (CodeMirror 6).
// ---------------------------------------------------------------------------

function openEditor(script: StoredScript): void {
  editingId = script.id;
  editorOriginal = script.code;
  el<HTMLElement>('editor-section').hidden = false;
  el<HTMLElement>('editor-title').textContent = `${tr('editorTitle')} — ${script.name}`;
  el<HTMLElement>('editor-status').textContent = '';
  if (editorView) {
    editorView.destroy();
    editorView = null;
  }
  const container = el<HTMLElement>('editor');
  container.innerHTML = '';
  // Both userscripts (JavaScript) and userstyles (CSS) are edited with
  // the JavaScript language support: the declared CodeMirror dependency
  // set has no CSS language package, and plain-text editing of CSS in
  // the JS mode is a cosmetic limitation, not a functional one.
  editorView = new EditorView({
    parent: container,
    state: EditorState.create({
      doc: script.code,
      extensions: [
        lineNumbers(),
        history(),
        // The editor is always dark (see docs/ui-redesign.md): a custom
        // dark syntax palette plus a dark editor theme.
        syntaxHighlighting(darkHighlight),
        darkTheme,
        javascript(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          {
            key: 'Mod-s',
            run: () => {
              void saveEditor();
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            el<HTMLElement>('editor-status').textContent =
              update.state.doc.toString() === editorOriginal ? '' : tr('editorUnsaved');
          }
        }),
      ],
    }),
  });
  editorView.focus();
}

function closeEditor(): void {
  editingId = null;
  editorOriginal = '';
  if (editorView) {
    editorView.destroy();
    editorView = null;
  }
  el<HTMLElement>('editor-section').hidden = true;
}

async function saveEditor(): Promise<void> {
  if (!editorView || !editingId) return;
  const script = scripts.find((s) => s.id === editingId);
  if (!script) return;
  const code = editorView.state.doc.toString();
  const updated: StoredScript = { ...script, code, updatedAt: Date.now() };
  if (script.type === 'userscript') {
    // Re-parse so name/version/matches in the list stay in sync with the code.
    const reparsed = scriptFromSource(code, script.name);
    updated.name = reparsed.name;
    updated.version = reparsed.version;
    updated.description = reparsed.description;
    updated.author = reparsed.author;
    updated.homepage = reparsed.homepage;
    updated.updateURL = reparsed.updateURL;
    updated.metadata = reparsed.metadata;
    updated.matches = reparsed.matches;
    updated.grants = reparsed.grants;
    // Keep the original id so the edit does not create a duplicate entry.
    updated.id = script.id;
  } else {
    const style = parseUserStyle(code);
    if (style.name) updated.name = style.name;
    if (style.version) updated.version = style.version;
    if (style.matches.length > 0) updated.matches = style.matches;
  }
  await backendSave(updated, true);
  editorOriginal = code;
  el<HTMLElement>('editor-status').textContent = tr('editorSaved');
  await refresh();
}

// ---------------------------------------------------------------------------
// Import / export.
// ---------------------------------------------------------------------------

function readFileAsText(file: File): Promise<string> {
  return file.text();
}

function readFileAsBytes(file: File): Promise<Uint8Array> {
  return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

async function importSourceText(source: string, fallbackName: string): Promise<void> {
  const script = scriptFromSource(source, fallbackName);
  await backendSave(script);
  selectedId = script.id;
  await refresh();
}

async function importJsonText(text: string): Promise<number> {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error(tr('jsonImportArray'));
  let count = 0;
  for (const raw of parsed) {
    const script = normaliseScript(raw);
    if (!script) continue;
    if (!script.code && typeof raw === 'object' && raw !== null && typeof (raw as Record<string, unknown>).source === 'string') {
      script.code = (raw as Record<string, unknown>).source as string;
    }
    await backendSave(script);
    count += 1;
  }
  return count;
}

async function importZipBytes(bytes: Uint8Array): Promise<number> {
  const entries = parseZip(bytes);
  let count = 0;
  for (const entry of entries) {
    const text = new TextDecoder().decode(entry.data);
    if (entry.name.toLowerCase().endsWith('.json')) {
      count += await importJsonText(text);
    } else if (entry.name.toLowerCase().endsWith('.user.js') || entry.name.toLowerCase().endsWith('.user.css')) {
      await importSourceText(text, entry.name.split('/').pop() ?? entry.name);
      count += 1;
    }
  }
  return count;
}

function exportJson(): void {
  downloadBlob(JSON.stringify(scripts, null, 2), 'openmonkey-scripts.json', 'application/json');
}

function exportZip(): void {
  const files = scripts.map((s) => ({
    name: safeFilename(s.name, s.type === 'userstyle' ? '.user.css' : '.user.js'),
    data: s.code,
  }));
  downloadBlob(createZip(files), 'openmonkey-scripts.zip', 'application/zip');
}

async function importFromClipboard(): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) throw new Error(tr('clipboardEmpty'));
    await importSourceText(text, 'Pasted script');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    el<HTMLElement>('status').textContent = tr('pasteFailed', { message });
  }
}

// ---------------------------------------------------------------------------
// Wiring.
// ---------------------------------------------------------------------------

function wireFileInput(inputId: string, handler: (file: File) => Promise<void>): void {
  const input = el<HTMLInputElement>(inputId);
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    void handler(file).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      el<HTMLElement>('status').textContent = tr('importFailed', { message });
    });
    input.value = '';
  });
}

/** Apply every static string for the current language (markup
 * [data-i18n] strings plus the document title and lang attribute),
 * and mark the active language button. Dynamic strings (the script
 * list, the detail panel, the editor title) are re-rendered by the
 * caller. */
function applyStrings(): void {
  document.title = tr('appName');
  document.documentElement.lang = currentLanguage;
  applyStaticStrings(document, currentLanguage);
  for (const [id, value] of [
    ['lang-system', 'system'],
    ['lang-zh', 'zh'],
    ['lang-en', 'en'],
  ] as Array<[string, LanguageSetting]>) {
    const button = el<HTMLButtonElement>(id);
    button.classList.toggle('selected', currentLanguageSetting === value);
    button.setAttribute('aria-selected', String(currentLanguageSetting === value));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void (async () => {
    // Pull the native host app's settings first (best-effort), then
    // render in the merged language.
    await syncNativeOnOpen();
    const settings = await getSettings();
    currentSettings = settings;
    currentLanguageSetting = settings.language;
    currentLanguage = resolveLanguage(settings.language);
    applyStrings();
    wireHandlers();
    await refresh();
    // The popup's "New script" button opens pages.html?new=1.
    if (new URLSearchParams(window.location.search).get('new') === '1') {
      const script = scriptFromSource(newScriptTemplate(), 'New script');
      script.id = generateId();
      void backendSave(script).then(async () => {
        selectedId = script.id;
        await refresh();
        openEditor(script);
      });
    }
  })();
});

function wireHandlers(): void {
  el<HTMLButtonElement>('settings-toggle').onclick = () => {
    const panel = el<HTMLElement>('settings-panel');
    panel.hidden = !panel.hidden;
    el<HTMLButtonElement>('settings-toggle').setAttribute('aria-expanded', String(!panel.hidden));
  };
  el<HTMLButtonElement>('global-enabled').onclick = async () => {
    const next = { ...currentSettings, globalEnabled: !currentSettings.globalEnabled };
    await saveSettings(next);
    currentSettings = next;
    setSwitch(el<HTMLButtonElement>('global-enabled'), next.globalEnabled);
    // Push the flip to the native side so the host app stays in sync
    // (best-effort; a failure leaves the local setting in place).
    void pushSettingsToNative({ globalEnabled: next.globalEnabled });
    // The background reads the setting from storage on every
    // OM_GET_MATCHING_SCRIPTS, so the switch takes effect without a
    // message; no OM_SET_SETTINGS is needed for the global switch.
  };
  // Language segmented control in the settings panel: follow system /
  // Chinese / English. Applies immediately (see setLanguage).
  for (const [id, value] of [
    ['lang-system', 'system'],
    ['lang-zh', 'zh'],
    ['lang-en', 'en'],
  ] as Array<[string, LanguageSetting]>) {
    el<HTMLButtonElement>(id).onclick = () => void setLanguage(value);
  }
  el<HTMLSelectElement>('update-interval').addEventListener('change', async (event) => {
    const days = Number((event.target as HTMLSelectElement).value);
    const next = { ...currentSettings, updateCheckIntervalDays: days };
    await saveSettings(next);
    currentSettings = next;
    // Nudge the background to rebuild its update-check alarm.
    await sendToBackground({ type: 'OM_SET_SETTINGS', settings: next });
  });
  el<HTMLButtonElement>('check-updates').onclick = () => void checkUpdates();
  el<HTMLButtonElement>('detail-check-update').onclick = () => void checkUpdates();
  el<HTMLButtonElement>('detail-update-apply').onclick = () => {
    if (selectedId) void applyUpdate(selectedId);
  };
  el<HTMLInputElement>('search').addEventListener('input', (event) => {
    searchQuery = (event.target as HTMLInputElement).value;
    renderLists();
  });
  // Stay-style capsule segments: Activated / Stopped / Featured.
  const segmentButtons: Array<[string, 'activated' | 'stopped' | 'featured']> = [
    ['seg-activated', 'activated'],
    ['seg-stopped', 'stopped'],
    ['seg-featured', 'featured'],
  ];
  for (const [id, value] of segmentButtons) {
    el<HTMLButtonElement>(id).onclick = () => {
      segment = value;
      for (const [buttonId] of segmentButtons) {
        const button = el<HTMLButtonElement>(buttonId);
        button.classList.toggle('selected', buttonId === id);
        button.setAttribute('aria-selected', String(buttonId === id));
      }
      renderLists();
    };
  }
  el<HTMLSelectElement>('sort').addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value;
    sortMode = value === 'name' ? 'name' : value === 'oldest' ? 'oldest' : 'updated';
    // Keep the stored fileSort in sync with the visible sort order.
    const fileSort: FileSort =
      sortMode === 'oldest' ? 'timeAsc' : sortMode === 'name' ? 'name' : 'timeDesc';
    void updateSettings({ fileSort });
    renderLists();
  });
  // v0.5.0 feature settings.
  el<HTMLButtonElement>('toggle-darkmode-enabled').onclick = () =>
    void updateSettings({ darkModeEnabled: !currentSettings.darkModeEnabled });
  for (const [id, mode] of [
    ['dark-auto', 'auto'],
    ['dark-light', 'light'],
    ['dark-dark', 'dark'],
  ] as Array<[string, DarkModeSetting]>) {
    el<HTMLButtonElement>(id).onclick = () => void updateSettings({ darkMode: mode });
  }
  el<HTMLButtonElement>('toggle-adfilter').onclick = () =>
    void updateSettings({ adFilterEnabled: !currentSettings.adFilterEnabled });
  el<HTMLButtonElement>('toggle-tagmode').onclick = () =>
    void updateSettings({ tagModeEnabled: !currentSettings.tagModeEnabled });
  el<HTMLButtonElement>('toggle-smartsearch').onclick = () =>
    void updateSettings({ smartSearchEnabled: !currentSettings.smartSearchEnabled });
  for (const [id, value] of [
    ['trigger-prefix', 'prefix'],
    ['trigger-suffix', 'suffix'],
  ] as Array<[string, SmartSearchTrigger]>) {
    el<HTMLButtonElement>(id).onclick = () => void updateSettings({ smartSearchTrigger: value });
  }
  el<HTMLButtonElement>('toggle-sniff').onclick = () =>
    void updateSettings({ sniffEnabled: !currentSettings.sniffEnabled });
  el<HTMLButtonElement>('toggle-resource-detection').onclick = () =>
    void updateSettings({ resourceDetectionEnabled: !currentSettings.resourceDetectionEnabled });
  el<HTMLButtonElement>('toggle-show-sniff').onclick = () =>
    void updateSettings({ showSniffButton: !currentSettings.showSniffButton });
  el<HTMLButtonElement>('toggle-longpress-sniff').onclick = () =>
    void updateSettings({ longPressSniff: !currentSettings.longPressSniff });
  el<HTMLSelectElement>('file-sort').addEventListener('change', (event) => {
    const fileSort = (event.target as HTMLSelectElement).value as FileSort;
    sortMode = fileSort === 'timeAsc' ? 'oldest' : fileSort === 'name' ? 'name' : 'updated';
    el<HTMLSelectElement>('sort').value = sortMode;
    void updateSettings({ fileSort });
    renderLists();
  });
  el<HTMLButtonElement>('toggle-prompts').onclick = () =>
    void updateSettings({ showPromptPopups: !currentSettings.showPromptPopups });
  el<HTMLButtonElement>('toggle-sync').onclick = () =>
    void updateSettings({ syncEnabled: !currentSettings.syncEnabled });
  el<HTMLButtonElement>('engine-add').onclick = async () => {
    const name = el<HTMLInputElement>('engine-name').value.trim();
    const trigger = el<HTMLInputElement>('engine-trigger').value.trim();
    const url = el<HTMLInputElement>('engine-url').value.trim();
    const status = el<HTMLElement>('engine-status');
    if (!name || !trigger || !url.includes('{q}')) {
      status.textContent = tr('invalidEngine');
      return;
    }
    const engine: SearchEngine = {
      id: `engine-${Date.now().toString(36)}`,
      name,
      trigger,
      url,
    };
    await updateSettings({
      smartSearchEngines: [...currentSettings.smartSearchEngines, engine],
    });
    el<HTMLInputElement>('engine-name').value = '';
    el<HTMLInputElement>('engine-trigger').value = '';
    el<HTMLInputElement>('engine-url').value = '';
    status.textContent = '';
    renderEngines();
  };
  el<HTMLButtonElement>('adrule-add').onclick = async () => {
    const input = el<HTMLInputElement>('adrule-input');
    const selector = input.value.trim();
    const status = el<HTMLElement>('adrule-status');
    if (!isSafeAdSelector(selector)) {
      status.textContent = tr('invalidRule');
      return;
    }
    if (currentSettings.customAdRules.includes(selector)) {
      status.textContent = '';
      input.value = '';
      return;
    }
    await updateSettings({
      customAdRules: [...currentSettings.customAdRules, selector],
    });
    input.value = '';
    status.textContent = '';
    renderAdRules();
  };
  el<HTMLButtonElement>('resources-refresh').onclick = async () => {
    await renderFeatureLists();
  };
  el<HTMLButtonElement>('bulk-enable').onclick = async () => {
    for (const script of visibleScripts()) await backendSetEnabled(script.id, true);
    await refresh();
  };
  el<HTMLButtonElement>('bulk-disable').onclick = async () => {
    for (const script of visibleScripts()) await backendSetEnabled(script.id, false);
    await refresh();
  };
  el<HTMLButtonElement>('new-script').onclick = async () => {
    const script = scriptFromSource(newScriptTemplate(), 'New script');
    script.id = generateId();
    await backendSave(script);
    selectedId = script.id;
    await refresh();
    openEditor(script);
  };
  el<HTMLButtonElement>('new-userstyle').onclick = async () => {
    const script = scriptFromSource(newUserstyleTemplate(), 'New userstyle');
    script.id = generateId();
    await backendSave(script);
    selectedId = script.id;
    await refresh();
    openEditor(script);
  };
  el<HTMLButtonElement>('import-script-button').onclick = () => el<HTMLInputElement>('import-script-file').click();
  el<HTMLButtonElement>('paste-script').onclick = () => void importFromClipboard();
  el<HTMLButtonElement>('import-json-button').onclick = () => el<HTMLInputElement>('import-json-file').click();
  el<HTMLButtonElement>('export-json').onclick = exportJson;
  el<HTMLButtonElement>('import-zip-button').onclick = () => el<HTMLInputElement>('import-zip-file').click();
  el<HTMLButtonElement>('export-zip').onclick = exportZip;

  wireFileInput('import-script-file', async (file) => {
    await importSourceText(await readFileAsText(file), file.name);
  });
  wireFileInput('import-json-file', async (file) => {
    const count = await importJsonText(await readFileAsText(file));
    el<HTMLElement>('status').textContent = tr('importedJson', { count });
    await refresh();
  });
  wireFileInput('import-zip-file', async (file) => {
    const count = await importZipBytes(await readFileAsBytes(file));
    el<HTMLElement>('status').textContent = tr('importedZip', { count });
    await refresh();
  });

  el<HTMLInputElement>('test-url').addEventListener('input', updateTestResult);
  el<HTMLButtonElement>('detail-enable').onclick = async () => {
    const script = scripts.find((s) => s.id === selectedId);
    if (!script) return;
    await backendSetEnabled(script.id, !script.enabled);
    await refresh();
  };
  el<HTMLButtonElement>('detail-edit').onclick = () => {
    const script = scripts.find((s) => s.id === selectedId);
    if (script) openEditor(script);
  };
  el<HTMLButtonElement>('detail-duplicate').onclick = async () => {
    const script = scripts.find((s) => s.id === selectedId);
    if (!script) return;
    const copy: StoredScript = {
      ...script,
      id: generateId(),
      name: `${script.name}${tr('duplicateSuffix')}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await backendSave(copy);
    selectedId = copy.id;
    await refresh();
  };
  el<HTMLButtonElement>('detail-export').onclick = () => {
    const script = scripts.find((s) => s.id === selectedId);
    if (!script) return;
    downloadBlob(
      script.code,
      safeFilename(script.name, script.type === 'userstyle' ? '.user.css' : '.user.js'),
      'text/plain',
    );
  };
  el<HTMLButtonElement>('detail-delete').onclick = async () => {
    const script = scripts.find((s) => s.id === selectedId);
    if (!script) return;
    if (!window.confirm(tr('deleteConfirm', { name: script.name }))) return;
    await backendRemove(script.id);
    selectedId = null;
    await refresh();
  };
  el<HTMLButtonElement>('editor-save').onclick = () => void saveEditor();
  el<HTMLButtonElement>('editor-discard').onclick = () => {
    if (editorView && editorView.state.doc.toString() !== editorOriginal) {
      if (!window.confirm(tr('discardConfirm'))) return;
    }
    closeEditor();
  };
  el<HTMLButtonElement>('editor-close').onclick = () => closeEditor();
}
