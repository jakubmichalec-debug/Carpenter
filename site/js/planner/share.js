// Planner v2 share links and local storage: pure, runs in Node 22 and the browser.
import { clampProject, migrate } from './model.js';
import { decodeDesign } from '../configurator/share.js';

const KEY = 'gj.project.v2';
const MAX_ENCODED = 200000;     // characters of a link we are willing to parse
const MAX_DECODED = 2000000;    // bytes after inflating (guards against zip bombs)
const DEFLATED = 'z';
const PLAIN = 'u';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(stream, bytes, limit) {
  const writer = stream.writable.getWriter();
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { reader.cancel().catch(() => {}); throw new Error('too large'); }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

// A link carries the pieces and nothing else: no room, no placements, and no look or size the piece does not need (the
// decoder fills every missing field from the piece's style). That keeps the link short.
export function compactProject(project) {
  return { v: 2, pieces: project.pieces };
}

export async function encodeProject(project) {
  const json = JSON.stringify(compactProject(project));
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'function') {
    try {
      return DEFLATED + toBase64Url(await pipe(new CompressionStream('deflate-raw'), bytes, MAX_DECODED));
    } catch { /* fall through to plain */ }
  }
  return PLAIN + toBase64Url(bytes);
}

function fromParsed(raw) {
  if (!isObj(raw)) return null;
  if (raw.v === 1 || (Array.isArray(raw.modules) && !Array.isArray(raw.pieces))) {
    if (!isObj(raw.room) || !Array.isArray(raw.modules)) return null;
    return migrate(raw);
  }
  if (!Array.isArray(raw.pieces)) return null;
  return clampProject(raw); // a room and placements from an older link are ignored
}

export async function decodeProject(str) {
  try {
    if (typeof str !== 'string') return null;
    let s = str.trim();
    if (!s || s.length > MAX_ENCODED) return null;
    const hash = s.indexOf('#');
    if (hash >= 0) s = s.slice(hash + 1);
    let legacy = false;
    if (s.startsWith('p=')) s = s.slice(2);
    else if (s.startsWith('design=')) { s = s.slice(7); legacy = true; }
    if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
    if (legacy || s[0] === 'e') {
      const d = decodeDesign(s);
      return d ? migrate(d) : null;
    }
    const mode = s[0];
    const bytes = fromBase64Url(s.slice(1));
    let text;
    if (mode === DEFLATED) {
      if (typeof DecompressionStream !== 'function') return null;
      text = new TextDecoder('utf-8', { fatal: true }).decode(await pipe(new DecompressionStream('deflate-raw'), bytes, MAX_DECODED));
    } else if (mode === PLAIN) {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } else {
      return null;
    }
    return fromParsed(JSON.parse(text));
  } catch {
    return null;
  }
}

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function saveLocal(project) {
  try {
    const ls = storage();
    if (!ls) return false;
    ls.setItem(KEY, JSON.stringify(compactProject(project)));
    return true;
  } catch {
    return false;
  }
}

export function loadLocal() {
  try {
    const ls = storage();
    if (!ls) return null;
    const s = ls.getItem(KEY);
    return s ? fromParsed(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}
