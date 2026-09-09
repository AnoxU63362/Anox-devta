// ============ MAIN ============
import { InstagramSession, verifyLogin, setFetchMethod } from './instagram.js';
import { runChain } from './scraper.js';
import { cleanUsername, loadMappings } from './names.js';
import { parseCookie, ask } from './helpers.js';
import { WORKERS_PER_SESSION } from './config.js';

async function main() {
    console.log(`
════════════════════════════════════════════════
   INSTAGRAM CHAIN SCRAPER v12
   2 Methods: [4] APP-MOBILE · [5] HYBRID
   Followers-only · Duplicate-safe · Hindi→English
════════════════════════════════════════════════
    `);

    // 📋 MAPPINGS (optional)
    loadMappings('mappings.txt');

    // 🎯 METHOD
    const m = (await ask('\n🎯 Method [4=APP-MOBILE / 5=HYBRID]: ')).trim();
    if (!['4', '5'].includes(m)) {
        console.log('❌ Sirf 4 ya 5 select karo');
        process.exit(1);
    }
    setFetchMethod(parseInt(m));
    console.log(`✅ Method: ${m === '4' ? 'APP-MOBILE (i.instagram REST + GQL fallback)' : 'HYBRID (GQL → REST → Mobile — sab try)'}`);

    // 🍪 COOKIES
    console.log('\n🍪 Cookie string(s) — ek line me ek, ya comma-separated:');
    const rawInput = await ask('> ');
    const rawCookies = rawInput.split(/[\n,]/).map(s => s.trim()).filter(s => s.length > 50);

    const cookieDicts = [];
    for (const raw of rawCookies) {
        const cd = parseCookie(raw);
        if (cd.sessionid && cd.csrftoken) {
            cookieDicts.push(cd);
        } else {
            console.log('⚠️  Invalid cookie skip');
        }
    }
    if (cookieDicts.length === 0) {
        console.log('❌ Koi valid cookie nahi. sessionid + csrftoken dono chahiye.');
        process.exit(1);
    }
    console.log(`✅ ${cookieDicts.length} session(s) loaded`);

    const sessions = cookieDicts.map((cd, i) => new InstagramSession(cd, i));

    // ✔️ VERIFY
    console.log('\n🔍 Verifying sessions…');
    const valid = [];
    for (const s of sessions) {
        const [ok, username] = await verifyLogin(s);
        if (ok) {
            console.log(`   ✅ S${s.id}: @${username}`);
            valid.push(s);
        } else {
            console.log(`   ❌ S${s.id}: ${username}`);
        }
    }
    if (valid.length === 0) {
        console.log('❌ Koi session valid nahi. FRESH cookie lo (logout → login → new cookie).');
        process.exit(1);
    }
    console.log(`✅ ${valid.length}/${sessions.length} sessions verified`);

    // 🎯 TARGET
    const target = await ask('\n🎯 Target username (@ bhi chalega): ');
    const fp = (await ask('📁 Output file [output.txt]: ')) || 'output.txt';

    console.log(`\n🚀 ${valid.length} × ${WORKERS_PER_SESSION} = ${valid.length * WORKERS_PER_SESSION} workers…`);
    await runChain(valid, cleanUsername(target), fp);
}

main().catch(err => {
    console.error('\n💥 Fatal:', err.message);
    process.exit(1);
});
