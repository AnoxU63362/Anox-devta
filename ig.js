import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as fs from 'fs';
import * as readline from 'readline';

//                              
// CONSTANTS
//                              

const WORKERS_PER_SESSION = 2;   // Workers per cookie session
const PER_TARGET = 800;           // Sirf followers — 800 per user (max)
const PER_PAGE = 75;              // Items per API call (balance speed vs 429)
const BATCH_FLUSH = 1000;         // Disk write every N lines
const MAX_RUNTIME_MIN = 800;      // Safety cutoff
const STICKY_PROXY = false;       // true = same IP for a session, false = rotate per request

// Legacy GraphQL hashes (hidden lists bypass)
const GQL_HASHES = {
    followers: '37479f2b8209594dde7facb0d904896a',
    following: 'd04edd2229b57d9a3754f00d82f6f342',
};

//                              
//  NEW: HINDI (DEVANAGARI)  ENGLISH TRANSLITERATION SYSTEM
//                              

// Comprehensive Devanagari to Latin mapping for Hindi names
const DEVANAGARI_MAP = new Map([
    // Independent vowels
    ['', 'A'], ['', 'Aa'], ['', 'I'], ['', 'Ee'],
    ['', 'U'], ['', 'Oo'], ['', 'Ri'], ['', 'Ri'],
    ['', 'Li'], ['', 'E'], ['', 'Ai'], ['', 'O'], ['', 'Au'],
    
    // Consonants (ka varga)
    ['', 'K'], ['', 'Kh'], ['', 'G'], ['', 'Gh'], ['', 'Ng'],
    ['', 'Ch'], ['', 'Chh'], ['', 'J'], ['', 'Jh'], ['', 'Ny'],
    ['', 'T'], ['', 'Th'], ['', 'D'], ['', 'Dh'], ['', 'N'],
    ['', 'T'], ['', 'Th'], ['', 'D'], ['', 'Dh'], ['', 'N'],
    ['', 'P'], ['', 'F'], ['', 'B'], ['', 'Bh'], ['', 'M'],
    ['', 'Y'], ['', 'R'], ['', 'L'], ['', 'V'],
    ['', 'Sh'], ['', 'Sh'], ['', 'S'], ['', 'H'],
    
    // Special conjuncts (must be checked before individual chars — longest match)
    ['', 'Ksh'], ['', 'Tr'], ['', 'Gya'], ['', 'Shr'],
    ['', 'Dy'], ['', 'Dv'], ['', 'Dr'], ['', 'Pr'],
    ['', 'Br'], ['', 'Kr'], ['', 'Gr'], ['', 'Pl'],
    ['', 'Sv'], ['', 'Sy'], ['', 'Pt'], ['', 'Tt'],
    ['', 'Ty'], ['', 'Ny'], ['', 'Ndh'], ['', 'Nd'],
    ['', 'Mb'], ['', 'Mp'], ['', 'Nk'], ['', 'Ng'],
    ['', 'Rk'], ['', 'Rp'], ['', 'Rm'], ['', 'Ry'],
    ['', 'Rl'], ['', 'Rv'], ['', 'Rsh'], ['', 'Rsh'],
    ['', 'Rh'], ['', 'Ll'], ['', 'Kk'], ['', 'Gg'],
    ['', 'Tt'], ['', 'Dd'], ['', 'Nn'], ['', 'Pp'],
    ['', 'Bb'], ['', 'Mm'],

    // Nuqta (dot-modified) consonants
    ['', 'D'], ['', 'Dh'], ['', 'F'],
    ['', 'Q'], ['', 'Kh'], ['', 'G'], ['', 'Z'],
    ['', 'Y'], ['', 'Zh'],
    
    // Matras (vowel signs) — used after consonants
    ['', 'a'], ['', 'i'], ['', 'i'], ['', 'u'], ['', 'u'],
    ['', 'ri'], ['', 'e'], ['', 'ai'], ['', 'o'], ['', 'au'],
    
    // Anusvara, Visarga, Chandrabindu
    ['', 'n'], ['', 'h'], ['', 'n'],

    // Digits
    ['', '0'], ['', '1'], ['', '2'], ['', '3'], ['', '4'],
    ['', '5'], ['', '6'], ['', '7'], ['', '8'], ['', '9'],
]);

// Characters that can appear after a consonant with halant (virama)
const HALANT = '\u094D';

function devanagariToLatin(text) {
    // Fast return if no Devanagari characters
    if (!/[\u0900-\u097F]/.test(text)) return text;

    let result = '';
    let i = 0;

    while (i < text.length) {
        const c1 = text[i];
        const c2 = i + 1 < text.length ? text[i + 1] : '';
        const c3 = i + 2 < text.length ? text[i + 2] : '';
        const c4 = i + 3 < text.length ? text[i + 3] : '';
        const c5 = i + 4 < text.length ? text[i + 4] : '';

        // 1. Try 3-char conjunct (rare but possible): e.g., '' = ''+''+''
        const triple = c1 + c2 + c3;
        // 2. Try 2-char conjunct from the map
        const pair = c1 + c2;
        // 3. Try 2-char nukta conjunct (e.g., '')
        const nuktaPair = c1 + c2;

        // Check longest first: 3-char conjunct
        if (c2 === HALANT && c3 && c4 && DEVANAGARI_MAP.has(c1 + c3 + c4)) {
            // e.g.,  +  +  = rk ( will be mapped when we reach it)
            result += (DEVANAGARI_MAP.get(c1) || c1).toLowerCase();
            i += 2; // skip consonant + halant
        }
        // 2-char known conjunct (like , , , , etc.)
        else if (DEVANAGARI_MAP.has(pair) && pair.length === 2 && /[\u0900-\u097F]/.test(c1) && /[\u0900-\u097F]/.test(c2)) {
            result += DEVANAGARI_MAP.get(pair);
            i += 2;
        }
        // Single Devanagari char
        else if (DEVANAGARI_MAP.has(c1)) {
            const mapped = DEVANAGARI_MAP.get(c1);
            // Matras (vowel signs) and vowel modifiers are lowercase
            if (''.includes(c1)) {
                result += mapped;
            } else {
                // For consonants/vowels at start of syllable, keep as mapped
                // But if preceded by a halant-joined consonant, make lowercase
                if (i > 0 && text[i - 1] === HALANT) {
                    result += mapped.toLowerCase();
                } else {
                    result += mapped;
                }
            }
            i++;
        }
        // Non-Devanagari: pass through
        else {
            result += c1;
            i++;
        }
    }

    return result;
}

function transliterateName(text) {
    if (!text || !/[\u0900-\u097F]/.test(text)) return text;
    let latin = devanagariToLatin(text);
    
    // Clean up transliteration artifacts:
    // 1. Collapse repeated characters (aa  a, ii  i, etc.)
    latin = latin.replace(/([AEIOU])\1+/g, '$1');
    latin = latin.replace(/([aeiou])\1+/g, '$1');
    
    // 2. Handle common Hindi name patterns
    // "Shh"  "Sh", "Chh"  "Chh" (keep), "Kshh"  "Ksh"
    latin = latin.replace(/Kshh/g, 'Ksh');
    latin = latin.replace(/Shh/g, 'Sh');
    
    // 3. Final lowercase for consistent formatting
    return latin;
}

//                              
// HELPERS
//                              

const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{FE00}-\u{FE0F}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2100}-\u{214F}\u{27C0}-\u{27EF}\u{2980}-\u{29FF}\u{2B00}-\u{2BFF}\u{200D}\u{200E}\u{200F}\u{2060}\u{2061}-\u{2064}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}]+/gu;

//  MODIFIED: smartName with Devanagari transliteration + dot/underscore handling
function smartName(rawName, username, pk) {
    const fallback = String(pk || '0');
    
    // Step 1: Clean actual full name if present
    if (rawName && rawName.trim()) {
        let cleaned = rawName
            .replace(EMOJI_REGEX, '')
            .replace(/[\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
            .trim();
        
        //  NEW: Replace dots with spaces (rakesh.kumar  rakesh kumar)
        cleaned = cleaned.replace(/\./g, ' ');
        
        //  NEW: Replace underscores with spaces (rakesh_kumar  rakesh kumar)
        cleaned = cleaned.replace(/_/g, ' ');
        
        //  NEW: If name has Devanagari (Hindi) characters, transliterate to English
        if (/[\u0900-\u097F]/.test(cleaned)) {
            cleaned = transliterateName(cleaned);
            // After transliteration, clean up spaces again
            cleaned = cleaned.replace(/\s+/g, ' ').trim();
        }
        
        // Remove trailing @, x, digits, dots, hyphens
        cleaned = cleaned.replace(/[@xX\s]+$/, '').trim();
        cleaned = cleaned.replace(/\d+$/, '').trim();
        
        // Collapse multiple spaces
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        
        // Check if result has meaningful content
        if (/[A-Za-z\u0900-\u097F\u4E00-\u9FFF]/.test(cleaned)) {
            //  MODIFIED: Capitalize properly, handling single-word names too
            return cleaned.split(/\s+/).map(w => {
                if (w.length === 0) return '';
                // If word is already properly capitalized (like "McDonald"), preserve
                return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
            }).join(' ');
        }
    }
    
    // Step 2: Extract from username
    const u = String(username || '');
    
    //  NEW: Replace dots and underscores in username with spaces for name extraction
    let userNameCleaned = u.replace(/[._]/g, ' ');
    
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
    return u.replace(/^@+/, '').replace(/\s/g, '').trim();
}

function parseCookie(raw) {
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

function countLines(filepath) {
    try {
        const data = fs.readFileSync(filepath, 'utf-8');
        return data.split('\n').filter(l => l.trim()).length;
    } catch { return 0; }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

//                              
// INSTAGRAM SESSION
//                              

class InstagramSession {
    constructor(cookieDict, proxyList = [], sessionId = 0) {
        this.id = sessionId;
        this.cookies = cookieDict;
        this.proxyList = proxyList;
        this.proxyIndex = sessionId % Math.max(proxyList.length, 1);
        this.totalRequests = 0;
        this.cookieStr = Object.entries(cookieDict)
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join('; ');

        this.baseHeaders = {
            'User-Agent': [
                'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
                'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.163 Mobile Safari/537.36',
            ][sessionId % 3],
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://www.instagram.com',
            'Referer': 'https://www.instagram.com/',
            'X-IG-App-ID': '936619743392459',
            'X-Requested-With': 'XMLHttpRequest',
            'Connection': 'keep-alive',
            'Cookie': this.cookieStr,
        };
        if (cookieDict['csrftoken']) {
            this.baseHeaders['X-CSRFToken'] = cookieDict['csrftoken'];
        }
    }

    getProxyUrl() {
        if (!this.proxyList.length) return undefined;
        
        if (STICKY_PROXY) {
            const p = this.proxyList[this.id % this.proxyList.length];
            return `http://${p}`;
        }
        
        const p = this.proxyList[this.proxyIndex % this.proxyList.length];
        this.proxyIndex++;
        return `http://${p}`;
    }

    async request(method, url, options = {}) {
        const retries = options.retries || 3;
        const useHtmlHeaders = options.useHtmlHeaders || false;
        const params = options.params || {};

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const headers = { ...this.baseHeaders };

                if (useHtmlHeaders) {
                    headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
                    headers['Sec-Fetch-Dest'] = 'document';
                    headers['Sec-Fetch-Mode'] = 'navigate';
                    headers['Sec-Fetch-Site'] = 'none';
                    headers['Upgrade-Insecure-Requests'] = '1';
                } else {
                    headers['Accept'] = '*/*';
                    headers['Sec-Fetch-Dest'] = 'empty';
                    headers['Sec-Fetch-Mode'] = 'cors';
                    headers['Sec-Fetch-Site'] = 'same-origin';
                }
                if (options.headers) Object.assign(headers, options.headers);

                let fullUrl = url;
                if (Object.keys(params).length) {
                    const qs = new URLSearchParams();
                    for (const [k, v] of Object.entries(params)) qs.append(k, v);
                    fullUrl += (url.includes('?') ? '&' : '?') + qs.toString();
                }

                const fetchOpts = { method, headers };
                const proxyUrl = this.getProxyUrl();
                if (proxyUrl) fetchOpts.agent = new HttpsProxyAgent(proxyUrl);

                const response = await fetch(fullUrl, fetchOpts);
                this.totalRequests++;

                if (response.status === 429) {
                    const wait = 5 + Math.random() * 10 + attempt * 5;
                    console.log(`      [S${this.id}]  429! waiting ${Math.round(wait)}s...`);
                    await sleep(wait * 1000);
                    continue;
                }
                
                return response;
            } catch (err) {
                console.log(`      [S${this.id}]  ${err.message.slice(0, 60)}`);
                await sleep(1000 * (attempt + 1));
            }
        }
        return null;
    }
}

//                              
// VERIFY LOGIN
//                              

async function verifyLogin(session) {
    try {
        const r = await session.request('GET', 'https://www.instagram.com/api/v1/web/data/shared_data/', { retries: 1 });
        if (!r || r.status !== 200) return [false, `HTTP ${r ? r.status : 'N/A'}`];
        const data = await r.json();
        const viewer = data?.config?.viewer;
        if (viewer?.username) return [true, viewer.username];
        return [false, 'Session invalid'];
    } catch (e) {
        return [false, e.message];
    }
}

//                              
// USER ID — FASTEST PATH
//                              

async function resolveUserId(session, username) {
    // A — www API (~200ms)
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

    // B — feed API (~300ms)
    try {
        const r = await session.request('GET', `https://www.instagram.com/api/v1/feed/user/${username}/username/`);
        if (r && r.status === 200) {
            const data = await r.json();
            const uid = data?.user?.pk || data?.user?.id;
            if (uid) return uid;
        }
    } catch {}

    // C — fresh no-cookie (last resort)
    try {
        const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
        const r = await fetch(
            `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
            {
                headers: {
                    'User-Agent': ua,
                    'Accept': '*/*',
                    'X-IG-App-ID': '936619743392459',
                    'Referer': 'https://www.instagram.com/',
                }
            }
        );
        if (r.status === 200) {
            const data = await r.json();
            const uid = data?.data?.user?.id;
            if (uid) return uid;
        }
    } catch {}

    return null;
}

//                              
// FETCH FOLLOW LIST (SIRF FOLLOWERS)
//                              

async function fetchFollowListREST(session, uid, listType, maxResults) {
    const users = [];
    let maxId = null;
    const perPage = Math.min(PER_PAGE, maxResults);

    while (users.length < maxResults) {
        const params = { count: perPage };
        if (maxId) params.max_id = maxId;

        const r = await session.request(
            'GET',
            `https://www.instagram.com/api/v1/friendships/${uid}/${listType}/`,
            { params }
        );
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

async function fetchFollowListGQL(session, uid, listType, maxResults) {
    const users = [];
    const [queryHash, edgeKey] = listType === 'followers'
        ? [GQL_HASHES.followers, 'edge_followed_by']
        : [GQL_HASHES.following, 'edge_follow'];

    let after = '';
    let hasNext = true;

    while (hasNext && users.length < maxResults) {
        const variables = JSON.stringify({
            id: String(uid),
            after,
            first: Math.min(50, maxResults - users.length),
        });

        const r = await session.request('GET', 'https://www.instagram.com/graphql/query/', {
            params: { query_hash: queryHash, variables }
        });
        if (!r || r.status !== 200) break;

        let data;
        try { data = await r.json(); } catch { break; }
        const edge = data?.data?.user?.[edgeKey];
        if (!edge || !edge.edges) break;

        for (const en of edge.edges) {
            const n = en.node;
            users.push([n.username || '', n.full_name || '', n.id || '0']);
            if (users.length >= maxResults) break;
        }

        hasNext = edge.page_info?.has_next_page || false;
        after = edge.page_info?.end_cursor || '';
        await sleep(200 + Math.random() * 300);
    }
    return users;
}

async function fetchFollowList(session, uid, username, listType, maxResults) {
    let users = await fetchFollowListREST(session, uid, listType, maxResults);
    if (users.length > 0) return users;
    users = await fetchFollowListGQL(session, uid, listType, maxResults);
    return users;
}

//                              
// BUFFERED FILE WRITER
//                              

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

    getTotal() { return this.totalWritten; }
}

//                              
// SHARED STATE
//                              

class SharedState {
    constructor() {
        this.queue = [];
        this.processed = new Set();
        this.visited = new Set();
        this.lines = 0;
        this.usersDone = 0;
        this.totalFollowers = 0;
        this.startTime = Date.now();
        this.lock = false;
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

    markDone(user) {
        this.processed.add(user);
    }

    markVisited(user) {
        this.visited.add(user);
    }

    enqueue(user) {
        const u = cleanUsername(user);
        if (u && !this.processed.has(u) && !this.visited.has(u)) {
            this.queue.push(u);
        }
    }

    getElapsedSec() {
        return (Date.now() - this.startTime) / 1000;
    }

    getRate() {
        const min = this.getElapsedSec() / 60;
        return min > 0 ? Math.round(this.lines / min) : 0;
    }
}

//                              
// WORKER — MODIFIED: Sirf Followers
//                              

async function worker(session, state, writer, workerId) {
    const sid = session.id;
    
    while (state.getElapsedSec() < MAX_RUNTIME_MIN * 60) {
        const username = state.nextUser();
        if (!username) {
            await sleep(100);
            continue;
        }

        if (state.processed.has(username) || state.visited.has(username)) continue;
        state.markVisited(username);

        const elapsed = state.getElapsedSec().toFixed(1);
        console.log(`[S${sid}-W${workerId}]  @${username} |  ${state.lines} lines |  ${state.getRate()}/min`);

        // 1. Resolve ID
        const uid = await resolveUserId(session, username);
        if (!uid) {
            console.log(`    ID fail — skipping`);
            state.markDone(username);
            continue;
        }

        // 2. Sirf FOLLOWERS fetch honge (following nahi)
        const followers = await fetchFollowList(session, uid, username, 'followers', PER_TARGET);

        // 3. Process results — queue new usernames
        let added = 0;
        for (const [uname, fnameRaw, pk] of followers) {
            if (!uname || !uname.trim()) continue;
            
            const fname = smartName(fnameRaw, uname, pk);
            writer.write(`${uname}|${fname}`);
            state.lines++;
            
            if (!state.processed.has(uname) && !state.visited.has(uname)) {
                state.queue.push(uname);
                added++;
            }
        }

        state.totalFollowers += followers.length;
        state.usersDone++;
        state.markDone(username);

        console.log(`    ${followers.length} followers |  ${added} new |  Queue: ${state.queue.length}`);

        // 4. Adaptive delay: 500-1000ms
        await sleep(500 + Math.random() * 500);
    }
}

//                              
// EXTREME CHAIN ENGINE — MODIFIED
//                              

async function runChain(sessions, target, filepath) {
    const state = new SharedState();
    state.queue.push(cleanUsername(target));
    state.startTime = Date.now();

    const writer = new BufferedWriter(filepath);

    console.log(`\n${''.repeat(60)}`);
    console.log(` EXTREME CHAIN SCRAPER v10 — MULTI-SESSION`);
    console.log(` ${sessions.length} sessions × ${WORKERS_PER_SESSION} workers = ${sessions.length * WORKERS_PER_SESSION} parallel`);
    console.log(` ${filepath}  |   ${PER_TARGET} FOLLOWERS/user  |   ${MAX_RUNTIME_MIN}min max`);
    console.log(` SIRF FOLLOWERS — Following nahi`);
    console.log(` Hindi names  English transliteration enabled`);
    console.log(` Dots  Spaces | Underscores  Spaces enabled`);
    console.log(`${''.repeat(60)}\n`);

    const allWorkers = [];
    for (let si = 0; si < sessions.length; si++) {
        for (let wi = 0; wi < WORKERS_PER_SESSION; wi++) {
            allWorkers.push(worker(sessions[si], state, writer, wi + 1));
        }
    }
    
    const monitor = setInterval(() => {
        const elapsed = state.getElapsedSec();
        const rate = state.getRate();
        const percpu = state.usersDone > 0 ? (state.lines / state.usersDone).toFixed(0) : 0;
        console.log(`\n [${elapsed.toFixed(0)}s] ${state.lines} lines · ${state.usersDone} users · ` +
            `${rate}/min · ${state.queue.length} queued · ~${percpu}/user · ${sessions.length} sessions\n`);
    }, 5000);

    await Promise.all(allWorkers);
    clearInterval(monitor);

    writer.flush();

    const totalTime = state.getElapsedSec();
    const linesFinal = countLines(filepath);

    console.log(`\n${''.repeat(60)}`);
    console.log(` DONE!`);
    console.log(` ${linesFinal} lines in ${totalTime.toFixed(0)}s`);
    console.log(` ${(linesFinal / (totalTime / 60)).toFixed(0)} lines/min`);
    console.log(` ${state.usersDone} users processed`);
    console.log(` ${filepath}`);
    console.log(` Sessions: ${sessions.length}  |  Avg followers/user: ${state.usersDone > 0 ? Math.round(state.totalFollowers / state.usersDone) : 0}`);
    console.log(`${''.repeat(60)}`);
}

//                              
// MAIN
//                              

async function main() {
    console.log(`

   INSTAGRAM CHAIN SCRAPER v10 — EXTREME MULTI-SESS      
   Smart Name · HindiEnglish · Multi-Account            
   MODIFIED: Sirf FOLLOWERS (800/user max)              
   DotsSpaces | UnderscoresSpaces | HindiEnglish     

    `);

    //  COOKIES (multi-session)
    console.log(' Enter cookie string(s) — one per LINE, or comma-separated:');
    console.log('   (Get from browser DevTools  Application  Cookies  instagram.com)');
    const rawInput = await ask('> ');
    const rawCookies = rawInput
        .split(/[\n,]/)
        .map(s => s.trim())
        .filter(s => s.length > 50);

    const cookieDicts = [];
    for (const raw of rawCookies) {
        const cd = parseCookie(raw);
        if (cd.sessionid && cd.csrftoken) {
            cookieDicts.push(cd);
        } else {
            console.log(`  Skipping invalid cookie (missing sessionid/csrftoken)`);
        }
    }

    if (cookieDicts.length === 0) {
        console.log(' Koi valid cookie nahi mili. sessionid + csrftoken dono hona chahiye.');
        process.exit(1);
    }
    console.log(` ${cookieDicts.length} valid session(s) loaded`);

    //  PROXIES
    const proxyInput = await ask('\n Proxies (user:pass@ip:port, comma-separated, optional):\n> ');
    const allProxies = proxyInput
        ? proxyInput.split(',').map(p => p.trim()).filter(Boolean)
        : [];
    if (allProxies.length) {
        console.log(` ${allProxies.length} proxies loaded — rotating per request`);
        if (allProxies.length < cookieDicts.length * WORKERS_PER_SESSION) {
            console.log(`  Kam proxies hain. Recommended: ${cookieDicts.length * WORKERS_PER_SESSION}+`);
        }
    } else {
        console.log('  No proxies — rate limit hit hogi jaldi');
    }

    //  CREATE SESSIONS
    const sessions = cookieDicts.map((cd, i) => new InstagramSession(cd, allProxies, i));

    //  VERIFY EACH SESSION
    console.log('\n Verifying sessions...');
    const validSessions = [];
    for (const s of sessions) {
        const [ok, username] = await verifyLogin(s);
        if (ok) {
            console.log(`    Session ${s.id}: @${username}`);
            validSessions.push(s);
        } else {
            console.log(`    Session ${s.id}: ${username}`);
        }
    }

    if (validSessions.length === 0) {
        console.log(' Koi bhi session valid nahi. Fresh cookies lo.');
        process.exit(1);
    }
    console.log(` ${validSessions.length}/${sessions.length} sessions verified`);

    //  TARGET
    const target = await ask('\n Target username: ');
    const fp = (await ask(' Output file [output.txt]: ')) || 'output.txt';

    //  GO
    console.log(`\n Launching ${validSessions.length} sessions × ${WORKERS_PER_SESSION} workers = ${validSessions.length * WORKERS_PER_SESSION} parallel...`);
    console.log(` Sirf FOLLOWERS (${PER_TARGET} max/user) — Following skip!`);
    console.log(` HindiEnglish transliteration ON | DotsSpaces | UnderscoresSpaces`);
    await runChain(validSessions, target, fp);
}

main().catch(err => {
    console.error('\n Fatal:', err.message);
    process.exit(1);
});