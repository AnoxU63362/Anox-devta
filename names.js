// ============ NAME SYSTEM ============
import { transliterateName } from './transliterate.js';
import * as fs from 'fs';
import { MAPPINGS_FILE } from './config.js';

export const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{FE00}-\u{FE0F}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2100}-\u{214F}\u{27C0}-\u{27EF}\u{2980}-\u{29FF}\u{2B00}-\u{2BFF}\u{200D}\u{200E}\u{200F}\u{2060}\u{2061}-\u{2064}\u{1F0A0}-\u{1F0FF}]+/gu;

// ---- CUSTOM MAPPING FILE (mappings.txt) ----
// Format: keyword|Naam
// Username me keyword dikhe (contain ho) to YAHI naam lagega
const NAME_MAP = new Map();

export function loadMappings(filepath = MAPPINGS_FILE) {
    try {
        const data = fs.readFileSync(filepath, 'utf-8');
        for (const line of data.split('\n')) {
            const l = line.trim();
            if (!l || l.startsWith('#')) continue;
            const parts = l.split('|');
            if (parts.length === 2 && parts[0].trim()) {
                NAME_MAP.set(parts[0].trim().toLowerCase(), parts[1].trim());
            }
        }
        if (NAME_MAP.size > 0) {
            console.log(`✅ ${NAME_MAP.size} keyword-name mappings loaded (${filepath})`);
        }
    } catch {
        console.log(`ℹ️  ${filepath} nahi mili — sab automatic smartName se banega`);
    }
}

export function getMappedName(username) {
    if (!username || NAME_MAP.size === 0) return null;
    const u = String(username).toLowerCase();

    // Sabse LAMBE keyword pehle check (rahulsharma24 ko "rahul sharma" mile,
    // sirf "rahul" se pehle) — isliye lambi keys priority
    let bestMatch = null;
    let bestLen = 0;
    for (const [keyword, name] of NAME_MAP) {
        if (u.includes(keyword) && keyword.length > bestLen) {
            bestMatch = name;
            bestLen = keyword.length;
        }
    }
    return bestMatch; // match nahi mila to null
}

// ---- SMART NAME ----
// Priority: mappings.txt > full_name > username guess > pk (ID)
export function smartName(rawName, username, pk) {
    const fallback = String(pk || '0');

    // Step 1: Real full name
    if (rawName && rawName.trim()) {
        let cleaned = rawName
            .replace(EMOJI_REGEX, '')
            .replace(/[\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
            .trim();

        cleaned = cleaned.replace(/\./g, ' ');   // dots -> space
        cleaned = cleaned.replace(/_/g, ' ');    // underscores -> space

        if (/[\u0900-\u097F]/.test(cleaned)) {
            cleaned = transliterateName(cleaned);
        }

        cleaned = cleaned.replace(/[@xX\s]+$/, '').trim();
        cleaned = cleaned.replace(/\d+$/, '').trim();
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        if (/[A-Za-z]/.test(cleaned) && cleaned.replace(/[^A-Za-z]/g, '').length >= 2) {
            return cleaned.split(/\s+/).map(w =>
                w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
            ).join(' ');
        }
    }

    // Step 2: Username se naam banao
    const u = String(username || '');
    const userNameCleaned = u.replace(/[._-]/g, ' ');
    const segments = userNameCleaned.split(/\s+/).filter(s => s.length > 0);
    const alphaSegments = segments.filter(s => /[a-zA-Z]/.test(s));

    if (alphaSegments.length > 0) {
        const goodSegments = alphaSegments.filter(s => {
            const alphaChars = s.replace(/[^a-zA-Z]/g, '');
            return alphaChars.length >= 2 && !/^x{1,3}$/i.test(alphaChars);
        });

        if (goodSegments.length > 0) {
            return goodSegments.map(s => {
                const alpha = s.replace(/[^a-zA-Z]/g, '');
                return alpha.charAt(0).toUpperCase() + alpha.slice(1).toLowerCase();
            }).join(' ');
        }

        const longest = alphaSegments.reduce((a, b) => {
            const aLen = a.replace(/[^a-zA-Z]/g, '').length;
            const bLen = b.replace(/[^a-zA-Z]/g, '').length;
            return bLen > aLen ? b : a;
        });
        const alpha = longest.replace(/[^a-zA-Z]/g, '');
        if (alpha.length >= 2) {
            return alpha.charAt(0).toUpperCase() + alpha.slice(1).toLowerCase();
        }
    }

    const cleaned = u.replace(/[_0123456789x]+$/gi, '').replace(/^[_0123456789x]+/gi, '');
    if (cleaned.length >= 2 && /[a-zA-Z]/.test(cleaned)) {
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    }

    // Step 3: Kuch nahi mila — pk (user ID)
    return fallback;
}

export function cleanUsername(u) {
    return u.replace(/^@+/, '').replace(/\s/g, '').trim().toLowerCase();
}
