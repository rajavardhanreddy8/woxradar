import { emailSettings } from "../../lib/admin";
import { campusJson } from "../../lib/college-access";
import { env } from "@/lib/runtime-env";
import { requireRequestUser } from "../../lib/current-user";
import { collegeEmail, verificationFor } from "../../lib/college-access";
const reply = (data, status = 200) => campusJson(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request) { const user = requireRequestUser(request); if (user instanceof Response)
    return user; try {
    const v = await verificationFor(user.userId, request);
    return reply({ verified: Boolean(v), collegeEmail: v?.collegeEmail ?? null, senderConfigured: Boolean(await emailSettings() && env.EMAIL_CODE_SECRET) });
}
catch {
    return reply({ error: "Could not load verification." }, 503);
} }
export async function POST(request) {
    const user = requireRequestUser(request);
    if (user instanceof Response)
        return user;
    let data;
    try {
        const raw = await request.text();
        if (raw.length > 1200)
            return reply({ error: "Request too large." }, 413);
        data = JSON.parse(raw);
    }
    catch {
        return reply({ error: "Send a valid verification request." }, 400);
    }
    const email = collegeEmail(data.email);
    if (!email)
        return reply({ error: "Use your complete @woxsen.edu.in email address." }, 400);
    let sender;
    try {
        sender = await emailSettings();
    }
    catch {
        return reply({ error: "Email configuration is unavailable." }, 503);
    }
    if (!sender || !env.EMAIL_CODE_SECRET)
        return reply({ error: "College email verification is waiting for the pilot email sender. Your draft can still be saved.", senderConfigured: false }, 503);
    try {
        const v = await verificationFor(user.userId, request);
        if (v)
            return reply({ verified: true, collegeEmail: v.collegeEmail });
        if (data.action === "send") {
            const now = Date.now(), id = crypto.randomUUID(), code = makeCode(), hash = await hashCode(id, user.userId, email, code);
            if (await env.DB.prepare("SELECT user_id FROM college_verifications WHERE verified_email=? AND user_id!=?").bind(email, user.userId).first())
                return reply({ error: "This college email is linked to another account." }, 409);
            const reserve = await env.DB.prepare(`INSERT INTO college_verifications (user_id,email,challenge_id,code_hash,expires_at,attempts,requested_at,window_start,send_count) VALUES(?,?,?,?,?,0,?,?,1)
        ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,challenge_id=excluded.challenge_id,code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,requested_at=excluded.requested_at,
        window_start=CASE WHEN college_verifications.window_start<=? THEN excluded.window_start ELSE college_verifications.window_start END,
        send_count=CASE WHEN college_verifications.window_start<=? THEN 1 ELSE college_verifications.send_count+1 END
        WHERE college_verifications.verified_email IS NULL AND college_verifications.requested_at<=? AND(college_verifications.window_start<=? OR college_verifications.send_count<5)`)
                .bind(user.userId, email, id, hash, now + 600000, now, now, now - 3600000, now - 3600000, now - 60000, now - 3600000).run();
            if (!reserve.meta.changes)
                return reply({ error: "Wait 60 seconds between codes. Up to five requests per hour." }, 429);
            if (!await quota(`inbox:${email}:${Math.floor(now / 3600000)}`, 5, now + 3600000) || !await quota(`day:${new Date(now).toISOString().slice(0, 10)}`, 80, now + 86400000))
                return reply({ error: "The inbox or pilot sending limit was reached. Try later." }, 429);
            let sent = false;
            try {
                const text = `Your WoxRadar code is ${code}. It expires in 10 minutes. Do not share it. If you did not request it, ignore this email.`, subject = "Your WoxRadar college verification code";
                const r = sender.provider === "brevo" ? await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": sender.key, "Content-Type": "application/json" }, body: JSON.stringify({ sender: { name: "WoxRadar", email: sender.sender }, to: [{ email }], subject, textContent: text }), signal: AbortSignal.timeout(12000) }) : await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${sender.key}`, "Content-Type": "application/json", "Idempotency-Key": id }, body: JSON.stringify({ from: sender.sender, to: [email], subject, text }), signal: AbortSignal.timeout(12000) });
                sent = r.ok;
            }
            catch { /* Never log a code or provider response. */ }
            if (!sent) {
                await env.DB.prepare("UPDATE college_verifications SET code_hash=NULL WHERE user_id=? AND challenge_id=?").bind(user.userId, id).run();
                return reply({ error: "We couldn't send the code. Check the email sender and retry after a minute." }, 503);
            }
            return reply({ sent: true, expiresInSeconds: 600, resendAfterSeconds: 60 });
        }
        if (data.action !== "verify" || typeof data.code !== "string" || !/^\d{6}$/.test(data.code.trim()))
            return reply({ error: "Enter the six-digit code from your college inbox." }, 400);
        const row = await env.DB.prepare("SELECT email,challenge_id AS challengeId,code_hash AS codeHash,expires_at AS expiresAt,attempts FROM college_verifications WHERE user_id=?").bind(user.userId).first();
        if (!row?.codeHash || row.email !== email || row.expiresAt <= Date.now() || row.attempts >= 5)
            return reply({ error: "Code expired or attempt limit reached. Request a new code." }, 400);
        const attempt = await env.DB.prepare("UPDATE college_verifications SET attempts=attempts+1 WHERE user_id=? AND challenge_id=? AND attempts<5 AND expires_at>? AND code_hash IS NOT NULL").bind(user.userId, row.challengeId, Date.now()).run();
        if (!attempt.meta.changes)
            return reply({ error: "This code changed. Request a new code." }, 409);
        if (!equalHash(await hashCode(row.challengeId, user.userId, email, data.code.trim()), row.codeHash))
            return reply({ error: "That code doesn't match. Check your inbox." }, 400);
        const done = await env.DB.prepare("UPDATE college_verifications SET verified_email=email,verified_at=?,code_hash=NULL WHERE user_id=? AND challenge_id=? AND code_hash=? AND expires_at>? AND verified_email IS NULL").bind(Date.now(), user.userId, row.challengeId, row.codeHash, Date.now()).run();
        return done.meta.changes ? reply({ verified: true, collegeEmail: email }) : reply({ error: "Code already used or expired. Refresh verification." }, 409);
    }
    catch {
        return reply({ error: "Verification is temporarily unavailable. Retry." }, 503);
    }
}
function makeCode() { let n; do {
    n = crypto.getRandomValues(new Uint32Array(1))[0];
} while (n >= 4294000000); return String(n % 1000000).padStart(6, "0"); }
async function hashCode(id, user, email, code) { const e = new TextEncoder(), key = await crypto.subtle.importKey("raw", e.encode(env.EMAIL_CODE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), bytes = await crypto.subtle.sign("HMAC", key, e.encode(JSON.stringify([id, user, email, code]))); return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, "0")).join(""); }
function equalHash(a, b) { if (a.length !== b.length)
    return false; let diff = 0; for (let i = 0; i < a.length; i++)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
async function quota(key, limit, expires) { const r = await env.DB.prepare("INSERT INTO email_send_quotas(quota_key,send_count,expires_at)VALUES(?,1,?)ON CONFLICT(quota_key)DO UPDATE SET send_count=email_send_quotas.send_count+1 WHERE email_send_quotas.send_count<?").bind(key, expires, limit).run(); return Boolean(r.meta.changes); }
