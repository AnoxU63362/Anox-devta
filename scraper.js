// ============ CHAIN ENGINE (DEDUPE BUILT-IN) ============
import * as fs from 'fs';
import { PER_TARGET, MAX_RUNTIME_MIN, WORKERS_PER_SESSION, BATCH_FLUSH } from './config.js';
import { fetchFollowList } from './instagram.js';
import { cleanUsername, smartName, getMappedName } from './names.js';
import { sleep, countLines } from './helpers.js';

// ---- BUFFERED FILE WRITER ----
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

// ---- SHARED STATE ----
class SharedState {
    constructor() {
        this.queue = [];
        this.processed = new Set();
        this.visited = new Set();
        this.saved = new Set();      // 🔒 DUPLICATE PROTECTION — jo usernames likh diye wo yahan
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

    markDone(user) { this.processed.add(user); }
    markVisited(user) { this.visited.add(user); }

    enqueue(user) {
        const u = cleanUsername(user);
        if (u && !this.processed.has(u) && !this.visited.has(u)) {
            this.queue.push(u);
        }
    }

    getElapsedSec() { return (Date.now() - this.startTime) / 1000; }

    getRate() {
        const min = this.getElapsedSec() / 60;
        return min > 0 ? Math.round(this.lines / min) : 0;
    }
}

// ---- WORKER ----
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
        console.log(`[S${sid}-W${workerId}] ▶ @${username} | 📄 ${state.lines} lines | ⚡ ${state.getRate()}/min`);

        // 1. Resolve ID
        const uid = await resolveUserIdLocal(session, username);
        if (!uid) {
            console.log(`   ✗ ID fail — skipping`);
            state.markDone(username);
            continue;
        }

        // 2. SIRF FOLLOWERS (5000 max — jitna mile utna)
        const followers = await fetchFollowList(session, uid, username, 'followers', PER_TARGET);

        // 3. Process — DUPLICATE CHECK + write
        let added = 0;
        for (const [uname, fnameRaw, pk] of followers) {
            if (!uname || !uname.trim()) continue;

            // 🔒 DUPLICATE SKIP — pehle se likha hua to dobara nahi likhenge
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

// resolveUserId import (circular avoid ke liye simple re-export style)
import { resolveUserId as resolveUserIdLocal } from './instagram.js';

// ---- RUN CHAIN ----
export async function runChain(sessions, target, filepath) {
    const state = new SharedState();
    state.queue.push(cleanUsername(target));
    state.startTime = Date.now();

    // 🔒 PURANI FILE LOAD — pehle se saved usernames duplicate set me daal do
    try {
        const old = fs.readFileSync(filepath, 'utf-8');
        for (const line of old.split('\n')) {
            const u = line.split('|')[0].trim();
            if (u) state.saved.add(u);
        }
        console.log(`🔒 ${state.saved.size} purane usernames file se load — duplicate save nahi honge`);
    } catch { /* file pehli baar ban rahi hai */ }

    const writer = new BufferedWriter(filepath);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 EXTREME CHAIN SCRAPER v11 — MULTI-SESSION (NO PROXY)`);
    console.log(`⚡ ${sessions.length} sessions × ${WORKERS_PER_SESSION} workers = ${sessions.length * WORKERS_PER_SESSION} parallel`);
    console.log(`📄 ${filepath}  |  🎯 ${PER_TARGET} FOLLOWERS/user max`);
    console.log(`🔒 Duplicates block | 🇮🇳 Hindi→English | Dots/Underscores→Spaces`);
    console.log(`${'='.repeat(60)}\n`);

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
        console.log(`\n📊 [${elapsed.toFixed(0)}s] ${state.lines} lines · ${state.usersDone} users · ` +
            `${rate}/min · ${state.queue.length} queued · ~${percpu}/user\n`);
    }, 5000);

    await Promise.all(allWorkers);
    clearInterval(monitor);
    writer.flush();

    const totalTime = state.getElapsedSec();
    const linesFinal = countLines(filepath);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ DONE!`);
    console.log(`📄 ${linesFinal} lines in ${totalTime.toFixed(0)}s`);
    console.log(`⚡ ${(linesFinal / (totalTime / 60)).toFixed(0)} lines/min`);
    console.log(`👥 ${state.usersDone} users processed`);
    console.log(`📁 ${filepath}`);
    console.log(`${'='.repeat(60)}`);
                                                                           }
