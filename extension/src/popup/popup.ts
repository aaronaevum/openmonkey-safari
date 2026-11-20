// OpenMonkey for Safari — popup.
//
// Addons-card design in iOS manners (see docs/ui-redesign.md):
//   - Header: logo, current site, and a global injection switch.
//   - Site status card: how many scripts run on this page, how many
//     matched. Then only the matching scripts, as cards with an avatar,
//     name/version, author, a status badge, and an iOS-style switch.
//   - Footer: Open dashboard, New script, Install from URL.
//   - Install prompt: the current tab is a .user.js URL (or the
//     background sent OM_INSTALL_PROMPT). Shows the parsed name,
//     version, @match list, @grant list, source URL, and a
//     syntax-highlighted plain <pre> preview of the first 200 lines,
//     with Install/Cancel.
//
// Communication with the background goes through
// chrome.runtime.sendMessage. The background's real protocol (see
// src/background/index.ts) is:
//   {type: 'OM_GET_MATCHING_SCRIPTS', url} -> {ok, globalEnabled, scripts: [{id, metadata, source}]}
//   {type: 'OM_INSTALL_SCRIPT', source, sourceUrl} -> {ok, id, warnings}
//   {type: 'OM_CHECK_UPDATES'} / {type: 'OM_NATIVE', payload}
// There is no OM_LIST_SCRIPTS / OM_SET_ENABLED / OM_FETCH_SCRIPT message:
// listing and toggling go through the registry directly (same extension
// context, same chrome.storage.local), with storage.ts as the fallback.
// sendMessage is callback-based in Safari (see src/content/index.ts),
// so it is wrapped in a promise with a timeout instead of awaited.
//
// The global injection switch is a real setting
// (openmonkey.settings.v1 in chrome.storage.local, see storage.ts).
// When it is off, the background returns no matching scripts, so
// content scripts inject nothing; the popup still lists the matching
// scripts from the registry so the library never looks empty, with a
// "Paused" badge. Injection resumes on the next navigation/reload.
//
// When the extension API is absent (plain page / demo), the popup falls
// back to the localStorage sample data in storage.ts and installs
// straight into localStorage.

import { parseUserScript } from '../parser/metablock.js';
import { matchesIncludeExclude } from '../matcher/matcher.js';
import { createRegistry } from '../background/registry.js';
import { parseSmartSearch } from '../features.js';
import { applyStaticStrings, resolveLanguage, translate, type Language, type LanguageSetting } from '../i18n.js';
import {
  chromeAvailable,
  chromeStorageAvailable,
  generateId,
  getSettings,
  loadScripts,
  normaliseScript,
  pushSettingsToNative,
  saveScript,
  saveSettings,
  scriptIdFor,
  seedDemoScripts,
  setEnabled,
  type DarkModeSetting,
  type ExtensionSettings,
  type StoredScript,
} from '../pages/storage.js';

const PREVIEW_LINES = 200;

type BackgroundResponse = Record<string, unknown>;

/** Popup state kept between renders (search re-renders the list). */
let globalEnabled = true;
let searchQuery = '';
/** Stay-style segment: all scripts, only enabled ones, only stopped ones. */
let segment: 'all' | 'activated' | 'stopped' = 'all';
/** Effective UI language and the stored preference behind it. */
let currentLanguage: Language = 'en';
let currentLanguageSetting: LanguageSetting = 'system';
let lastScripts: StoredScript[] = [];
let lastTabUrl = '';
/** The full feature settings, loaded by refresh(). */
let featureSettings: ExtensionSettings | null = null;

/** Translate one UI string in the popup's current language. */
function tr(
  key: Parameters<typeof translate>[0],
  vars?: Record<string, string | number>,
): string {
  return translate(key, currentLanguage, vars);
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Popup element missing: #${id}`);
  return node as T;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Very small token highlighter for the source preview (comments/strings/keywords). */
function highlightSource(source: string): string {
  const escaped = escapeHtml(source);
  return escaped
    .replace(/(\/\/[^\n]*)/g, '<span class="tok-comment">$1</span>')
    .replace(/(&quot;[^&]*?&quot;|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, '<span class="tok-string">$1</span>')
    .replace(/\b(const|let|var|function|return|if|else|for|while|new|class|import|export|await|async|typeof|instanceof)\b/g, '<span class="tok-keyword">$1</span>');
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

async function sendToBackground(message: Record<string, unknown>): Promise<BackgroundResponse | null> {
  if (!chromeAvailable() || typeof chrome.runtime?.sendMessage !== 'function') return null;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 2000);
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
  const settings = await getSettings();
  const next = { ...settings, language: setting };
  await saveSettings(next);
  void pushSettingsToNative({ language: setting });
  currentLanguageSetting = setting;
  currentLanguage = resolveLanguage(setting);
  applyStrings();
  // Re-render the visible view: the install prompt's static labels
  // are already re-applied by applyStrings, and its name/version are
  // script metadata (not translated), so only the list re-renders.
  if (el('install-view').hidden) renderScriptList(lastScripts, lastTabUrl);
}

/** Set one script's enabled flag via the registry, falling back to storage.ts. */
async function setScriptEnabled(id: string, enabled: boolean): Promise<void> {
  if (chromeAvailable()) {
    try {
      const registry = createRegistry();
      // setEnabled returns null for an id the registry does not know.
      const updated = await registry.setEnabled(id, enabled);
      if (updated) return;
    } catch {
      // Fall through to storage.ts.
    }
  }
  await setEnabled(id, enabled);
}

async function getCurrentTabUrl(): Promise<string> {
  if (!chromeAvailable() || typeof chrome.tabs?.query !== 'function') return '';
  try {
    // Safari's tabs.query is callback-based; Chromium also offers a
    // promise form. Prefer the callback, honour a returned promise too.
    const tabs = await new Promise<Array<{ url?: string }>>((resolve) => {
      const maybePromise = chrome.tabs.query(
        { active: true, currentWindow: true },
        (result: Array<{ url?: string }>) => resolve(result ?? []),
      ) as unknown;
      if (maybePromise && typeof (maybePromise as { then?: unknown }).then === 'function') {
        (maybePromise as Promise<Array<{ url?: string }>>).then(
          (result) => resolve(result ?? []),
          () => resolve([]),
        );
      }
    });
    return tabs[0]?.url ?? '';
  } catch {
    return '';
  }
}

function isUserJsUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return pathname.toLowerCase().endsWith('.user.js');
  } catch {
    return url.toLowerCase().split('?')[0].split('#')[0].endsWith('.user.js');
  }
}

async function fetchScriptSource(url: string): Promise<string> {
  // The popup can fetch a .user.js URL directly; there is no
  // OM_FETCH_SCRIPT background message, so no background fetch is attempted.
  const response = await fetch(url);
  if (!response.ok) throw new Error(tr('downloadFailed', { status: response.status }));
  return response.text();
}

async function setBadge(count: number): Promise<void> {
  if (!chromeAvailable() || typeof chrome.action?.setBadgeText !== 'function') return;
  try {
    const maybePromise = chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' }) as unknown;
    if (maybePromise && typeof (maybePromise as { then?: unknown }).then === 'function') {
      await (maybePromise as Promise<void>);
    }
  } catch {
    // Badge updates are best-effort; a failure must not break the popup.
  }
}

function openDashboard(createNew: boolean): void {
  const url = createNew ? 'pages.html?new=1' : 'pages.html';
  if (chromeAvailable() && typeof chrome.runtime?.openOptionsPage === 'function' && !createNew) {
    chrome.runtime.openOptionsPage();
  } else if (chromeAvailable() && typeof chrome.tabs?.create === 'function') {
    void chrome.tabs.create({ url: chrome.runtime.getURL(url) });
  } else {
    window.open(url, '_blank');
  }
}

function renderChips(list: HTMLUListElement, items: string[], emptyText: string): void {
  list.innerHTML = '';
  if (items.length === 0) {
    const li = document.createElement('li');
    li.textContent = emptyText;
    list.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  }
}

function renderInstallPrompt(source: string, sourceUrl: string): void {
  const parsed = parseUserScript(source);
  const meta = parsed.metadata;
  el('install-view').hidden = false;
  el('list-view').hidden = true;
  el<HTMLElement>('install-name').textContent = meta.name || sourceUrl.split('/').pop() || tr('unnamedScript');
  el<HTMLElement>('install-version').textContent = meta.version || '—';
  el<HTMLElement>('install-author').textContent = meta.author || '—';
  el<HTMLElement>('install-url').textContent = sourceUrl;
  const description = el<HTMLElement>('install-description');
  description.hidden = !meta.description;
  description.textContent = meta.description || '';
  renderChips(el<HTMLUListElement>('install-matches'), [...meta.match, ...meta.include], '—');
  renderChips(el<HTMLUListElement>('install-grants'), [...meta.grant], tr('noGrants'));
  const errors = el<HTMLElement>('install-errors');
  const problems = [...parsed.errors, ...parsed.warnings];
  errors.hidden = problems.length === 0;
  errors.textContent = problems.join(' ');
  el<HTMLElement>('install-preview').innerHTML = highlightSource(
    source.split(/\r\n|\r|\n/).slice(0, PREVIEW_LINES).join('\n'),
  );

  el<HTMLButtonElement>('install-button').onclick = async () => {
    // Real background protocol: OM_INSTALL_SCRIPT takes the raw source.
    const installed = await sendToBackground({
      type: 'OM_INSTALL_SCRIPT',
      source,
      sourceUrl: sourceUrl,
    });
    if (!installed || installed.ok !== true) {
      // Fall back to installing directly through the registry (real
      // extension only — without chrome its adapter is in-memory and
      // would not survive the popup closing), then storage.ts.
      let saved = false;
      if (chromeAvailable()) {
        try {
          const registry = createRegistry();
          await registry.saveScript({ metadata: meta, source });
          saved = true;
        } catch {
          saved = false;
        }
      }
      if (!saved) {
        const script: StoredScript = {
          id: scriptIdFor(meta.name || generateId(), meta.namespace),
          name: meta.name || tr('unnamedScript'),
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
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastRun: null,
          lastError: null,
        };
        await saveScript(script);
      }
    }
    window.close();
  };
  el<HTMLButtonElement>('cancel-button').onclick = () => window.close();
}

/** Format an updatedAt timestamp as YYYY-MM-DD for the status line. */
function updatedDate(script: StoredScript): string {
  if (!script.updatedAt) return '';
  try {
    return new Date(script.updatedAt).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function renderScriptList(scripts: StoredScript[], tabUrl: string): void {
  lastScripts = scripts;
  lastTabUrl = tabUrl;
  el('install-view').hidden = true;
  el('list-view').hidden = false;
  try {
    el<HTMLElement>('site-host').textContent = tabUrl ? new URL(tabUrl).host : '—';
  } catch {
    el<HTMLElement>('site-host').textContent = tabUrl || '—';
  }
  el<HTMLElement>('current-url').textContent = tabUrl || '—';
  const list = el<HTMLUListElement>('script-list');
  list.innerHTML = '';
  const matched = tabUrl ? scripts.filter((s) => s.type === 'userscript' && matchesIncludeExclude(
    {
      match: (s.metadata.match as string[] | undefined) ?? s.matches,
      include: (s.metadata.include as string[] | undefined) ?? [],
      exclude: (s.metadata.exclude as string[] | undefined) ?? [],
      excludeMatch: (s.metadata.excludeMatch as string[] | undefined) ?? [],
    },
    tabUrl,
  )) : scripts.filter((s) => s.type === 'userscript');
  const q = searchQuery.trim().toLowerCase();
  const bySearch = q
    ? matched.filter((s) => [s.name, s.author, s.description].join(' ').toLowerCase().includes(q))
    : matched;
  // Stay-style segment: Activated = enabled, Stopped = disabled.
  const visible = segment === 'activated'
    ? bySearch.filter((s) => s.enabled)
    : segment === 'stopped'
      ? bySearch.filter((s) => !s.enabled)
      : bySearch;
  const running = globalEnabled ? matched.filter((s) => s.enabled).length : 0;
  void setBadge(matched.length);
  el<HTMLElement>('site-status').textContent = tr('runningMatched', {
    running,
    matched: matched.length,
  });
  el<HTMLElement>('empty-state').hidden = visible.length !== 0;
  el<HTMLElement>('empty-state').textContent =
    matched.length === 0 ? tr('emptyNoScriptsPopup') : tr('emptyNoResults');
  for (const script of visible) {
    // One Stay-style row: 40px rounded-square icon, bold name + version,
    // one-line description, status line ("● Activated | ⓥ v | Updated date"),
    // green switch on the right.
    const li = document.createElement('li');
    li.className = `script-row${!globalEnabled ? ' paused' : ''}${!script.enabled ? ' disabled' : ''}`;
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
    const paused = !globalEnabled;
    const stopped = !script.enabled;
    dot.className = `status-dot${paused || stopped ? ' stopped' : ''}`;
    const statusText = document.createElement('span');
    statusText.className = `status-text${paused || stopped ? ' stopped' : ''}`;
    statusText.textContent = paused
      ? tr('statusPaused')
      : stopped
        ? tr('statusStopped')
        : tr('statusActivated');
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
      const typeChip = document.createElement('span');
      typeChip.className = 'status-line';
      typeChip.textContent = tr('cssUserstyle');
      body.appendChild(typeChip);
    }
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = `switch small${script.enabled ? ' on' : ''}`;
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(script.enabled));
    toggle.setAttribute(
      'aria-label',
      script.enabled ? tr('disableAria', { name: script.name }) : tr('enableAria', { name: script.name }),
    );
    toggle.onclick = async () => {
      await setScriptEnabled(script.id, !script.enabled);
      await refresh();
    };
    li.append(icon, body, toggle);
    list.appendChild(li);
  }
}

async function refresh(): Promise<void> {
  const settings = await getSettings();
  featureSettings = settings;
  globalEnabled = settings.globalEnabled;
  setSwitch(el<HTMLButtonElement>('global-toggle'), globalEnabled);
  el<HTMLElement>('paused-note').hidden = globalEnabled;
  renderFeatures();
  const tabUrl = await getCurrentTabUrl();
  if (tabUrl && isUserJsUrl(tabUrl)) {
    try {
      const source = await fetchScriptSource(tabUrl);
      renderInstallPrompt(source, tabUrl);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      el('install-view').hidden = false;
      el('list-view').hidden = true;
      el<HTMLElement>('install-errors').hidden = false;
      el<HTMLElement>('install-errors').textContent = message;
      el<HTMLElement>('install-url').textContent = tabUrl;
      el<HTMLElement>('install-preview').textContent = '';
    }
  }
  let scripts = await loadScripts();
  if (scripts.length === 0 && !chromeStorageAvailable()) {
    scripts = seedDemoScripts();
    el<HTMLElement>('demo-note').hidden = false;
  }
  // The background is the source of truth when it answers
  // OM_GET_MATCHING_SCRIPTS; otherwise list through the registry
  // directly and filter locally, falling back to storage.ts above.
  // When injection is paused the background returns no scripts, so
  // the popup lists from the registry instead — the library must not
  // look empty just because injection is off.
  const viaBackground = tabUrl
    ? await sendToBackground({ type: 'OM_GET_MATCHING_SCRIPTS', url: tabUrl })
    : null;
  const backgroundUsable =
    viaBackground !== null &&
    viaBackground.ok === true &&
    Array.isArray(viaBackground.scripts) &&
    viaBackground.globalEnabled !== false;
  if (backgroundUsable) {
    scripts = (viaBackground.scripts as unknown[])
      .map((raw) => normaliseScript(raw))
      .filter((s): s is StoredScript => s !== null);
  } else if (chromeAvailable()) {
    try {
      const registry = createRegistry();
      const listed = await registry.listScripts();
      if (listed.length > 0) {
        scripts = listed
          .map((raw) => normaliseScript(raw))
          .filter((s): s is StoredScript => s !== null);
      }
    } catch {
      // Keep the storage.ts result.
    }
  }
  renderScriptList(scripts, tabUrl);
}

/** Render the v0.5.0 feature cards from the loaded settings. The
 * dark-mode switch is the darkModeEnabled toggle (the Home switch);
 * the segmented control underneath picks the mode (auto/light/dark),
 * which only matters while the toggle is on. */
function renderFeatures(): void {
  const settings = featureSettings;
  if (!settings) return;
  setSwitch(el<HTMLButtonElement>('toggle-adfilter'), settings.adFilterEnabled);
  setSwitch(el<HTMLButtonElement>('toggle-tagmode'), settings.tagModeEnabled);
  setSwitch(el<HTMLButtonElement>('toggle-darkmode'), settings.darkModeEnabled);
  el<HTMLElement>('darkmode-extra').hidden = false;
  for (const [id, mode] of [
    ['dark-auto', 'auto'],
    ['dark-light', 'light'],
    ['dark-dark', 'dark'],
  ] as Array<[string, DarkModeSetting]>) {
    const button = el<HTMLButtonElement>(id);
    button.classList.toggle('selected', settings.darkMode === mode);
    button.setAttribute('aria-selected', String(settings.darkMode === mode));
  }
  setSwitch(el<HTMLButtonElement>('toggle-smartsearch'), settings.smartSearchEnabled);
  el<HTMLElement>('smartsearch-extra').hidden = !settings.smartSearchEnabled;
  setSwitch(el<HTMLButtonElement>('toggle-sniff'), settings.sniffEnabled);
}

/** Flip one boolean feature setting, persist it, push it to the
 * native side, and nudge the background (which re-applies the
 * feature in every tab via storage.onChanged). */
async function toggleFeature(
  field:
    | 'adFilterEnabled'
    | 'tagModeEnabled'
    | 'smartSearchEnabled'
    | 'sniffEnabled'
    | 'darkModeEnabled',
): Promise<void> {
  if (!featureSettings) return;
  const next: ExtensionSettings = { ...featureSettings, [field]: !featureSettings[field] };
  await saveSettings(next);
  featureSettings = next;
  void pushSettingsToNative({ [field]: next[field] } as Partial<ExtensionSettings>);
  await sendToBackground({ type: 'OM_SET_SETTINGS', settings: next });
  renderFeatures();
}

async function setDarkMode(mode: DarkModeSetting): Promise<void> {
  if (!featureSettings) return;
  const next: ExtensionSettings = { ...featureSettings, darkMode: mode };
  await saveSettings(next);
  featureSettings = next;
  void pushSettingsToNative({ darkMode: mode });
  await sendToBackground({ type: 'OM_SET_SETTINGS', settings: next });
  renderFeatures();
}

/** The dark-mode card switch is the darkModeEnabled toggle: on =
 * darken pages (following the darkMode choice), off = no dark-mode
 * injection at all. The mode itself is picked with the segmented
 * control underneath (Auto follows the system). */
async function toggleDarkModeNow(): Promise<void> {
  await toggleFeature('darkModeEnabled');
}

/** Run the smart-search box: resolve the trigger word and open the
 * engine's search URL in a new tab. */
async function runSmartSearch(): Promise<void> {
  if (!featureSettings) return;
  const input = el<HTMLInputElement>('smart-search-input').value;
  const result = parseSmartSearch(
    input,
    featureSettings.smartSearchEngines,
    featureSettings.smartSearchTrigger,
  );
  if (!result) return;
  if (chromeAvailable() && typeof chrome.tabs?.create === 'function') {
    try {
      chrome.tabs.create({ url: result.url });
      return;
    } catch {
      // Fall through to window.open.
    }
  }
  window.open(result.url, '_blank');
}

/** Apply every static string for the current language (markup
 * [data-i18n] strings plus the document title and lang attribute),
 * and mark the active language button. Dynamic strings (the script
 * list, the install prompt) are re-rendered by the caller. */
function applyStrings(): void {
  document.title = tr('appName');
  document.documentElement.lang = currentLanguage;
  applyStaticStrings(document, currentLanguage);
  for (const [id, value] of [
    ['lang-zh', 'zh'],
    ['lang-en', 'en'],
  ] as Array<[string, LanguageSetting]>) {
    const button = el<HTMLButtonElement>(id);
    button.classList.toggle('selected', currentLanguageSetting === value);
    button.setAttribute('aria-pressed', String(currentLanguageSetting === value));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void (async () => {
    // Pull the native host app's settings first (best-effort), then
    // render in the merged language.
    await syncNativeOnOpen();
    const settings = await getSettings();
    currentLanguageSetting = settings.language;
    currentLanguage = resolveLanguage(settings.language);
    applyStrings();
    wireHandlers();
    await refresh();
  })();
});

function wireHandlers(): void {
  el<HTMLButtonElement>('global-toggle').onclick = async () => {
    const settings = await getSettings();
    const next = { ...settings, globalEnabled: !settings.globalEnabled };
    await saveSettings(next);
    // Push the flip to the native side so the host app stays in sync
    // (best-effort; a failure leaves the local setting in place).
    void pushSettingsToNative({ globalEnabled: next.globalEnabled });
    await refresh();
  };
  // Compact language switch in the header: 中文 / EN. The system
  // choice lives in the dashboard settings; here the switch flips
  // between the two explicit languages.
  el<HTMLButtonElement>('lang-zh').onclick = () => void setLanguage('zh');
  el<HTMLButtonElement>('lang-en').onclick = () => void setLanguage('en');
  el<HTMLInputElement>('popup-search').addEventListener('input', (event) => {
    searchQuery = (event.target as HTMLInputElement).value;
    renderScriptList(lastScripts, lastTabUrl);
  });
  // Stay-style capsule segments: All / Activated / Stopped.
  const segmentButtons: Array<[string, 'all' | 'activated' | 'stopped']> = [
    ['seg-all', 'all'],
    ['seg-activated', 'activated'],
    ['seg-stopped', 'stopped'],
  ];
  for (const [id, value] of segmentButtons) {
    el<HTMLButtonElement>(id).onclick = () => {
      segment = value;
      for (const [buttonId] of segmentButtons) {
        const button = el<HTMLButtonElement>(buttonId);
        button.classList.toggle('selected', buttonId === id);
        button.setAttribute('aria-selected', String(buttonId === id));
      }
      renderScriptList(lastScripts, lastTabUrl);
    };
  }
  el<HTMLButtonElement>('open-dashboard').onclick = () => openDashboard(false);
  // v0.5.0 feature cards.
  el<HTMLButtonElement>('toggle-adfilter').onclick = () => void toggleFeature('adFilterEnabled');
  el<HTMLButtonElement>('toggle-tagmode').onclick = () => void toggleFeature('tagModeEnabled');
  el<HTMLButtonElement>('toggle-darkmode').onclick = () => void toggleDarkModeNow();
  el<HTMLButtonElement>('toggle-smartsearch').onclick = () => void toggleFeature('smartSearchEnabled');
  el<HTMLButtonElement>('toggle-sniff').onclick = () => void toggleFeature('sniffEnabled');
  for (const [id, mode] of [
    ['dark-auto', 'auto'],
    ['dark-light', 'light'],
    ['dark-dark', 'dark'],
  ] as Array<[string, DarkModeSetting]>) {
    el<HTMLButtonElement>(id).onclick = () => void setDarkMode(mode);
  }
  el<HTMLButtonElement>('smart-search-go').onclick = () => void runSmartSearch();
  el<HTMLInputElement>('smart-search-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void runSmartSearch();
  });
  // Grey "View help" capsule on each feature card toggles its help line.
  document.querySelectorAll<HTMLButtonElement>('.help-capsule').forEach((button) => {
    button.onclick = () => {
      const target = document.getElementById(`help-${button.dataset.help ?? ''}`);
      if (target) target.hidden = !target.hidden;
    };
  });
  el<HTMLButtonElement>('new-script-button').onclick = () => openDashboard(true);
  el<HTMLButtonElement>('install-url-toggle').onclick = () => {
    const row = el<HTMLElement>('install-url-row');
    row.hidden = !row.hidden;
    if (!row.hidden) el<HTMLInputElement>('install-url-input').focus();
  };
  el<HTMLButtonElement>('install-url-button').onclick = async () => {
    const url = el<HTMLInputElement>('install-url-input').value.trim();
    if (!url) return;
    try {
      const source = await fetchScriptSource(url);
      renderInstallPrompt(source, url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      el('install-view').hidden = false;
      el('list-view').hidden = true;
      el<HTMLElement>('install-errors').hidden = false;
      el<HTMLElement>('install-errors').textContent = message;
      el<HTMLElement>('install-url').textContent = url;
      el<HTMLElement>('install-preview').textContent = '';
    }
  };
  // No background push message exists for install prompts (the
  // background protocol is request/response only), so the install
  // prompt is driven solely by the current tab's URL — see refresh().
}
