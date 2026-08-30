// ============ INSTAGRAM SESSION & APIs (NO PROXY) ============
import fetch from 'node-fetch';
import { GQL_HASHES, PER_PAGE } from './config.js';
import { sleep } from './helpers.js';

export class InstagramSession {
    constructor(cookieDict, sessionId = 0) {
        this.id = sessionId;
        this.cookies = cookieDict;
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
                    console.log(`      [S${this.id}] ⚠ 429! waiting ${Math.round(wait)}s...`);
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

export async function resolveUserId(session, username) {
    // A — web_profile_info API
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

    // B — feed API
    try {
        const r = await session.request('GET', `https://www.instagram.com/api/v1/feed/user/${username}/username/`);
        if (r && r.status === 200) {
            const data = await r.json();
            const uid = data?.user?.pk || data?.user?.id;
            if (uid) return uid;
        }
    } catch {}

    // C — no-cookie fallback
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

export async function fetchFollowList(session, uid, username, listType, maxResults) {
    let users = await fetchFollowListREST(session, uid, listType, maxResults);
    if (users.length > 0) return users;
    users = await fetchFollowListGQL(session, uid, listType, maxResults);
    return users;
      }
