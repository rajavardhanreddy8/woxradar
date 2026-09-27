import {campusJson} from "../../../lib/college-access";
import { env } from "@/lib/runtime-env";
import { requireCampusUser } from "../../../lib/college-access";

const fixtureCircles: Record<string, { name: string; visibility: "public" | "private" }> = {
  c1: { name: "AI Builders at Woxsen", visibility: "public" },
  c2: { name: "Weekend Photowalks", visibility: "public" },
  c3: { name: "Founders' Build Circle", visibility: "private" },
  c4: { name: "Research Paper Sprint", visibility: "private" },
};

type CircleRow = { id: string; name: string; visibility: "public" | "private"; creatorUserId: string | null };
type MembershipRow = { id: string; circleId: string; circleName: string; memberName: string; memberInitials: string; memberUserId: string | null; state: "pending" | "accepted"; role: "member" | "owner" };

export async function POST(request: Request) {
  const user = await requireCampusUser(request);
  if (user instanceof Response) return user;
  const data = await request.json() as Record<string, unknown>;
  const action = typeof data.action === "string" ? data.action : "";

  if (action === "approve" || action === "reject") {
    const membershipId = typeof data.membershipId === "string" ? data.membershipId.trim().slice(0, 100) : "";
    if (!membershipId) return campusJson({ error: "Choose a membership request." }, { status: 400 });
    const pending = await env.DB.prepare(
      `SELECT membership.id, membership.circle_id AS circleId, membership.circle_name AS circleName,
        membership.member_name AS memberName, membership.member_initials AS memberInitials,
        membership.member_user_id AS memberUserId, membership.state, membership.role
       FROM circle_memberships AS membership WHERE membership.id = ? AND membership.state = 'pending' LIMIT 1`
    ).bind(membershipId).first<MembershipRow>();
    if (!pending) return campusJson({ error: "This pending request was not found." }, { status: 404 });
    const reviewer = await env.DB.prepare(
      "SELECT id FROM circle_memberships WHERE circle_id = ? AND member_user_id = ? AND state = 'accepted' LIMIT 1"
    ).bind(pending.circleId, user.userId).first<{ id: string }>();
    if (!reviewer) return campusJson({ error: "Only an existing circle member can review this request." }, { status: 403 });

    if (action === "reject") {
      await env.DB.prepare("DELETE FROM circle_memberships WHERE id = ?").bind(membershipId).run();
      return campusJson({ membership: { ...pending, state: "rejected" } });
    }

    await env.DB.batch([
      env.DB.prepare("UPDATE circle_memberships SET state = 'accepted' WHERE id = ?").bind(membershipId),
      env.DB.prepare("UPDATE circles SET member_count = member_count + 1 WHERE id = ?").bind(pending.circleId),
    ]);
    return campusJson({ membership: { ...pending, state: "accepted" } });
  }

  if (action === "leave") {
    const circleId = typeof data.circleId === "string" ? data.circleId.trim().slice(0, 100) : "";
    if (!circleId) return campusJson({ error: "Choose a circle." }, { status: 400 });
    const membership = await env.DB.prepare(
      "SELECT id, state, role FROM circle_memberships WHERE circle_id = ? AND member_user_id = ? LIMIT 1"
    ).bind(circleId, user.userId).first<{ id: string; state: string; role: string }>();
    if (!membership) return campusJson({ error: "You are not part of this circle." }, { status: 404 });
    if (membership.role === "owner") return campusJson({ error: "Circle owners cannot leave until ownership transfer is available." }, { status: 409 });
    const stored = await env.DB.prepare("SELECT id FROM circles WHERE id = ? LIMIT 1").bind(circleId).first<{ id: string }>();
    const statements = [env.DB.prepare("DELETE FROM circle_memberships WHERE id = ?").bind(membership.id)];
    if (stored && membership.state === "accepted") statements.push(env.DB.prepare("UPDATE circles SET member_count = MAX(1, member_count - 1) WHERE id = ?").bind(circleId));
    await env.DB.batch(statements);
    return campusJson({ left: true, circleId });
  }

  if (action !== "join" && action !== "request") return campusJson({ error: "Choose a valid circle action." }, { status: 400 });
  const circleId = typeof data.circleId === "string" ? data.circleId.trim().slice(0, 100) : "";
  if (!circleId) return campusJson({ error: "Choose a circle." }, { status: 400 });
  const stored = await env.DB.prepare(
    "SELECT id, name, visibility, creator_user_id AS creatorUserId FROM circles WHERE id = ? LIMIT 1"
  ).bind(circleId).first<CircleRow>();
  const fixture = fixtureCircles[circleId];
  const circle = stored ?? (fixture ? { id: circleId, name: fixture.name, visibility: fixture.visibility, creatorUserId: null } : null);
  if (!circle) return campusJson({ error: "This circle could not be found." }, { status: 404 });
  if (action === "join" && circle.visibility !== "public") return campusJson({ error: "Private circles require an access request." }, { status: 400 });
  if (action === "request" && circle.visibility !== "private") return campusJson({ error: "Public circles can be joined immediately." }, { status: 400 });

  const existing = await env.DB.prepare(
    "SELECT id, state FROM circle_memberships WHERE circle_id = ? AND member_user_id = ? LIMIT 1"
  ).bind(circle.id, user.userId).first<{ id: string; state: string }>();
  const state = circle.visibility === "public" ? "accepted" : "pending";
  const membership: MembershipRow = { id: existing?.id ?? crypto.randomUUID(), circleId: circle.id, circleName: circle.name, memberName: user.displayName, memberInitials: user.initials, memberUserId: user.userId, state, role: "member" };

  const save = env.DB.prepare(
    `INSERT INTO circle_memberships (id, circle_id, circle_name, member_name, member_initials, member_user_id, state, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(circle_id, member_user_id) DO UPDATE SET
      member_name = excluded.member_name, member_initials = excluded.member_initials, state = excluded.state`
  ).bind(membership.id, membership.circleId, membership.circleName, membership.memberName, membership.memberInitials, membership.memberUserId, membership.state, membership.role, Date.now());

  if (stored && state === "accepted" && existing?.state !== "accepted") {
    await env.DB.batch([save, env.DB.prepare("UPDATE circles SET member_count = member_count + 1 WHERE id = ?").bind(circle.id)]);
  } else {
    await save.run();
  }

  return campusJson({ membership }, { status: existing ? 200 : 201 });
}
