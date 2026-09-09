// ============ NAMES — SMART NAME + MAPPINGS ============
import * as fs from 'fs';
import { transliterateName } from './transliterate.js';

const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{FE00}-\u{FE0F}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2100}-\u{214F}\u{27C0}-\u{27EF}\u{2980}-\u{29FF}\u{2B00}-\u{2BFF}\u{200D}\u{200E}\u{200F}\u{2060}\u{2061}-\u{2064}\u{1F0A0}-\u{1F0FF}\u{1F1FF}]+/gu;

const MAPPINGS = new Map();

export function loadMappings(filepath = 'mappings.txt') {
    try {
        const data = fs.readFileSync(filepath, 'utf-8');
        for (const line of data.split('\n')) {
            const t = line.trim();
            if (!t || !t.includes('|')) continue;
            const [u, n] = t.split('|', 2);
            if (u && n) MAPPINGS.set(u.toLowerCase(), n);
        }
        if (MAPPINGS.size) console.log(`📋 ${MAPPINGS.size} custom mappings loaded from ${filepath}`);
    } catch { /* mappings.txt optional hai */ }
}

export function getMappedName(username) {
    return MAPPINGS.get(String(username).toLowerCase()) || null;
}

export function smartName(rawName, username, pk) {
    const fallback = String(pk || '0');

    if (rawName && rawName.trim()) {
        let cleaned = rawName
            .replace(EMOJI_REGEX, '')
            .replace(/[\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
            .trim();

        cleaned = cleaned.replace(/\./g, ' ').replace(/_/g, ' ');

        if (/[\u0900-\u097F]/.test(cleaned)) {
            cleaned = transliterateName(cleaned);
            cleaned = cleaned.replace(/\s+/g, ' ').trim();
        }

        cleaned = cleaned.replace(/[@xX\s]+$/, '').trim();
        cleaned = cleaned.replace(/\d+$/, '').trim();
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        if (/[A-Za-z\u0900-\u097F\u4E00-\u9FFF]/.test(cleaned)) {
            return cleaned.split(/\s+/).map(w =>
                w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
            ).join(' ');
        }
    }

    // Username se naam nikalo
    const u = String(username || '');
    const segments = u.replace(/[._]/g, ' ').split(/\s+/).filter(Boolean);
    const alphaSegments = segments.filter(s => /[a-zA-Z]/.test(s));

    if (alphaSegments.length > 0) {
        const good = alphaSegments.filter(s => {
            const alpha = s.replace(/[^a-zA-Z]/g, '');
            return alpha.length >= 2 && !/^x{1,3}$/i.test(alpha);
        });
        if (good.length > 0) {
            return good.map(s => {
                const alpha = s.replace(/[^a-zA-Z]/g, '');
                return alpha.charAt(0).toUpperCase() + alpha.slice(1).toLowerCase();
            }).join(' ');
        }
        const longest = alphaSegments.reduce((a, b) =>
            (b.replace(/[^a-zA-Z]/g, '').length > a.replace(/[^a-zA-Z]/g, '').length ? b : a));
        const alpha = longest.replace(/[^a-zA-Z]/g, '');
        if (alpha.length >= 2) {
            return alpha.charAt(0).toUpperCase() + alpha.slice(1).toLowerCase();
        }
    }

    const cleaned = u.replace(/[_0-9x]+$/gi, '').replace(/^[_0-9x]+/gi, '');
    if (cleaned.length >= 2 && /[a-zA-Z]/.test(cleaned)) {
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    }
    return fallback;
}

export function cleanUsername(u) {
    return String(u || '').replace(/^@+/, '').replace(/\s/g, '').trim();
}
