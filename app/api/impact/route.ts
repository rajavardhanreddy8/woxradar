import {campusJson} from "../../lib/college-access";
import { env } from "@/lib/runtime-env";
import { requireCampusUser } from "../../lib/college-access";

type CountRow = { count: number };

export async function GET(request: Request) {
  const user = await requireCampusUser(request);
  if (user instanceof Response) return user;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const [profiles, matchingUsers, realInvites, acceptedInvites, sharedContacts, circleMembers, campusPosts, weeklyActive] = await Promise.all([
    count("SELECT COUNT(*) AS count FROM profiles WHERE profile_completed = 1"),
    count("SELECT COUNT(DISTINCT user_id) AS count FROM activity_interests"),
    count("SELECT COUNT(*) AS count FROM requests WHERE recipient_user_id IS NOT NULL"),
    count("SELECT COUNT(*) AS count FROM requests WHERE recipient_user_id IS NOT NULL AND state = 'accepted'"),
    count("SELECT COUNT(*) AS count FROM requests WHERE recipient_user_id IS NOT NULL AND state = 'accepted' AND sender_shared_contact = 1 AND recipient_shared_contact = 1"),
    count("SELECT COUNT(DISTINCT member_user_id) AS count FROM circle_memberships WHERE member_user_id IS NOT NULL AND state = 'accepted'"),
    count("SELECT COUNT(*) AS count FROM posts WHERE author_user_id IS NOT NULL"),
    count("SELECT COUNT(DISTINCT user_id) AS count FROM product_events WHERE created_at >= ?", sevenDaysAgo),
  ]);
  const eventRows = await env.DB.prepare(
    `SELECT event_name AS eventName, COUNT(*) AS count FROM product_events
     WHERE created_at >= ? GROUP BY event_name ORDER BY count DESC`
  ).bind(sevenDaysAgo).all<{ eventName: string; count: number }>();
  return campusJson({
    updatedAt: Date.now(),
    metrics: { completedProfiles: profiles, matchingUsers, realInvites, acceptedInvites, sharedContacts, circleMembers, campusPosts, weeklyActive },
    rates: { invitationAcceptance: rate(acceptedInvites, realInvites), contactUnlock: rate(sharedContacts, acceptedInvites) },
    last7Days: eventRows.results ?? [],
    definitions: {
      realInvites: "Invitations between two authenticated, eligible students. Example profiles are excluded.",
      sharedContacts: "Accepted introductions where both students independently chose to share email.",
      weeklyActive: "Distinct signed-in students who opened the campus feed in the last seven days.",
    },
  });
}

export async function POST(request: Request) {
  const user = await requireCampusUser(request);
  if (user instanceof Response) return user;
  const data = await request.json() as Record<string, unknown>;
  const eventName = typeof data.eventName === "string" ? data.eventName.trim().slice(0, 40) : "";
  const contextId = typeof data.contextId === "string" ? data.contextId.trim().slice(0, 100) || null : null;
  if (!new Set(["feed_view", "match_open", "request_view", "profile_view"]).has(eventName)) return campusJson({ error: "Unsupported event." }, { status: 400 });
  await env.DB.prepare(
    "INSERT INTO product_events (id, user_id, event_name, context_id, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), user.userId, eventName, contextId, Date.now()).run();
  return campusJson({ recorded: true }, { status: 201 });
}

async function count(sql: string, binding?: number) {
  const statement = env.DB.prepare(sql);
  const row = binding === undefined ? await statement.first<CountRow>() : await statement.bind(binding).first<CountRow>();
  return Number(row?.count ?? 0);
}

function rate(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : null;
}
