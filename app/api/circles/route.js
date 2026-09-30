import { campusJson } from "../../lib/college-access";
import { env } from "@/lib/runtime-env";
import { requireCampusUser } from "../../lib/college-access";
const allowedVisibilities = new Set(["public", "private"]);
export async function GET(request) {
    const user = await requireCampusUser(request);
    if (user instanceof Response)
        return user;
    if (!env.DB)
        return campusJson({ circles: [], memberships: [], incomingRequests: [], storage: "browser" });
    const [circleResult, membershipResult, incomingResult] = await Promise.all([
        env.DB.prepare("SELECT id, name, description, visibility, category, creator_name AS creatorName, creator_user_id AS creatorUserId, member_count AS memberCount FROM circles WHERE visibility IN ('public','private') ORDER BY created_at DESC LIMIT 40").all(),
        user ? env.DB.prepare("SELECT id, circle_id AS circleId, circle_name AS circleName, member_name AS memberName, member_initials AS memberInitials, member_user_id AS memberUserId, state, role FROM circle_memberships WHERE member_user_id = ? ORDER BY created_at DESC LIMIT 100").bind(user.userId).all() : Promise.resolve({ results: [] }),
        user ? env.DB.prepare(`SELECT membership.id, membership.circle_id AS circleId, membership.circle_name AS circleName,
        membership.member_name AS memberName, membership.member_initials AS memberInitials,
        membership.member_user_id AS memberUserId, membership.state, membership.role
       FROM circle_memberships AS membership
       WHERE membership.state = 'pending' AND EXISTS (
         SELECT 1 FROM circle_memberships AS reviewer
         WHERE reviewer.circle_id = membership.circle_id AND reviewer.member_user_id = ? AND reviewer.state = 'accepted'
       )
       ORDER BY membership.created_at ASC LIMIT 50`).bind(user.userId).all() : Promise.resolve({ results: [] }),
    ]);
    return campusJson({
        circles: circleResult.results ?? [],
        memberships: membershipResult.results ?? [],
        incomingRequests: incomingResult.results ?? [],
    });
}
export async function POST(request) {
    const user = await requireCampusUser(request);
    if (user instanceof Response)
        return user;
    const data = await request.json();
    const name = typeof data.name === "string" ? data.name.trim().slice(0, 70) : "";
    const description = typeof data.description === "string" ? data.description.trim().slice(0, 240) : "";
    const category = typeof data.category === "string" ? data.category.trim().slice(0, 40) : "General";
    const visibility = typeof data.visibility === "string" && allowedVisibilities.has(data.visibility) ? data.visibility : "public";
    if (!name || !description) {
        return campusJson({ error: "Add a circle name and a short purpose." }, { status: 400 });
    }
    const now = Date.now();
    const circle = {
        id: crypto.randomUUID(),
        name,
        description,
        category,
        visibility,
        creatorName: user.displayName,
        creatorUserId: user.userId,
        memberCount: 1,
    };
    const membership = {
        id: crypto.randomUUID(),
        circleId: circle.id,
        circleName: circle.name,
        memberName: user.displayName,
        memberInitials: user.initials,
        memberUserId: user.userId,
        state: "accepted",
        role: "owner",
    };
    await env.DB.batch([
        env.DB.prepare("INSERT INTO circles (id, name, description, visibility, category, creator_name, creator_user_id, member_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(circle.id, circle.name, circle.description, circle.visibility, circle.category, circle.creatorName, circle.creatorUserId, circle.memberCount, now),
        env.DB.prepare("INSERT INTO circle_memberships (id, circle_id, circle_name, member_name, member_initials, member_user_id, state, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(membership.id, membership.circleId, membership.circleName, membership.memberName, membership.memberInitials, membership.memberUserId, membership.state, membership.role, now),
    ]);
    return campusJson({ circle, membership }, { status: 201 });
}
