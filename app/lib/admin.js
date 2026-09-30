import { env } from "@/lib/runtime-env";
import { requireRequestUser } from "./current-user";
const OWNER = "rajavreddy.g@gmail.com";
export const superAdmin = (email) => email.trim().toLowerCase() === OWNER;
export async function adminRole(id, email) {
    if (superAdmin(email))
        return "super_admin";
    if (await env.DB.prepare("SELECT user_id FROM campus_suspensions WHERE user_id=?").bind(id).first())
        return null;
    return await env.DB.prepare("SELECT user_id FROM admin_members WHERE user_id=?").bind(id).first() ? "admin" : null;
}
export async function requireAdmin(request, ownerOnly = false) {
    const u = requireRequestUser(request);
    if (u instanceof Response)
        return u;
    try {
        const role = await adminRole(u.userId, u.email);
        if (!role || (ownerOnly && role !== "super_admin"))
            return Response.json({ error: "You do not have access to this admin action." }, { status: 403, headers: { "Cache-Control": "no-store" } });
        return { ...u, role };
    }
    catch {
        return Response.json({ error: "Admin access is temporarily unavailable." }, { status: 503 });
    }
}
export function audit(actor, action, target) { return env.DB.prepare("INSERT INTO admin_audit(id,actor,action,target,created_at)VALUES(?,?,?,?,?)").bind(crypto.randomUUID(), actor, action, target, Date.now()); }
async function encryptionKey() { if (!env.ADMIN_SETTINGS_KEY)
    throw new Error("Secret storage not configured"); const bytes = Uint8Array.from(atob(env.ADMIN_SETTINGS_KEY), c => c.charCodeAt(0)); return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]); }
const base64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
export async function seal(settings) { const iv = crypto.getRandomValues(new Uint8Array(12)); const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("woxradar-email-v1") }, await encryptionKey(), new TextEncoder().encode(JSON.stringify(settings))); return `${base64(iv)}.${base64(encrypted)}`; }
export async function emailSettings() {
    const row = await env.DB.prepare("SELECT encrypted FROM admin_settings WHERE id='email'").first();
    if (row) {
        const [iv, data] = row.encrypted.split(".").map(v => Uint8Array.from(atob(v), c => c.charCodeAt(0)));
        return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("woxradar-email-v1") }, await encryptionKey(), data)));
    }
    const key = env.BREVO_API_KEY || env.RESEND_API_KEY;
    return key && env.VERIFICATION_FROM ? { provider: env.BREVO_API_KEY ? "brevo" : "resend", sender: env.VERIFICATION_FROM, key } : null;
}
