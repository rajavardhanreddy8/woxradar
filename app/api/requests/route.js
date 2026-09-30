import { campusJson } from "../../lib/college-access";
import { socialHref } from "../../lib/social-contacts";
import { env } from "@/lib/runtime-env";
import { requireCampusUser } from "../../lib/college-access";
import { hydrateProfile, readProfile } from "../../lib/profile-store";
import { pairEligible } from "../../lib/matching";
import { INTRODUCTION_VERSION } from "../../lib/introduction";
export async function GET(request) {
    const user = await requireCampusUser(request);
    if (user instanceof Response)
        return user;
    const result = await env.DB.prepare(`SELECT request.id, request.recipient_name AS recipientName, request.activity_title AS activityTitle,
      request.sender_user_id AS senderUserId, request.sender_name AS senderName,
      request.recipient_user_id AS recipientUserId, request.post_id AS postId, request.state,
      request.sender_shared_contact AS senderSharedContact,
      request.recipient_shared_contact AS recipientSharedContact,
      request.created_at AS createdAt, request.updated_at AS updatedAt,request.opening_message AS openingMessage,
      vs.verified_email AS senderEmail, vr.verified_email AS recipientEmail,sender.social_contacts AS senderContacts,recipient.social_contacts AS recipientContacts
     FROM requests AS request
     LEFT JOIN profiles AS sender ON sender.user_id = request.sender_user_id
     LEFT JOIN profiles AS recipient ON recipient.user_id = request.recipient_user_id
     LEFT JOIN college_verifications vs ON vs.user_id=request.sender_user_id
     LEFT JOIN college_verifications vr ON vr.user_id=request.recipient_user_id
     WHERE (request.sender_user_id = ? OR request.recipient_user_id = ?)
       AND NOT EXISTS (SELECT 1 FROM user_blocks AS block WHERE
         (block.blocker_user_id = request.sender_user_id AND block.blocked_user_id = request.recipient_user_id) OR
         (block.blocker_user_id = request.recipient_user_id AND block.blocked_user_id = request.sender_user_id))
     ORDER BY request.created_at DESC LIMIT 50`).bind(user.userId, user.userId).all();
    const requests = (result.results ?? []).map((row) => serialize(row, user.userId));
    return campusJson({ incoming: requests.filter((entry) => entry.direction === "incoming"), outgoing: requests.filter((entry) => entry.direction === "outgoing") });
}
export async function POST(request) {
    const user = await requireCampusUser(request);
    if (user instanceof Response)
        return user;
    let data;
    try {
        data = await request.json();
    }
    catch {
        return campusJson({ error: "Send a valid invitation." }, { status: 400 });
    }
    const recipientUserId = textValue(data?.recipientUserId, 100), postId = textValue(data?.postId, 100);
    if (!recipientUserId || !postId || recipientUserId === user.userId)
        return campusJson({ error: "Choose a real eligible student and activity." }, { status: 400 });
    const openingMessage = typeof data.openingMessage === "string" ? data.openingMessage.trim() : "";
    if (openingMessage.length > 240)
        return campusJson({ error: "Keep the first message under 240 characters." }, { status: 400 });
    try {
        const daily = await env.DB.prepare("SELECT COUNT(*) AS n FROM requests WHERE sender_user_id=? AND created_at>?").bind(user.userId, Date.now() - 86400000).first();
        if ((daily?.n ?? 0) >= 20)
            return campusJson({ error: "You reached the daily introduction limit. Give people time to respond." }, { status: 429 });
        const [senderRow, recipientRow, activity, blocked, interest, previous] = await Promise.all([
            readProfile(user.userId), readProfile(recipientUserId),
            env.DB.prepare("SELECT title FROM posts WHERE id = ? AND type = 'Activity' AND status = 'open'").bind(postId).first(),
            env.DB.prepare("SELECT id FROM user_blocks WHERE (blocker_user_id = ? AND blocked_user_id = ?) OR (blocker_user_id = ? AND blocked_user_id = ?) LIMIT 1").bind(user.userId, recipientUserId, recipientUserId, user.userId).first(),
            env.DB.prepare("SELECT COUNT(*) AS count FROM activity_interests WHERE post_id = ? AND user_id IN (?, ?)").bind(postId, user.userId, recipientUserId).first(),
            env.DB.prepare("SELECT id, state FROM requests WHERE post_id = ? AND ((sender_user_id = ? AND recipient_user_id = ?) OR (sender_user_id = ? AND recipient_user_id = ?)) LIMIT 1").bind(postId, user.userId, recipientUserId, recipientUserId, user.userId).first(),
        ]);
        if (!senderRow || !recipientRow || !activity || blocked || interest?.count !== 2 || !pairEligible(hydrateProfile(senderRow), hydrateProfile(recipientRow))) {
            return campusJson({ error: "This invitation is unavailable. Refresh your matches; both students must still be eligible." }, { status: 403 });
        }
        if (previous && previous.state !== "cancelled")
            return campusJson({ error: "An invitation already exists for this pair and activity. Check Requests." }, { status: 409 });
        const key = JSON.stringify([postId, ...[user.userId, recipientUserId].sort()]);
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
        const id = previous?.id ?? "intro-" + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
        const now = Date.now();
        const result = await env.DB.prepare(`INSERT INTO requests (id, recipient_name, activity_title, sender_user_id, sender_name, recipient_user_id, post_id, state, sender_shared_contact, recipient_shared_contact, created_at, updated_at,opening_message)
       SELECT ?, b.display_name, post.title, a.user_id, a.display_name, b.user_id, post.id, 'pending', 0, 0, ?, ?, ?
       FROM profiles a JOIN profiles b ON b.user_id = ? JOIN posts post ON post.id = ?
       JOIN activity_interests ia ON ia.user_id = a.user_id AND ia.post_id = post.id
       JOIN activity_interests ib ON ib.user_id = b.user_id AND ib.post_id = post.id
       WHERE a.user_id = ? AND a.discovery_enabled = 1 AND b.discovery_enabled = 1
         AND a.profile_completed = 1 AND b.profile_completed = 1 AND a.onboarding_version = ? AND b.onboarding_version = ?
         AND post.type = 'Activity' AND post.status = 'open'
         AND EXISTS(SELECT 1 FROM college_verifications v WHERE v.user_id=a.user_id AND v.verified_email IS NOT NULL)
         AND EXISTS(SELECT 1 FROM college_verifications v WHERE v.user_id=b.user_id AND v.verified_email IS NOT NULL)
         AND NOT EXISTS(SELECT 1 FROM campus_suspensions s WHERE s.user_id IN(a.user_id,b.user_id))
         AND a.preferences=? AND b.preferences=?
         AND (a.discovery_scope = 'all' OR (a.discovery_scope = 'same-school' AND lower(trim(a.school)) = lower(trim(b.school))) OR (a.discovery_scope = 'same-year' AND a.year = b.year))
         AND (b.discovery_scope = 'all' OR (b.discovery_scope = 'same-school' AND lower(trim(a.school)) = lower(trim(b.school))) OR (b.discovery_scope = 'same-year' AND a.year = b.year))
         AND EXISTS (SELECT 1 FROM json_each(a.meeting_formats) fa JOIN json_each(b.meeting_formats) fb ON fa.value = fb.value)
         AND NOT EXISTS (SELECT 1 FROM user_blocks block WHERE (block.blocker_user_id = a.user_id AND block.blocked_user_id = b.user_id) OR (block.blocker_user_id = b.user_id AND block.blocked_user_id = a.user_id))
       ON CONFLICT(id) DO UPDATE SET recipient_name=excluded.recipient_name, sender_name=excluded.sender_name,
         sender_user_id=excluded.sender_user_id, recipient_user_id=excluded.recipient_user_id,
         state='pending', sender_shared_contact=0, recipient_shared_contact=0, updated_at=excluded.updated_at,opening_message=excluded.opening_message
       WHERE requests.state='cancelled'`).bind(id, now, now, openingMessage, recipientUserId, postId, user.userId, INTRODUCTION_VERSION, INTRODUCTION_VERSION, senderRow.preferences, recipientRow.preferences).run();
        if (!result.meta.changes)
            return campusJson({ error: "An invitation exists or eligibility changed. Refresh Matches and Requests." }, { status: 409 });
        await recordEvent(user.userId, "invite_sent", postId);
        return campusJson({ request: { id, recipientName: recipientRow.displayName, activityTitle: activity.title, state: "pending" } }, { status: 201 });
    }
    catch {
        return campusJson({ error: "Could not send the invitation. Please retry." }, { status: 503 });
    }
}
export async function PATCH(request) {
    const user = await requireCampusUser(request);
    if (user instanceof Response)
        return user;
    const data = await request.json();
    const requestId = textValue(data.requestId, 100);
    const action = textValue(data.action, 30);
    if (!requestId || !["accept", "decline", "cancel", "share-contact", "revoke-contact"].includes(action))
        return campusJson({ error: "Choose a valid request action." }, { status: 400 });
    const row = await env.DB.prepare(`SELECT id, sender_user_id AS senderUserId, recipient_user_id AS recipientUserId,
      state, sender_shared_contact AS senderSharedContact, recipient_shared_contact AS recipientSharedContact
     FROM requests WHERE id = ? LIMIT 1`).bind(requestId).first();
    if (!row)
        return campusJson({ error: "Request not found." }, { status: 404 });
    const isSender = row.senderUserId === user.userId;
    const isRecipient = row.recipientUserId === user.userId;
    if (!isSender && !isRecipient)
        return campusJson({ error: "You cannot update this request." }, { status: 403 });
    const now = Date.now();
    if (action === "accept" || action === "decline") {
        if (!isRecipient || row.state !== "pending")
            return campusJson({ error: "Only the recipient can answer a pending request." }, { status: 403 });
        const state = action === "accept" ? "accepted" : "declined";
        const result = await env.DB.prepare("UPDATE requests SET state = ?, updated_at = ? WHERE id = ? AND state = 'pending'").bind(state, now, requestId).run();
        if (!result.meta.changes)
            return campusJson({ error: "This invitation changed. Refresh Requests." }, { status: 409 });
        if (state === "accepted")
            await recordEvent(user.userId, "invite_accepted", row.id);
        return campusJson({ state });
    }
    if (action === "cancel") {
        if (!isSender || row.state !== "pending")
            return campusJson({ error: "Only the sender can cancel a pending request." }, { status: 403 });
        await env.DB.prepare("UPDATE requests SET state = 'cancelled', updated_at = ? WHERE id = ? AND state = 'pending'").bind(now, requestId).run();
        return campusJson({ state: "cancelled" });
    }
    if (row.state !== "accepted")
        return campusJson({ error: "Contact sharing is available only after acceptance." }, { status: 409 });
    const column = isSender ? "sender_shared_contact" : "recipient_shared_contact";
    const shared = await env.DB.prepare(`UPDATE requests SET ${column} = ?, updated_at = ? WHERE id = ? AND state = 'accepted'`).bind(action === "share-contact" ? 1 : 0, now, requestId).run();
    if (!shared.meta.changes)
        return campusJson({ error: "This connection changed. Refresh Requests." }, { status: 409 });
    await recordEvent(user.userId, "contact_shared", row.id);
    return campusJson({ state: "accepted", shared: action === "share-contact" });
}
function serialize(row, userId) {
    const direction = row.recipientUserId === userId ? "incoming" : "outgoing";
    const contactUnlocked = Boolean(row.senderSharedContact && row.recipientSharedContact && row.state === "accepted");
    return {
        id: row.id,
        recipientName: row.recipientName,
        senderName: row.senderName,
        activityTitle: row.activityTitle,
        openingMessage: row.openingMessage,
        otherUserId: direction === "incoming" ? row.senderUserId : row.recipientUserId,
        state: row.state,
        direction,
        senderSharedContact: Boolean(row.senderSharedContact),
        recipientSharedContact: Boolean(row.recipientSharedContact),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        contactUnlocked,
        otherContacts: contactUnlocked ? parseContacts(direction === "incoming" ? row.senderContacts : row.recipientContacts) : [],
        otherEmail: contactUnlocked ? (direction === "incoming" ? row.senderEmail : row.recipientEmail) : null,
    };
}
function textValue(value, limit) {
    return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
async function recordEvent(userId, eventName, contextId) {
    try {
        await env.DB.prepare("INSERT INTO product_events (id, user_id, event_name, context_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), userId, eventName, contextId, Date.now()).run();
    }
    catch { /* Metrics must never block the student action. */ }
}
function parseContacts(raw) { try {
    const p = JSON.parse(raw ?? "[]");
    return Array.isArray(p) ? p.map(c => ({ ...c, href: socialHref(c) })).filter(c => c.href) : [];
}
catch {
    return [];
} }
