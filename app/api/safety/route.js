import { campusJson } from "../../lib/college-access";
import { env } from "@/lib/runtime-env";
import { requireCampusUser } from "../../lib/college-access";
import { requireRequestUser } from "../../lib/current-user";
export async function GET(request) {
    const signedIn = requireRequestUser(request);
    if (signedIn instanceof Response)
        return signedIn;
    // The current pilot stores authentication/profile state in Supabase. The
    // legacy safety tables are optional, so an unavailable legacy store should
    // not prevent a verified student from opening their profile.
    if (!env.DB?.prepare)
        return campusJson({ blocks: [] });
    const user = await requireCampusUser(request);
    if (user instanceof Response)
        return user;
    const result = await env.DB.prepare(`SELECT block.id, block.blocked_user_id AS blockedUserId,
      profile.display_name AS displayName, profile.initials,
      block.created_at AS createdAt
     FROM user_blocks AS block
     LEFT JOIN profiles AS profile ON profile.user_id = block.blocked_user_id
     WHERE block.blocker_user_id = ? ORDER BY block.created_at DESC LIMIT 100`).bind(user.userId).all();
    return campusJson({ blocks: result.results ?? [] });
}
export async function POST(request) {
    const user = await requireCampusUser(request);
    if (user instanceof Response)
        return user;
    const data = await request.json();
    const kind = textValue(data.kind, 20);
    const targetUserId = textValue(data.targetUserId, 100);
    if (kind === "block") {
        if (!targetUserId || targetUserId === user.userId)
            return campusJson({ error: "Choose another student to block." }, { status: 400 });
        const now = Date.now();
        await env.DB.batch([
            env.DB.prepare(`INSERT INTO user_blocks (id, blocker_user_id, blocked_user_id, created_at)
         VALUES (?, ?, ?, ?) ON CONFLICT(blocker_user_id, blocked_user_id) DO NOTHING`).bind(crypto.randomUUID(), user.userId, targetUserId, now),
            env.DB.prepare(`UPDATE requests SET state = 'cancelled', sender_shared_contact = 0, recipient_shared_contact = 0, updated_at = ?
         WHERE state IN ('pending', 'accepted') AND
         ((sender_user_id = ? AND recipient_user_id = ?) OR (sender_user_id = ? AND recipient_user_id = ?))`).bind(now, user.userId, targetUserId, targetUserId, user.userId),
        ]);
        return campusJson({ blocked: true });
    }
    if (kind === "report") {
        const targetType = textValue(data.targetType, 20);
        const targetId = textValue(data.targetId, 100);
        const reason = textValue(data.reason, 500);
        if (!targetId || !reason || !["user", "post", "comment", "circle", "message"].includes(targetType)) {
            return campusJson({ error: "A valid target and reason are required." }, { status: 400 });
        }
        if (targetType === "message") {
            const own = await env.DB.prepare("SELECT m.id FROM connection_messages m JOIN requests r ON r.id=m.request_id WHERE m.id=? AND(r.sender_user_id=? OR r.recipient_user_id=?)").bind(targetId, user.userId, user.userId).first();
            if (!own)
                return campusJson({ error: "You cannot report a message outside your conversation." }, { status: 403 });
        }
        const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM safety_reports WHERE reporter_user_id=? AND created_at>?").bind(user.userId, Date.now() - 3600000).first();
        if ((recent?.n ?? 0) >= 20)
            return campusJson({ error: "Report limit reached. Retry later." }, { status: 429 });
        await env.DB.prepare(`INSERT INTO safety_reports (id, reporter_user_id, target_type, target_id, reason, state, created_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?)`).bind(crypto.randomUUID(), user.userId, targetType, targetId, reason, Date.now()).run();
        return campusJson({ reported: true }, { status: 201 });
    }
    return campusJson({ error: "Choose block or report." }, { status: 400 });
}
export async function DELETE(request) {
    const user = await requireCampusUser(request);
    if (user instanceof Response)
        return user;
    const data = await request.json();
    const targetUserId = textValue(data.targetUserId, 100);
    if (!targetUserId)
        return campusJson({ error: "Choose a blocked student." }, { status: 400 });
    await env.DB.prepare("DELETE FROM user_blocks WHERE blocker_user_id = ? AND blocked_user_id = ?").bind(user.userId, targetUserId).run();
    return campusJson({ blocked: false });
}
function textValue(value, limit) {
    return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
