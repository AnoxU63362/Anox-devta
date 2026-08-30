// instagram.js
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { GQL_HASHES, STICKY_PROXY, PER_PAGE } from './config.js';

export class InstagramSession { /* ... */ }
export async function verifyLogin(session) { /* ... */ }
export async function resolveUserId(session, username) { /* ... */ }
export async function fetchFollowList(session, uid, username, listType, maxResults) { /* ... */ }
// fetchFollowListREST / fetchFollowListGQL bhi export kar do ya private rakho
