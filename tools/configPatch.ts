/**
 * Rewrite numeric literals inside an exported config object in TypeScript
 * source, preserving everything else (comments, formatting, other values).
 * Dev tooling only: lets the in-game tuning panel save values as the new base.
 *
 * Only plain numeric literals are replaced (`walkSpeed: 13,`). Expressions
 * (`1 / 1100`), hex colors and missing keys are reported as skipped.
 */

export interface PatchResult {
  source: string;
  applied: string[];
  skipped: string[];
}

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`Not a finite number: ${v}`);
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toPrecision(6)));
}

/** Find the `{ ... }` body of `export const NAME ... = {`. Returns [openIndex, closeIndex]. */
function findExportBlock(src: string, exportName: string): [number, number] {
  const re = new RegExp(`export\\s+const\\s+${exportName}\\b[^=]*=\\s*\\{`);
  const m = re.exec(src);
  if (!m) throw new Error(`export const ${exportName} not found`);
  const open = m.index + m[0].length - 1;
  return [open, matchBrace(src, open)];
}

function matchBrace(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  throw new Error('Unbalanced braces');
}

/** Locate `key:` at depth 1 of the block [open, close]. Returns index just after the colon. */
function findKey(src: string, open: number, close: number, key: string): number {
  const re = new RegExp(`(^|[\\s,{])${key}\\s*:`, 'g');
  re.lastIndex = open + 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) && m.index < close) {
    let depth = 0;
    for (let i = open + 1; i < m.index; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

export function patchConfigSource(src: string, exportName: string, values: Record<string, number>): PatchResult {
  const applied: string[] = [];
  const skipped: string[] = [];
  let out = src;
  for (const [path, value] of Object.entries(values)) {
    let [open, close] = findExportBlock(out, exportName);
    const keys = path.split('.');
    let ok = true;
    for (let k = 0; k < keys.length - 1 && ok; k++) {
      const at = findKey(out, open, close, keys[k]!);
      const brace = at < 0 ? -1 : out.indexOf('{', at);
      if (at < 0 || brace < 0 || out.slice(at, brace).trim() !== '') ok = false;
      else {
        open = brace;
        close = matchBrace(out, brace);
      }
    }
    const at = ok ? findKey(out, open, close, keys[keys.length - 1]!) : -1;
    if (at < 0) {
      skipped.push(path);
      continue;
    }
    // The literal runs to the next comma / newline / closing brace.
    const rest = out.slice(at);
    const end = rest.search(/[,\n}]/);
    const literal = rest.slice(0, end).trim();
    if (!NUMBER.test(literal)) {
      skipped.push(path);
      continue;
    }
    const lead = rest.slice(0, end).match(/^\s*/)![0];
    out = out.slice(0, at) + lead + formatNumber(value) + out.slice(at + end);
    applied.push(path);
  }
  return { source: out, applied, skipped };
}
