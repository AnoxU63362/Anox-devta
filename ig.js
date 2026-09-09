import fetch from 'node-fetch';
import * as fs from 'fs';
import * as readline from 'readline';

// ============================================================
// CONSTANTS
// ============================================================

const WORKERS_PER_SESSION = 2;
const PER_TARGET = 800;
const PER_PAGE = 75;
const BATCH_FLUSH = 1000;
const MAX_RUNTIME_MIN = 800;

// ============================================================
// DEVANAGARI TRANSLITERATION
// ============================================================

const DEVANAGARI_MAP = new Map([
    ['\u0905','A'],['\u0906','Aa'],['\u0907','I'],['\u0908','Ee'],
    ['\u0909','U'],['\u090A','Oo'],['\u090B','Ri'],['\u0960','Rii'],
    ['\u090C','Li'],['\u0961','Lii'],['\u090F','E'],['\u0910','Ai'],
    ['\u0913','O'],['\u0914','Au'],
    ['\u0915','K'],['\u0916','Kh'],['\u0917','G'],['\u0918','Gh'],['\u0919','Ng'],
    ['\u091A','Ch'],['\u091B','Chh'],['\u091C','J'],['\u091D','Jh'],['\u091E','Ny'],
    ['\u091F','T'],['\u0920','Th'],['\u0921','D'],['\u0922','Dh'],['\u0923','N'],
    ['\u0924','T'],['\u0925','Th'],['\u0926','D'],['\u0927','Dh'],['\u0928','N'],
    ['\u092A','P'],['\u092B','F'],['\u092C','B'],['\u092D','Bh'],['\u092E','M'],
    ['\u092F','Y'],['\u0930','R'],['\u0932','L'],['\u0935','V'],
    ['\u0936','Sh'],['\u0937','Sh'],['\u0938','S'],['\u0939','H'],
    ['\u0915\u094D\u0937','Ksh'],['\u0924\u094D\u0930','Tr'],['\u091C\u094D\u091E','Gya'],['\u0936\u094D\u0930','Shr'],
    ['\u0926\u094D\u092F','Dy'],['\u0926\u094D\u0935','Dv'],['\u0926\u094D\u0930','Dr'],['\u092A\u094D\u0930','Pr'],
    ['\u092C\u094D\u0930','Br'],['\u0915\u094D\u0930','Kr'],['\u0917\u094D\u0930','Gr'],['\u092A\u094D\u0932','Pl'],
    ['\u0938\u094D\u0935','Sv'],['\u0938\u094D\u092F','Sy'],['\u092A\u094D\u0924','Pt'],['\u0924\u094D\u0924','Tt'],
    ['\u0924\u094D\u092F','Ty'],['\u091E\u094D\u092F','Ny'],['\u0928\u094D\u0927','Ndh'],['\u0928\u094D\u0926','Nd'],
    ['\u092E\u094D\u092C','Mb'],['\u092E\u094D\u092A','Mp'],['\u0928\u094D\u0915','Nk'],['\u0928\u094D\u0917','Ng'],
    ['\u0930\u094D\u0915','Rk'],['\u0930\u094D\u092A','Rp'],['\u0930\u094D\u092E','Rm'],['\u0930\u094D\u092F','Ry'],
    ['\u0930\u094D\u0932','Rl'],['\u0930\u094D\u0935','Rv'],['\u0930\u094D\u0936\u094D','Rsh'],
    ['\u0930\u094D\u0939','Rh'],['\u0933\u094D\u0933','Ll'],['\u0915\u094D\u0915','Kk'],['\u0917\u094D\u0917','Gg'],
    ['\u0921\u094D\u0921','Tt'],['\u0926\u094D\u0926','Dd'],['\u0928\u094D\u0928','Nn'],['\u092A\u094D\u092A','Pp'],
    ['\u092C\u094D\u092C','Bb'],['\u092E\u094D\u092E','Mm'],
    ['\u0921\u093C','D'],['\u0922\u093C','Dh'],['\u092B\u093C','F'],
    ['\u0915\u093C','Q'],['\u0916\u093C','Kh'],['\u0917\u093C','G'],['\u091C\u093C','Z'],
    ['\u092F\u093C','Y'],['\u095A','Zh'],
    ['\u093E','a'],['\u093F','i'],['\u0940','i'],['\u0941','u'],['\u0942','u'],
    ['\u0943','ri'],['\u0947','e'],['\u0948','ai'],['\u094B','o'],['\u094C','au'],
    ['\u0902','n'],['\u0903','h'],['\u0901','n'],
    ['\u0966','0'],['\u0967','1'],['\u0968','2'],['\u0969','3'],['\u096A','4'],
    ['\u096B','5'],['\u096C','6'],['\u096D','7'],['\u096E','8'],['\u096F','9'],
]);

const HALANT = '\u094D';
const MATRAS = '\u093E\u093F\u0940\u0941\u0942\u0943\u0947\u0948\u094B\u094C';

function devanagariToLatin(text) {
    if (!/[\u0900-\u097F]/.test(text)) return text;
    let result = '';
    let i = 0;
    while (i < text.length) {
        const c1 = text[i];
        const c2 = i + 1 < text.length ? text[i + 1] : '';
        const c3 = i + 2 < text.length ? text[i + 2] : '';

        const nuktaPair = c1 + c2;
        if (DEVANAGARI_MAP.has(nuktaPair) && nuktaPair.length === 2 &&
            /[\u0900-\u097F]/.test(c1) && c2 === '\u093C') {
            result += DEVANAGARI_MAP.get(nuktaPair);
            i += 2;
            continue;
        }
        if (c2 === HALANT && c3 && /[\u0900-\u097F]/.test(c3)) {
            const triple = c1 + c2 + c3;
            if (DEVANAGARI_MAP.has(triple)) {
                result += DEVANAGARI_MAP.get(triple);
                i += 3;
                continue;
            }
            const mapped = DEVANAGARI_MAP.get(c1);
            result += (mapped || c1).toLowerCase();
            i += 1;
            continue;
        }
        if (DEVANAGARI_MAP.has(c1)) {
            const mapped = DEVANAGARI_MAP.get(c1);
            if (MATRAS.includes(c1) || c1 === '\u0902' || c1 === '\u0903' || c1 === '\u0901') {
                result += mapped;
            } else if (i > 0 && text[i - 1] === HALANT) {
                result += mapped.toLowerCase();
            } else {
                result += mapped;
            }
            i++;
            continue;
        }
        if (c1 === HALANT) { i++; continue; }
        result += c1;
        i++;
    }
    return result;
}

function transliterateName(text) {
    if (!text || !/[\u0900-\u097F]/.test(text)) return text;
    let latin = devanagariToLatin(text);
    latin = latin.replace(/([AEIOU])\1+/g, '$1');
    latin = latin.replace(/([aeiou])\1+/g, '$1');
    latin = latin.replace(/Kshh/g, 'Ksh');
    latin = latin.replace(/Shh/g, 'Sh');
    return latin;
}

// ============================================================
// HELPERS
// ============================================================

const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{FE00}-\u{FE0F}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2100}-\u{214F}\u{27C0}-\u{27EF}\u{2980}-\u{29FF}\u{2B00}-\u{2BFF}\u{200D}\u{200E}\u{200F}\u{2060}\u{2061}-\u{2064}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}]+/gu;

function smartName(rawName, username, pk) {
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
    const u = String(username || '');
    const userNameCleaned = u.replace(/[._]/g, ' ');
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
    return fallback;
}

function cleanUsername(u) {
    return String(u || '').replace(/^@+/, '').replace(/\s/g, '').trim();
}

function parseCookie(raw) {
    const pairs = {};
    raw.split(';').forEach(part => {
        part = part.trim();
        const eqIdx = part.indexOf('=');
        if (eqIdx > 0) {
            try {
                pairs[part.slice(0, eqIdx).trim()] = decodeURIComponent(part.slice(eqIdx + 1).trim());
            } catch {
                pairs[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
            }
        }
    });
    return pairs;
}

function countLines(filepath) {
    try {
        return fs.readFileSync(filepath, 'utf-8').split('\n').filter(l => l.trim()).length;
    } catch { return 0; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

// ============================================================
// SESSION — M4 (APP-MOBILE) headers
// ============================================================

const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36';

class InstagramSession {
    constructor(cookieDict, sessionId = 0) {
        this.id = sessionId;
        this.cookies = cookieDict;
        this.totalRequests = 0;
        this.cookieStr = Object.entries(cookieDict)
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join('; ');

        // Har session ka alag mobile UA — Instagram ko alag device lage
        this.ua = [
            MOBILE_UA,
            'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.163 Mobile Safari/537.36',
            'Mozilla/5.0 (Linux; Android 12; Redmi Note 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.65 Mobile Safari/537.36',
        ][sessionId % 3];

        this.baseHeaders = {
            'User-Agent': this.ua,
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://www.instagram.com',
            'Referer': 'https://www.instagram.com/',
            'X-IG-App-ID': '936619743392459',
            'X-Requested-With': 'XMLHttpRequest',
            'X-Instagram-AJAX': '1',
            'Connection': 'keep-alive',
            'Cookie': this.cookieStr,
        };
        if (cookieDict['csrftoken']) {
            this.baseHeaders['X-CSRFToken'] = cookieDict['csrftoken'];
        }
    }

    async request(method, url, options = {}) {
        const retries = options.retries || 3;
        const params = options.params || {};
        const headers = { ...this.baseHeaders, ...(options.headers || {}) };

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                let fullUrl = url;
                if (Object.keys(params).length) {
                    const qs = new URLSearchParams();
                    for (const [k, v] of Object.entries(params)) qs.append(k, v);
                    fullUrl += (url.includes('?') ? '&' : '?') + qs.toString();
                }

                const response = await fetch(fullUrl, { method, headers });
                this.totalRequests++;

                if (response.status === 429) {
                    const wait = 5 + Math.random() * 10 + attempt * 5;
                    console.log(`      [S${this.id}] ⚠ 429! ${Math.round(wait)}s wait...`);
                    await sleep(wait * 1000);
                    continue;
                }
                return response;
            } catch (err) {
                await sleep(1000 * (attempt + 1));
            }
        }
        return null;
    }
}

// ============================================================
// VERIFY LOGIN — shared_data
// ============================================================

async function verifyLogin(session) {
    try {
        const r = await session.request('GET', 'https://www.instagram.com/api/v1/web/data/shared_data/', { retries: 2 });
        if (!r || r.status !== 200) return [false, `HTTP ${r ? r.status : 'N/A'}`];
        const data = await r.json();
        const viewer = data?.config?.viewer;
        if (viewer?.username) return [true, viewer.username];
        return [false, 'Session invalid (viewer null)'];
    } catch (e) {
        return [false, e.message];
    }
}

// ============================================================
// USER ID RESOLUTION — 5 PATHS (ID fail nahi hoga)
// ============================================================

async function resolveUserId(session, username) {
    // PATH A — i.instagram.com web_profile_info (mobile gateway)
    try {
        const r = await session.request('GET', 'https://i.instagram.com/api/v1/users/web_profile_info/', {
            params: { username },
            headers: { 'User-Agent': MOBILE_UA, 'Host': 'i.instagram.com' }
        });
        if (r && r.status === 200) {
            const data = await r.json();
            const uid = data?.data?.user?.id;
            if (uid) return uid;
        }
    } catch {}

    // PATH B — www web_profile_info
    try {
        const r = await session.request('GET', 'https://www.instagram.com/api/v1/users/web_profile_info/', {
            params: { username }
        });
        if (r && r.status === 200) {
            const data = await r.json();
            const uid = data?.data?.user?.id;
            if (uid) return uid;
        }
    } catch {}

    // PATH C — usernameinfo (old mobile endpoint)
    try {
        const r = await session.request('GET', `https://www.instagram.com/api/v1/users/${username}/usernameinfo/`);
        if (r && r.status === 200) {
            const data = await r.json();
            const uid = data?.user?.pk;
            if (uid) return uid;
        }
    } catch {}

    // PATH D — i.instagram usernameinfo
    try {
        const r = await session.request('GET', `https://i.instagram.com/api/v1/users/${username}/usernameinfo/`, {
            headers: { 'User-Agent': MOBILE_UA, 'Host': 'i.instagram.com' }
        });
        if (r && r.status === 200) {
            const data = await r.json();
            const uid = data?.user?.pk;
            if (uid) return uid;
        }
    } catch {}

    // PATH E — web_search_topsearch
    try {
        const r = await session.request('GET', 'https://www.instagram.com/web/search/topsearch/', {
            params: { query: username, context: 'blended' }
        });
        if (r && r.status === 200) {
            const data = await r.json();
            const users = data?.users || [];
            for (const item of users) {
                const u = item?.user || {};
                if (u.username?.toLowerCase() === username.toLowerCase() && u.pk) return u.pk;
            }
            if (users.length && users[0]?.user?.pk) return users[0].user.pk;
        }
    } catch {}

    return null;
}

// ============================================================
// M4 FETCH — i.instagram.com REST followers (fallback: www)
// ============================================================

async function mobileFollowers(session, uid, maxResults) {
    const users = [];
    let maxId = null;

    // PRIMARY — i.instagram.com (mobile gateway)
    while (users.length < maxResults) {
        const params = { count: Math.min(PER_PAGE, maxResults) };
        if (maxId) params.max_id = maxId;

        const r = await session.request('GET', `https://i.instagram.com/api/v1/friendships/${uid}/followers/`, {
            params,
            headers: { 'User-Agent': MOBILE_UA, 'Host': 'i.instagram.com' }
        });
        if (!r || r.status !== 200) break;

        let data;
        try { data = await r.json(); } catch { break; }
        if (data.special_empty_state || !data.users || !data.users.length) break;

        for (const u of data.users) {
            users.push([u.username || '', u.full_name || '', u.pk || u.id || '0']);
            if (users.length >= maxResults) break;
        }
        maxId = data.next_max_id;
        if (!maxId) break;
        await sleep(150 + Math.random() * 200);
    }

    if (users.length > 0) return users;

    // FALLBACK — www.instagram.com (wahi REST endpoint, dusra server)
    console.log(`   ⚠ Mobile blocked → www fallback`);
    maxId = null;
    while (users.length < maxResults) {
        const params = { count: Math.min(PER_PAGE, maxResults) };
        if (maxId) params.max_id = maxId;

        const r = await session.request('GET', `https://www.instagram.com/api/v1/friendships/${uid}/followers/`, { params });
        if (!r || r.status !== 200) break;

        let data;
        try { data = await r.json(); } catch { break; }
        if (data.special_empty_state || !data.users || !data.users.length) break;

        for (const u of data.users) {
            users.push([u.username || '', u.full_name || '', u.pk || u.id || '0']);
            if (users.length >= maxResults) break;
        }
        maxId = data.next_max_id;
        if (!maxId) break;
        await sleep(150 + Math.random() * 200);
    }
    return users;
}

// ============================================================
// BUFFERED WRITER
// ============================================================

class BufferedWriter {
    constructor(filepath) {
        this.filepath = filepath;
        this.buffer = [];
        this.totalWritten = 0;
        fs.appendFileSync(filepath, '', 'utf-8');
    }
    write(line) {
        this.buffer.push(line);
        this.totalWritten++;
        if (this.buffer.length >= BATCH_FLUSH) this.flush();
    }
    flush() {
        if (this.buffer.length > 0) {
            fs.appendFileSync(this.filepath, this.buffer.join('\n') + '\n', 'utf-8');
            this.buffer = [];
        }
    }
}

// ============================================================
// SHARED STATE — duplicate-safe chain
// ============================================================

class SharedState {
    constructor() {
        this.queue = [];
        this.processed = new Set();
        this.visited = new Set();
        this.saved = new Set();
        this.lines = 0;
        this.usersDone = 0;
        this.startTime = Date.now();
    }
    nextUser() {
        for (let i = 0; i < this.queue.length; i++) {
            const u = this.queue[i];
            if (!this.processed.has(u) && !this.visited.has(u)) {
                this.queue.splice(i, 1);
                return u;
            }
        }
        return null;
    }
    markDone(user) { this.processed.add(user); }
    markVisited(user) { this.visited.add(user); }
    enqueue(user) {
        const u = cleanUsername(user);
        if (u && !this.processed.has(u) && !this.visited.has(u) && !this.saved.has(u)) {
            this.queue.push(u);
        }
    }
    getElapsedSec() { return (Date.now() - this.startTime) / 1000; }
    getRate() {
        const min = this.getElapsedSec() / 60;
        return min > 0 ? Math.round(this.lines / min) : 0;
    }
}

// ============================================================
// WORKER — har worker queue se ALAG username uthata hai
// ============================================================

async function worker(session, state, writer, workerId) {
    const sid = session.id;

    while (state.getElapsedSec() < MAX_RUNTIME_MIN * 60) {
        const username = state.nextUser();
        if (!username) { await sleep(100); continue; }
        if (state.processed.has(username) || state.visited.has(username)) continue;
        state.markVisited(username);

        console.log(`[S${sid}-W${workerId}] ▶ @${username} | 📄 ${state.lines} lines | ⚡ ${state.getRate()}/min | 📋 Queue: ${state.queue.length}`);

        // Step 1 — User ID nikalo (5 paths)
        const uid = await resolveUserId(session, username);
        if (!uid) {
            console.log(`   ❌ ID fail (5 paths try kiye) — skip`);
            state.markDone(username);
            continue;
        }
        console.log(`   ✅ ID: ${uid}`);

        // Step 2 — M4 followers nikalo (mobile → www fallback)
        const followers = await mobileFollowers(session, uid, PER_TARGET);

        // Step 3 — Save + chain queue (duplicates SKIP)
        let added = 0;
        for (const [uname, fnameRaw, pk] of followers) {
            if (!uname || !uname.trim()) continue;
            if (state.saved.has(uname)) continue;
            state.saved.add(uname);

            const fname = smartName(fnameRaw, uname, pk);
            writer.write(`${uname}|${fname}`);
            state.lines++;

            // Chain — har naya username agla target
            if (!state.processed.has(uname) && !state.visited.has(uname)) {
                state.queue.push(uname);
                added++;
            }
        }

        state.usersDone++;
        state.markDone(username);
        console.log(`   ✅ ${followers.length} followers | ➕ ${added} naye | 📋 Queue: ${state.queue.length}`);

        await sleep(500 + Math.random() * 500);
    }
}

// ============================================================
// CHAIN ENGINE — purani file load (resume) + multi-session
// ============================================================

async function runChain(sessions, target, filepath) {
    const state = new SharedState();
    state.queue.push(cleanUsername(target));
    state.startTime = Date.now();

    // Purani file load — duplicates SKIP (resume support)
    try {
        const old = fs.readFileSync(filepath, 'utf-8');
        for (const line of old.split('\n')) {
            const u = line.split('|')[0].trim();
            if (u) state.saved.add(u);
        }
        console.log(`🔒 ${state.saved.size} purane usernames load kiye — duplicates SKIP honge`);
    } catch { /* nayi file, koi dikkat nahi */ }

    const writer = new BufferedWriter(filepath);

    console.log(`\n${'='.repeat(58)}`);
    console.log(`🚀 CHAIN SCRAPER — M4 APP-MOBILE (i.instagram.com)`);
    console.log(`⚡ ${sessions.length} sessions x ${WORKERS_PER_SESSION} workers = ${sessions.length * WORKERS_PER_SESSION} parallel`);
    console.log(`📄 ${filepath} | 🎯 ${PER_TARGET}/user | ${MAX_RUNTIME_MIN}min max`);
    console.log(`${'='.repeat(58)}\n`);

    // Sab workers ek saath launch — har session apne workers se chalta hai
    const allWorkers = [];
    for (const s of sessions) {
        for (let wi = 0; wi < WORKERS_PER_SESSION; wi++) {
            allWorkers.push(worker(s, state, writer, wi + 1));
        }
    }

    // Monitor — har 5 sec status
    const monitor = setInterval(() => {
        const percpu = state.usersDone > 0 ? (state.lines / state.usersDone).toFixed(0) : 0;
        console.log(`\n📊 [${state.getElapsedSec().toFixed(0)}s] ${state.lines} lines | ${state.usersDone} users | ${state.getRate()}/min | ${state.queue.length} queued | ~${percpu}/user\n`);
    }, 5000);

    await Promise.all(allWorkers);
    clearInterval(monitor);
    writer.flush();

    const linesFinal = countLines(filepath);
    console.log(`\n${'='.repeat(58)}`);
    console.log(`🎉 DONE! ${linesFinal} lines | ${state.usersDone} users | ${state.getElapsedSec().toFixed(0)}s`);
    console.log(`📁 ${filepath}`);
    console.log(`${'='.repeat(58)}`);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
    console.log(`
════════════════════════════════════════════════════════
   INSTAGRAM CHAIN SCRAPER — M4 APP-MOBILE
   i.instagram.com · Followers-only · Chain · Resume
════════════════════════════════════════════════════════`);

    // 1) Cookies
    console.log('\n🍪 Cookie string(s) daalo — ek line me ek (multi-account = multiple lines):');
    const rawInput = await ask('> ');
    const rawCookies = rawInput.split(/[\n,]/).map(s => s.trim()).filter(s => s.length > 50);

    const cookieDicts = [];
    for (const raw of rawCookies) {
        const cd = parseCookie(raw);
        if (cd.sessionid && cd.csrftoken) {
            cookieDicts.push(cd);
        } else {
            console.log('⚠️  Invalid cookie skip (sessionid/csrftoken missing)');
        }
    }
    if (cookieDicts.length === 0) {
        console.log('❌ Koi valid cookie nahi. sessionid + csrftoken dono chahiye.');
        process.exit(1);
    }
    console.log(`✅ ${cookieDicts.length} cookie(s) loaded`);

    const sessions = cookieDicts.map((cd, i) => new InstagramSession(cd, i));

    // 2) Verify login
    console.log('\n🔍 Verifying sessions…');
    const valid = [];
    for (const s of sessions) {
        const [ok, username] = await verifyLogin(s);
        if (ok) {
            console.log(`   S${s.id}: ✅ @${username}`);
            valid.push(s);
        } else {
            console.log(`   S${s.id}: ❌ ${username}`);
        }
    }
    if (valid.length === 0) {
        console.log('❌ Koi session valid nahi. FRESH cookie lo (logout → login → new cookie).');
        process.exit(1);
    }
    console.log(`✅ ${valid.length}/${sessions.length} sessions verified`);

    // 3) Target + file
    const target = cleanUsername(await ask('\n🎯 Target username (@ bhi chalega): '));
    if (!target) { console.log('❌ Target khali hai'); process.exit(1); }
    const fp = (await ask('📁 Output file [output.txt]: ')) || 'output.txt';

    // 4) CHAIN START 🚀
    await runChain(valid, target, fp);
}

main().catch(err => {
    console.error('\n💥 Fatal:', err.message);
    process.exit(1);
});
