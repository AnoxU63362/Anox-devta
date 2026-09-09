// ============ INSTAGRAM SESSION — 2 METHODS: M4 (APP-MOBILE) + M5 (HYBRID) ============
import fetch from 'node-fetch';
import { GQL_HASHES, PER_PAGE } from './config.js';
import { sleep } from './helpers.js';

// ✅ FETCH_METHOD globally set hota hai index.js se
export let FETCH_METHOD = 4; // default: M4 APP-MOBILE
export function setFetchMethod(m) { FETCH_METHOD = m; }

export class InstagramSession {
    constructor(cookieDict, sessionId = 0) {
        this.id = sessionId;
        this.cookies = cookieDict;
        this.totalRequests = 0;
        this.cookieStr = Object.entries(cookieDict)
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join('; ');

        this.ua = [
            'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
        ][sessionId % 3];

        this.baseHeaders = {
            'User-Agent': this.ua,
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

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const headers = { ...this.baseHeaders };
                headers['Accept'] = '*/*';
                headers['Sec-Fetch-Dest'] = 'empty';
                headers['Sec-Fetch-Mode'] = 'cors';
                headers['Sec-Fetch-Site'] = 'same-origin';
                if (options.headers) Object.assign(headers, options.headers);

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
                console.log(`      [S${this.id}] ✗ ${err.message.slice(0, 60)}`);
                await sleep(1000 * (attempt + 1));
            }
        }
        return null;
    }
}

export async function verifyLogin(session) {
    try {
        const r = await session.request('GET', 'https://www.instagram.com/api/v1/web/data/shared_data/', { retries: 2 });
        if (!r || r.status !== 200) return [false, `HTTP ${r ? r.status : 'N/A'}`];
        const data = await r.json();
        const viewer = data?.config?.viewer;
        if (viewer?.username) return [true, viewer.username];
        return [false, 'Session invalid'];
    } catch (e) {
        return [false, e.message];
    }
}

// ═══════════════════════════════════════════════════════════
// USER ID RESOLUTION — 5 PATHS (sab methods ke liye same)
// ═══════════════════════════════════════════════════════════

export async function resolveUserId(session, username) {
    // A — i.instagram.com (mobile gateway, sabse reliable)
    try {
        const r = await session.request('GET', 'https://i.instagram.com/api/v1/users/web_profile_info/', {
            params: { username }
        });
        if (r && r.status === 200) {
            const data = await r.json();
            const uid = data?.data?.user?.id;
            if (uid) return uid;
        }
    } catch {}

    // B — www web_profile_info
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

    // C — usernameinfo (old endpoint)
    try {
        const r = await session.request('GET', `https://www.instagram.com/api/v1/users/${username}/usernameinfo/`);
        if (r && r.status === 200) {
            const data = await r.json();
            const uid = data?.user?.pk;
            if (uid) return uid;
        }
    } catch {}

    // D — Legacy GraphQL user hash
    try {
        const url = `https://www.instagram.com/graphql/query/?query_hash=c9100bf9110dd6361671f113dd02e7ae&variables=${encodeURIComponent(JSON.stringify({ username }))}`;
        const headers = {
            'User-Agent': session.ua,
            'Accept': '*/*',
            'Cookie': session.cookieStr,
            'Referer': 'https://www.instagram.com/',
            'X-Requested-With': 'XMLHttpRequest',
        };
        const r = await fetch(url, { headers });
        session.totalRequests++;
        if (r.status === 200) {
            const data = await r.json();
            const uid = data?.data?.user?.id;
            if (uid) return uid;
        }
    } catch {}

    // E — web_search_topsearch (search API)
    try {
        const r = await session.request('GET', 'https://www.instagram.com/web/search/topsearch/', {
            params: { query: username, context: 'blended' }
        });
        if (r && r.status === 200) {
            const data = await r.json();
            for (const item of (data?.users || [])) {
                const u = item?.user || {};
                if (u.username?.toLowerCase() === username.toLowerCase() && u.pk) return u.pk;
            }
            if (data?.users?.[0]?.user?.pk) return data.users[0].user.pk;
        }
    } catch {}

    return null;
}

// ═════════════════════════════ FETCH LISTS ═════════════════════════════

async function gqlList(session, uid, listType, maxResults) {
    const queryHash = listType === 'followers' ? GQL_HASHES.followers : GQL_HASHES.following;
    const edgeKey = listType === 'followers' ? 'edge_followed_by' : 'edge_follow';
    const users = [];
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
        if (!edge?.edges?.length) break;

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

async function restList(session, uid, listType, maxResults, host = 'www') {
    const users = [];
    let maxId = null;
    const base = host === 'i' ? 'https://i.instagram.com' : 'https://www.instagram.com';

    while (users.length < maxResults) {
        const params = { count: Math.min(PER_PAGE, maxResults) };
        if (maxId) params.max_id = maxId;

        const r = await session.request('GET', `${base}/api/v1/friendships/${uid}/${listType}/`, { params });
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

// ─── M4: APP-MOBILE — i.instagram REST + GQL fallback ───
async function appMobileList(session, uid, listType, maxResults) {
    let u = await restList(session, uid, listType, maxResults, 'i');
    if (u.length > 0) return u;
    console.log(`   ⚠ Mobile REST blocked → GQL fallback`);
    return await gqlList(session, uid, listType, maxResults);
}

// ─── M5: HYBRID — GQL → REST → Mobile (sab try) ───
async function hybridList(session, uid, listType, maxResults) {
    let u = await gqlList(session, uid, listType, maxResults);
    if (u.length > 0) return u;
    console.log(`   ⚠ GQL fail → REST fallback`);
    u = await restList(session, uid, listType, maxResults, 'www');
    if (u.length > 0) return u;
    console.log(`   ⚠ REST fail → Mobile fallback`);
    return await restList(session, uid, listType, maxResults, 'i');
}

// ─── MAIN FETCH (FETCH_METHOD ke hisab se route karo) ───
export async function fetchFollowList(session, uid, username, listType, maxResults) {
    if (FETCH_METHOD === 4) {
        return await appMobileList(session, uid, listType, maxResults);
    }
    // FETCH_METHOD === 5 → HYBRID
    return await hybridList(session, uid, listType, maxResults);
}
