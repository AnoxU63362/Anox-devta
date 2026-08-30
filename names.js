// names.js
import { transliterateName } from './transliterate.js';

export const EMOJI_REGEX = /.../u; // tumhara existing regex

export function smartName(rawName, username, pk) {
    // ... tumhara existing logic (Hindi check bhi yahin rahega)
}

export function cleanUsername(u) {
    return u.replace(/^@+/, '').replace(/\s/g, '').trim();
}
