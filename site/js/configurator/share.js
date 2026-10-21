// Share: encode a design into a URL-safe string and back. Works in Node and in the browser.
import { MODULE_TYPES, clampDesign } from './model.js';

const KEY = 'gj.design.v1';
const MAX_ENCODED = 60000;

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

// Drop module fields that equal the type default (id, type and x always stay) to keep links short.
function compact(design) {
  return {
    v: design.v,
    room: design.room,
    modules: design.modules.map((m) => {
      const def = MODULE_TYPES[m.type] && MODULE_TYPES[m.type].defaults;
      const out = {};
      for (const [k, v] of Object.entries(m)) {
        if (k === 'id' || k === 'type' || k === 'x' || !def || def[k] !== v) out[k] = v;
      }
      return out;
    })
  };
}

export function encodeDesign(design) {
  return toBase64Url(JSON.stringify(compact(design)));
}

export function decodeDesign(str) {
  try {
    if (typeof str !== 'string' || !str || str.length > MAX_ENCODED) return null;
    const s = str.trim().replace(/^#?(design=)?/, '');
    if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
    const raw = JSON.parse(fromBase64Url(s));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (!raw.room || typeof raw.room !== 'object' || !Array.isArray(raw.modules)) return null;
    return clampDesign(raw);
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

export function saveLocal(design) {
  try {
    const ls = storage();
    if (!ls) return false;
    ls.setItem(KEY, encodeDesign(design));
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
    return s ? decodeDesign(s) : null;
  } catch {
    return null;
  }
}
