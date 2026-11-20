// OpenMonkey for Safari — URL matching.
// Implements the MDN match-pattern specification
// (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns)
// for @match / @exclude-match, plus glob matching for @include / @exclude.
// Clean-room implementation written from the spec, not copied from any
// existing userscript manager.

export interface MatchTarget {
  match: string[];
  include: string[];
  exclude: string[];
  excludeMatch: string[];
}

/** Escape every RegExp metacharacter in a literal string. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert a glob to a RegExp. `*` matches any run of characters (including
 * `/`), `?` matches exactly one character. A string of the form `/.../`
 * (optionally with trailing regex flags, e.g. `/.../i`) is treated as a
 * regular expression instead of a glob.
 */
export function globToRegExp(glob: string): RegExp {
  if (glob.length >= 2 && glob.startsWith('/')) {
    const lastSlash = glob.lastIndexOf('/');
    if (lastSlash > 0) {
      const body = glob.slice(1, lastSlash);
      const flags = glob.slice(lastSlash + 1);
      if (/^[a-z]*$/i.test(flags)) {
        try {
          return new RegExp(body, flags);
        } catch {
          // Fall through to glob handling if the regex is invalid.
        }
      }
    }
  }
  let out = '^';
  for (const ch of glob) {
    if (ch === '*') out += '.*';
    else if (ch === '?') out += '.';
    else out += escapeRegExp(ch);
  }
  out += '$';
  return new RegExp(out);
}

/**
 * Convert an MDN match pattern (e.g. `*://*.example.com/*`,
 * `https://example.com/path/*`) to a RegExp, or `null` if the pattern is
 * not a valid match pattern.
 *
 * Rules implemented:
 * - scheme is `*` (http/https only), or a literal scheme;
 * - host is `*` (any host), `*.domain` (the domain and any subdomain), or
 *   a literal host, optionally with a port (`:80`, `:*`);
 * - path must start with `/` and may contain `*` wildcards.
 */
export function matchPatternToRegExp(pattern: string): RegExp | null {
  const trimmed = pattern.trim();
  const parts = trimmed.split('://');
  if (parts.length !== 2) return null;
  const [schemePart, rest] = parts;
  if (!schemePart || !rest) return null;

  const slashIdx = rest.indexOf('/');
  if (slashIdx === -1) return null;
  const hostPart = rest.slice(0, slashIdx);
  const pathPart = rest.slice(slashIdx);
  if (!hostPart || !pathPart.startsWith('/')) return null;

  // Scheme: `*` means http or https; otherwise a literal scheme.
  let schemeRe: string;
  if (schemePart === '*') {
    schemeRe = 'https?';
  } else if (/^[a-z][a-z0-9+.-]*$/i.test(schemePart)) {
    schemeRe = escapeRegExp(schemePart.toLowerCase());
  } else {
    return null;
  }

  // Host (with optional :port).
  let host = hostPart;
  let portRe = '';
  const colonIdx = hostPart.lastIndexOf(':');
  if (colonIdx !== -1) {
    const portPart = hostPart.slice(colonIdx + 1);
    if (portPart === '*') {
      portRe = '(?::\\d+)?';
    } else if (/^\d+$/.test(portPart)) {
      portRe = ':' + portPart;
    } else {
      return null;
    }
    host = hostPart.slice(0, colonIdx);
  }
  if (!host) return null;

  let hostRe: string;
  if (host === '*') {
    hostRe = '[^/]+';
  } else if (host.startsWith('*.')) {
    const domain = host.slice(2);
    if (!domain || domain.includes('*') || domain.includes('/')) return null;
    // `*.example.com` matches example.com itself and any subdomain.
    hostRe = '(?:[^/]+\\.)?' + escapeRegExp(domain);
  } else if (host.includes('*')) {
    return null;
  } else {
    hostRe = escapeRegExp(host);
  }

  // Path: `*` is a wildcard, everything else is literal.
  let pathRe = '';
  for (const ch of pathPart) {
    pathRe += ch === '*' ? '.*' : escapeRegExp(ch);
  }

  try {
    return new RegExp(`^${schemeRe}://${hostRe}${portRe}${pathRe}$`, 'i');
  } catch {
    return null;
  }
}

/** True when `url` matches the MDN match pattern `pattern`. */
export function matchesMatchPattern(pattern: string, url: string): boolean {
  const re = matchPatternToRegExp(pattern);
  if (re === null) return false;
  return re.test(url);
}

/**
 * True when a script with the given @match / @include / @exclude /
 * @exclude-match rules should run on `url`.
 *
 * Included when any @match pattern matches OR any @include glob matches
 * (and at least one of the two lists is non-empty). Exclusion wins over
 * inclusion: any matching @exclude glob or @exclude-match pattern vetoes
 * the script.
 */
export function matchesIncludeExclude(target: MatchTarget, url: string): boolean {
  const hasIncludeRules = target.match.length > 0 || target.include.length > 0;
  if (!hasIncludeRules) return false;

  const included =
    target.match.some((p) => matchesMatchPattern(p, url)) ||
    target.include.some((g) => globToRegExp(g).test(url));
  if (!included) return false;

  if (target.exclude.some((g) => globToRegExp(g).test(url))) return false;
  if (target.excludeMatch.some((p) => matchesMatchPattern(p, url))) return false;

  return true;
}
