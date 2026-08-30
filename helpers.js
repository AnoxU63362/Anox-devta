// ============ HELPERS ============
import * as fs from 'fs';
import * as readline from 'readline';

export function parseCookie(raw) {
    const pairs = {};
    raw.split(';').forEach(part => {
        part = part.trim();
        const eqIdx = part.indexOf('=');
        if (eqIdx > 0) {
            pairs[part.slice(0, eqIdx).trim()] = decodeURIComponent(part.slice(eqIdx + 1).trim());
        }
    });
    return pairs;
}

export function countLines(filepath) {
    try {
        const data = fs.readFileSync(filepath, 'utf-8');
        return data.split('\n').filter(l => l.trim()).length;
    } catch { return 0; }
}

export function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

export function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}
