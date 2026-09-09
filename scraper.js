// ============ CHAIN ENGINE (DEDUPE + BUFFERED WRITE) ============
import * as fs from 'fs';
import { PER_TARGET, MAX_RUNTIME_MIN, WORKERS_PER_SESSION, BATCH_FLUSH } from './config.js';
import { fetchFollowList, resolveUserId } from './instagram.js';
import { cleanUsername, smartName, getMappedName } from './names.js';
import { sleep, countLines } from './helpers.js';

export class BufferedWriter {
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

class SharedState {
    constructor() {
        this.queue = [];
        this.processed = new Set();
        this.visited = new Set();
        this.saved = new Set();
        this.lines = 0;
        this.usersDone = 0;
        this.totalFollowers = 0;
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
    markDone(u) { this.processed.add(u); }
    markVisited(u) { this.visited.add(u); }
    enqueue(u) {
        const c = cleanUsername(u);
        if (c && !this.processed.has(c) && !this.visited.has(c)) {
            this.queue.push(c);
        }
    }
    getElapsedSec() { return (Date.now() - this.startTime) / 1000; }
    getRate() {
        const min = this.getElapsedSec() / 60;
        return min > 0 ? Math.round(this.lines / min) : 0;
    }
}

async function worker(session, state, writer, workerId) {
    const sid = session.id;

    while (state.getElapsedSec() < MAX_RUNTIME_MIN * 60) {
        const username = state.nextUser();
        if (!username) { await sleep(100); continue; }
        if (state.processed.has(username) || state.visited.has(username)) continue;
        state.markVisited(username);

        console.log(`[S${sid}-W${workerId}] ▶ @${username} | 📄 ${state.lines} lines | ⚡ ${state.getRate()}/min`);

        const uid = await resolveUserId(session, username);
        if (!uid) {
            console.log(`   ✗ ID fail — skip`);
            state.markDone(username);
            continue;
        }
        console.log(`   ✅ ID: ${uid}`);

        const followers = await fetchFollowList(session, uid, username, 'followers', PER_TARGET);

        let added = 0;
        for (const [uname, fnameRaw, pk] of followers) {
            if (!uname?.trim()) continue;
            if (state.saved.has(uname)) continue;
            state.saved.add(uname);

            const mapped = getMappedName(uname);
            const fname = mapped || smartName(fnameRaw, uname, pk);
            writer.write(`${uname}|${fname}`);
            state.lines++;

            if (!state.processed.has(uname) && !state.visited.has(uname)) {
                state.queue.push(uname);
                added++;
            }
        }

        state.usersDone++;
        state.markDone(username);
        console.log(`   ✓ ${followers.length} followers | ➕ ${added} new | 📋 Queue: ${state.queue.length}`);

        await sleep(500 + Math.random() * 500);
    }
}

export async function runChain(sessions, target, filepath) {
    const state = new SharedState();
    state.queue.push(cleanUsername(target));
    state.startTime = Date.now();

    try {
        const old = fs.readFileSync(filepath, 'utf-8');
        for (const line of old.split('\n')) {
            const u = line.split('|')[0].trim();
            if (u) state.saved.add(u);
        }
        console.log(`🔒 ${state.saved.size} purane usernames load — duplicates skip honge`);
    } catch { /* new file */ }

    const writer = new BufferedWriter(filepath);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 CHAIN SCRAPER — 2 METHODS (M4 APP-MOBILE + M5 HYBRID)`);
    console.log(`⚡ ${sessions.length} sessions × ${WORKERS_PER_SESSION} workers`);
    console.log(`📄 ${filepath} | 🎯 ${PER_TARGET}/user max`);
    console.log(`${'='.repeat(60)}\n`);

    const allWorkers = [];
    for (let si = 0; si < sessions.length; si++) {
        for (let wi = 0; wi < WORKERS_PER_SESSION; wi++) {
            allWorkers.push(worker(sessions[si], state, writer, wi + 1));
        }
    }

    const monitor = setInterval(() => {
        const percpu = state.usersDone > 0 ? (state.lines / state.usersDone).toFixed(0) : 0;
        console.log(`\n📊 [${state.getElapsedSec().toFixed(0)}s] ${state.lines} lines · ${state.usersDone} users · ${state.getRate()}/min · ${state.queue.length} queued · ~${percpu}/user\n`);
    }, 5000);

    await Promise.all(allWorkers);
    clearInterval(monitor);
    writer.flush();

    const linesFinal = countLines(filepath);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ DONE! ${linesFinal} lines | ${state.usersDone} users | ${state.getElapsedSec().toFixed(0)}s`);
    console.log(`📁 ${filepath}`);
    console.log(`${'='.repeat(60)}`);
}
