// OpenMonkey for Safari — userscript update checker.
// Fetches a script's @updateURL .meta.js, parses it with the project
// parser, and compares versions. Updates are never auto-applied here:
// this module only reports availability. A script the user edited locally
// (userModified) is reported as blocked so the caller can ask first.

import { parseUserScript } from '../parser/metablock.js';
import type { StoredScript } from './registry.js';

export interface UpdateCheckResult {
  available: boolean;
  newVersion?: string;
  downloadUrl?: string;
  /** True when an update exists but the user edited the script locally. */
  blockedByLocalEdits?: boolean;
}

/**
 * Semver-ish comparison. Numeric segments compare numerically, missing
 * segments count as 0, and a release beats a pre-release of the same core
 * (e.g. 1.2.0 > 1.2.0-beta). Returns -1, 0, or 1.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): { core: number[]; pre: string[] } => {
    const [corePart, ...preParts] = v.trim().split('-');
    const core = corePart.split('.').map((s) => {
      const n = Number.parseInt(s, 10);
      return Number.isFinite(n) ? n : 0;
    });
    const pre = preParts.length > 0 ? preParts.join('-').split('.') : [];
    return { core, pre };
  };
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.core.length, pb.core.length);
  for (let i = 0; i < len; i++) {
    const x = pa.core[i] ?? 0;
    const y = pb.core[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  // Equal core: no pre-release beats a pre-release.
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0;
  if (pa.pre.length === 0) return 1;
  if (pb.pre.length === 0) return -1;
  const plen = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < plen; i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xn = Number.parseInt(x, 10);
    const yn = Number.parseInt(y, 10);
    if (Number.isFinite(xn) && Number.isFinite(yn)) return xn < yn ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

export async function checkForUpdate(
  script: StoredScript,
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateCheckResult> {
  const updateURL = script.metadata.updateURL;
  if (!updateURL) {
    return { available: false };
  }

  let metaText: string;
  try {
    const res = await fetchImpl(updateURL);
    if (!res.ok) return { available: false };
    metaText = await res.text();
  } catch {
    // Network failure is not an update; the caller may retry later.
    return { available: false };
  }

  const parsed = parseUserScript(metaText);
  if (parsed.errors.length > 0 || !parsed.metadata.version) {
    return { available: false };
  }

  const newVersion = parsed.metadata.version;
  const available = compareVersions(newVersion, script.metadata.version) > 0;
  if (!available) return { available: false };

  const downloadUrl =
    parsed.metadata.downloadURL ||
    script.metadata.downloadURL ||
    updateURL.replace(/\.meta\.js$/i, '.user.js');

  if (script.userModified) {
    // Never auto-apply over local edits: report the update as blocked.
    return { available: true, newVersion, downloadUrl, blockedByLocalEdits: true };
  }

  return { available: true, newVersion, downloadUrl };
}
