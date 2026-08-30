// ============ MAIN ============
import { InstagramSession, verifyLogin } from './instagram.js';
import { runChain } from './scraper.js';
import { cleanUsername, parseCookieSafe, loadMappings } from './names.js';
import { parseCookie, ask } from './helpers.js';
import { WORKERS_PER_SESSION } from './config.js';

async function main() {
    console.log(`
======================================================
   INSTAGRAM CHAIN SCRAPER v11 — MULTI-SESSION
   Followers-only · 5000/user · Duplicate-safe
   Hindi→English · mappings.txt support
======================================================
    `);

    // 📋 MAPPINGS (optional) — custom naam wali file
    loadMappings('mappings.txt');

    // 🍪 COOKIES
    console.log('\n🍪 Enter cookie string(s) — one per LINE, or comma-separated:');
    console.log('   (Browser DevTools → Application → Cookies → instagram.com)');
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
            console.log(`⚠️  Skipping invalid cookie (missing sessionid/csrftoken)`);
        }
    }

    if (cookieDicts.length === 0) {
        console.log('❌ Koi valid cookie nahi mili. sessionid + csrftoken dono chahiye.');
        process.exit(1);
    }
    console.log(`✅ ${cookieDicts.length} valid session(s) loaded`);

    // 🎭 SESSIONS banao
    const sessions = cookieDicts.map((cd, i) => new InstagramSession(cd, i));

    // ✔️ VERIFY
    console.log('\n🔍 Verifying sessions...');
    const validSessions = [];
    for (const s of sessions) {
        const [ok, username] = await verifyLogin(s);
        if (ok) {
            console.log(`   ✅ Session ${s.id}: @${username}`);
            validSessions.push(s);
        } else {
            console.log(`   ❌ Session ${s.id}: ${username}`);
        }
    }

    if (validSessions.length === 0) {
        console.log('❌ Koi bhi session valid nahi. Fresh cookies lo.');
        process.exit(1);
    }
    console.log(`✅ ${validSessions.length}/${sessions.length} sessions verified`);

    // 🎯 TARGET
    const target = await ask('\n🎯 Target username: ');
    const fp = (await ask('📁 Output file [output.txt]: ')) || 'output.txt';

    // 🚀 GO
    console.log(`\n🚀 Launching ${validSessions.length} × ${WORKERS_PER_SESSION} = ${validSessions.length * WORKERS_PER_SESSION} workers...`);
    console.log(`🎯 FOLLOWERS (${5000} max/user — jitna mile utna) | Duplicates auto-skip`);
    await runChain(validSessions, cleanUsername(target), fp);
}

main().catch(err => {
    console.error('\n💥 Fatal:', err.message);
    process.exit(1);
});
