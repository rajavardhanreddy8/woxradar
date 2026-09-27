import {campusJson} from "../../lib/college-access";
import { env } from "@/lib/runtime-env";
import { requireCampusUser } from "../../lib/college-access";
import { INTRODUCTION_VERSION } from "../../lib/introduction";
import { hydrateProfile, readProfile, type ProfileRow } from "../../lib/profile-store";
import { pairEligible, rankContext } from "../../lib/matching";

export async function GET(request: Request) {
  const user = await requireCampusUser(request);
  if (user instanceof Response) return user;
  const postId = new URL(request.url).searchParams.get("postId")?.trim().slice(0, 100) ?? "";
  if (!postId) return campusJson({ error: "Choose an activity first." }, { status: 400 });
  try {
    const activity = await openActivity(postId);
    if (!activity) return campusJson({ unavailableActivity: true, viewerOptedIn: false, matches: [] });
    const row = await readProfile(user.userId);
    const viewer = row ? hydrateProfile(row) : null;
    if (!viewer?.profileCompleted) return campusJson({ needsProfile: true, viewerOptedIn: false, matches: [] });
    if (!viewer.discoveryEnabled) return campusJson({ discoveryDisabled: true, viewerOptedIn: false, matches: [] });
    const interest = await env.DB.prepare("SELECT id FROM activity_interests WHERE post_id = ? AND user_id = ?").bind(postId, user.userId).first();
    if (!interest) return campusJson({ viewerOptedIn: false, matches: [] });
    const rows = await env.DB.prepare(
      `SELECT profile.user_id AS userId, profile.display_name AS displayName, profile.initials,
        profile.school, profile.course, profile.year, profile.interests, profile.skills, profile.email,
        profile.availability, profile.meeting_formats AS meetingFormats, profile.preferences,
        profile.discovery_scope AS discoveryScope, profile.discovery_enabled AS discoveryEnabled,
        profile.profile_completed AS profileCompleted, profile.onboarding_version AS onboardingVersion,
        profile.onboarding_step AS onboardingStep,profile.social_contacts AS socialContacts,1 AS collegeVerified
       FROM profiles AS profile INNER JOIN college_verifications v ON v.user_id=profile.user_id AND v.verified_email IS NOT NULL INNER JOIN activity_interests AS interest ON interest.user_id = profile.user_id
       WHERE interest.post_id = ? AND profile.user_id != ? AND profile.discovery_enabled = 1
         AND profile.profile_completed = 1 AND profile.onboarding_version = ?
         AND NOT EXISTS(SELECT 1 FROM campus_suspensions s WHERE s.user_id=profile.user_id)
         AND NOT EXISTS (SELECT 1 FROM user_blocks AS block WHERE
           (block.blocker_user_id = ? AND block.blocked_user_id = profile.user_id) OR
           (block.blocker_user_id = profile.user_id AND block.blocked_user_id = ?))
       ORDER BY interest.created_at DESC LIMIT 1000`
    ).bind(postId, user.userId, INTRODUCTION_VERSION, user.userId, user.userId).all<ProfileRow>();
    const circleRows = await env.DB.prepare(
      `SELECT member.circle_id AS circleId, member.circle_name AS circleName, member.member_user_id AS userId
       FROM circle_memberships AS member INNER JOIN circles c ON c.id=member.circle_id AND c.visibility='public' INNER JOIN activity_interests AS interest ON interest.user_id = member.member_user_id
       WHERE member.state = 'accepted' AND interest.post_id = ?`
    ).bind(postId).all<{ circleId: string; circleName: string; userId: string }>();
    const circles = new Map<string, Map<string, string>>();
    for (const row of circleRows.results ?? []) { const map = circles.get(row.userId) ?? new Map<string, string>(); map.set(row.circleId, row.circleName); circles.set(row.userId, map); }
    const day = new Date().toISOString().slice(0, 10);
    const ranked = (rows.results ?? []).map(hydrateProfile).filter(p => pairEligible(viewer, p)).map(candidate => ({
      candidate, ...rankContext(viewer, candidate, circles.get(viewer.userId) ?? new Map(), circles.get(candidate.userId) ?? new Map()),
      tie: tieBreak(viewer.userId + candidate.userId + day),
    })).sort((a,b) => b.rankScore - a.rankScore || a.tie - b.tie);
    // Explicit serialization: no emails, whole questionnaire, social-energy label, or numerical score.
    const matches = ranked.slice(0, 8).map(({candidate, reasons, conversationStarter, icebreaker}, i) => ({
      userId: candidate.userId, displayName: candidate.displayName, initials: candidate.initials,
      school: candidate.school, course: candidate.course, year: candidate.year,
      rank: i + 1, reasons, conversationStarter, icebreaker,
    }));
    return campusJson({ viewerOptedIn: true, interestedCount: ranked.length + 1, matches }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Matching read unavailable");
    return campusJson({ error: "Matching could not be loaded. Please retry." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await requireCampusUser(request);
  if (user instanceof Response) return user;
  let data: Record<string, unknown>;
  try { data = await request.json(); } catch { return campusJson({error:"Send a valid activity."},{status:400}); }
  const postId = typeof data?.postId === "string" ? data.postId.trim().slice(0,100) : "";
  try {
    const activity = await openActivity(postId);
    if (!activity) return campusJson({ error: "Choose an open, published campus activity. Example activities cannot receive real participants." }, {status:409});
    const row = await readProfile(user.userId), profile = row ? hydrateProfile(row) : null;
    if (!profile?.profileCompleted) return campusJson({error:"Finish your introduction before joining activity matching.",needsProfile:true},{status:409});
    if (!profile.discoveryEnabled) return campusJson({error:"Choose to be discoverable in your profile review first."},{status:409});
    await env.DB.prepare("INSERT INTO activity_interests (id, post_id, activity_title, user_id, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(post_id, user_id) DO NOTHING")
      .bind(crypto.randomUUID(),postId,activity.title,user.userId,Date.now()).run();
    return campusJson({joined:true},{status:201});
  } catch { return campusJson({error:"Could not join matching. Please retry."},{status:503}); }
}

export async function DELETE(request: Request) {
  const user = await requireCampusUser(request);
  if (user instanceof Response) return user;
  let data: Record<string, unknown>;
  try { data = await request.json(); } catch { return campusJson({error:"Send a valid activity."},{status:400}); }
  const postId = typeof data?.postId === "string" ? data.postId.trim().slice(0,100) : "";
  if (!postId) return campusJson({error:"Choose an activity."},{status:400});
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM activity_interests WHERE post_id = ? AND user_id = ?").bind(postId,user.userId),
      env.DB.prepare("UPDATE requests SET state = 'cancelled', sender_shared_contact = 0, recipient_shared_contact = 0, updated_at = ? WHERE post_id = ? AND state = 'pending' AND (sender_user_id = ? OR recipient_user_id = ?)").bind(Date.now(),postId,user.userId,user.userId),
    ]);
    return campusJson({joined:false});
  } catch { return campusJson({error:"Could not leave matching. Please retry."},{status:503}); }
}
function openActivity(postId: string) { return env.DB.prepare("SELECT id, title FROM posts WHERE id = ? AND type = 'Activity' AND status = 'open' LIMIT 1").bind(postId).first<{id:string;title:string}>(); }
function tieBreak(value: string) { let h=2166136261; for(const c of value) h=Math.imul(h^c.charCodeAt(0),16777619); return h>>>0; }
