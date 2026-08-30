// scraper.js
import * as fs from 'fs';
import { PER_TARGET, MAX_RUNTIME_MIN, WORKERS_PER_SESSION, BATCH_FLUSH } from './config.js';
import { fetchFollowList } from './instagram.js';
import { cleanUsername, smartName } from './names.js';

export class BufferedWriter { /* ... */ }
class SharedState { /* ... */ }
async function worker(session, state, writer, workerId) { /* ... */ }
export async function runChain(sessions, target, filepath) { /* ... */ }
