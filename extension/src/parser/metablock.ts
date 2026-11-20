// OpenMonkey for Safari — userscript metadata block parser.
// Clean-room implementation. The Tampermonkey/Greasemonkey metadata-block
// format is used here only as a compatibility specification: this parser
// was written from the documented key list, not copied from any existing
// userscript manager.

export type RunAt = 'document-start' | 'document-body' | 'document-end' | 'document-idle';
export type InjectInto = 'page' | 'content' | 'auto';

export interface UserScriptMetadata {
  name: string;
  nameLocales: Record<string, string>;
  namespace: string;
  version: string;
  description: string;
  descriptionLocales: Record<string, string>;
  author: string;
  homepage: string;
  icon: string;
  license: string;
  supportURL: string;
  updateURL: string;
  downloadURL: string;
  match: string[];
  include: string[];
  exclude: string[];
  excludeMatch: string[];
  grant: string[];
  require: string[];
  resource: Record<string, string>;
  runAt: RunAt;
  connect: string[];
  noframes: boolean;
  unwrap: boolean;
  injectInto: InjectInto;
  weight?: number;
}

export interface ParsedUserScript {
  /** Parsed metadata (defaults applied where the block omits a key). */
  metadata: UserScriptMetadata;
  /** User code: the original source with the metadata block stripped. */
  code: string;
  /** The original source, verbatim and unmodified. */
  source: string;
  errors: string[];
  warnings: string[];
}

const RUN_AT_VALUES: readonly RunAt[] = [
  'document-start',
  'document-body',
  'document-end',
  'document-idle',
];

const INJECT_INTO_VALUES: readonly InjectInto[] = ['page', 'content', 'auto'];

const GM_USAGE_RE = /\bGM_[A-Za-z_][A-Za-z0-9_]*\b|\bGM\.[A-Za-z_][A-Za-z0-9_]*\b/;

function defaultMetadata(): UserScriptMetadata {
  return {
    name: '',
    nameLocales: {},
    namespace: '',
    version: '',
    description: '',
    descriptionLocales: {},
    author: '',
    homepage: '',
    icon: '',
    license: '',
    supportURL: '',
    updateURL: '',
    downloadURL: '',
    match: [],
    include: [],
    exclude: [],
    excludeMatch: [],
    grant: [],
    require: [],
    resource: {},
    runAt: 'document-idle',
    connect: [],
    noframes: false,
    unwrap: false,
    injectInto: 'auto',
  };
}

function isRunAt(value: string): value is RunAt {
  return (RUN_AT_VALUES as readonly string[]).includes(value);
}

function isInjectInto(value: string): value is InjectInto {
  return (INJECT_INTO_VALUES as readonly string[]).includes(value);
}

/**
 * Parse a userscript source string.
 *
 * Only `//` line comments are recognised inside the metadata block, per the
 * userscript convention. The block must start with `// ==UserScript==` and
 * end with `// ==/UserScript==`. Lines before the block are ignored; the
 * returned `code` is everything after the closing marker line.
 */
export function parseUserScript(source: string): ParsedUserScript {
  const errors: string[] = [];
  const warnings: string[] = [];
  const metadata = defaultMetadata();
  const lines = source.split(/\r\n|\r|\n/);

  let startIndex = -1;
  let endIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '// ==UserScript==') {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    errors.push('Missing metadata block: no // ==UserScript== marker found.');
    return { metadata, code: source, source, errors, warnings };
  }

  for (let i = startIndex + 1; i < lines.length; i++) {
    if (lines[i].trim() === '// ==/UserScript==') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    errors.push('Missing metadata block end: no // ==/UserScript== marker found.');
    return { metadata, code: source, source, errors, warnings };
  }

  // The user code is everything after the closing marker.
  const code = lines.slice(endIndex + 1).join('\n');

  // Parse the `// @key value` lines between the markers.
  const keyRe = /^\/\/\s*@([A-Za-z][A-Za-z0-9_-]*)(?::([A-Za-z]{2}(?:-[A-Za-z]{2})?))?\s*(.*)$/;
  for (let i = startIndex + 1; i < endIndex; i++) {
    const line = lines[i];
    const m = keyRe.exec(line.trim());
    if (!m) continue;
    const key = m[1].toLowerCase();
    const locale = m[2] !== undefined ? m[2] : null;
    const value = m[3].trim();

    switch (key) {
      case 'name':
        if (locale) metadata.nameLocales[locale] = value;
        else metadata.name = value;
        break;
      case 'description':
        if (locale) metadata.descriptionLocales[locale] = value;
        else metadata.description = value;
        break;
      case 'namespace':
        metadata.namespace = value;
        break;
      case 'version':
        metadata.version = value;
        break;
      case 'author':
        metadata.author = value;
        break;
      case 'homepage':
        metadata.homepage = value;
        break;
      case 'icon':
        metadata.icon = value;
        break;
      case 'license':
        metadata.license = value;
        break;
      case 'supporturl':
        metadata.supportURL = value;
        break;
      case 'updateurl':
        metadata.updateURL = value;
        break;
      case 'downloadurl':
        metadata.downloadURL = value;
        break;
      case 'match':
        if (value) metadata.match.push(value);
        break;
      case 'include':
        if (value) metadata.include.push(value);
        break;
      case 'exclude':
        if (value) metadata.exclude.push(value);
        break;
      case 'excludematch':
        if (value) metadata.excludeMatch.push(value);
        break;
      case 'grant':
        if (value) metadata.grant.push(value);
        break;
      case 'require':
        if (value) metadata.require.push(value);
        break;
      case 'resource': {
        // `@resource <name> <url>` — the name is the first token.
        const parts = value.split(/\s+/);
        if (parts.length >= 2) {
          metadata.resource[parts[0]] = parts.slice(1).join(' ');
        } else {
          warnings.push(`Ignoring malformed @resource line: "${value}".`);
        }
        break;
      }
      case 'run-at':
      case 'runat':
        if (isRunAt(value)) {
          metadata.runAt = value;
        } else if (value) {
          warnings.push(`Unknown @run-at value "${value}"; using "document-idle".`);
        }
        break;
      case 'connect':
        if (value) metadata.connect.push(value);
        break;
      case 'noframes':
        metadata.noframes = true;
        break;
      case 'unwrap':
        metadata.unwrap = true;
        break;
      case 'inject-into':
      case 'injectinto':
        if (isInjectInto(value)) {
          metadata.injectInto = value;
        } else if (value) {
          warnings.push(`Unknown @inject-into value "${value}"; using "auto".`);
        }
        break;
      case 'weight': {
        const n = Number.parseInt(value, 10);
        if (Number.isFinite(n)) metadata.weight = n;
        else warnings.push(`Ignoring non-numeric @weight value "${value}".`);
        break;
      }
      default:
        // Unknown keys are tolerated for forward compatibility.
        break;
    }
  }

  if (!metadata.name) {
    errors.push('Missing @name in metadata block.');
  }
  if (metadata.match.length === 0 && metadata.include.length === 0) {
    warnings.push(
      'Script has no @match or @include rules and will not run on any page.',
    );
  }
  if (!metadata.version) {
    warnings.push('Script has no @version; update checks will treat it as version "".');
  }
  if (metadata.grant.length === 1 && metadata.grant[0] === 'none' && GM_USAGE_RE.test(code)) {
    warnings.push(
      'Script declares @grant none but its code uses GM_* / GM.* APIs, which will be unavailable at runtime.',
    );
  }

  return { metadata, code, source, errors, warnings };
}
