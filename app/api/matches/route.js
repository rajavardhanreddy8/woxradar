import { campusJson, requireCampusUser } from "../../lib/college-access";
import { campusSupabase, throwIf } from "../../lib/supabase-server";

function interestsFor(value) {
  try { return Array.isArray(value) ? value : JSON.parse(value || "[]"); } catch { return []; }
}

export async function GET(request) {
  const user = await requireCampusUser(request);
  if (user instanceof Response) return user;
  const postId = new URL(request.url).searchParams.get("postId")?.slice(0, 100);
  if (!postId) return campusJson({ error: "Choose an activity first." }, { status: 400 });
  try {
    const db = campusSupabase(request);
    const { data: mine, error: mineError } = await db.from("wox_activity_interests").select("user_id").eq("post_id", postId).eq("user_id", user.userId).maybeSingle();
    throwIf(mineError);
    if (!mine) return campusJson({ viewerOptedIn: false, matches: [] });
    const { data: interests, error: interestsError } = await db.from("wox_activity_interests").select("user_id").eq("post_id", postId).neq("user_id", user.userId).limit(50);
    throwIf(interestsError);
    const ids = (interests || []).map(row => row.user_id);
    if (!ids.length) return campusJson({ viewerOptedIn: true, interestedCount: 1, matches: [] });
    const { data: people, error } = await db.from("wox_profiles").select("user_id,display_name,initials,course,school,year,interests").in("user_id", ids).eq("discovery_enabled", 1).eq("profile_completed", 1).limit(8);
    throwIf(error);
    const matches = (people || []).map((person, index) => ({
      userId: person.user_id, displayName: person.display_name, initials: person.initials,
      course: person.course, school: person.school, year: person.year, rank: index + 1,
      reasons: ["Both opted into this activity", ...interestsFor(person.interests).slice(0, 2).map(item => `Shared-interest context: ${item}`)],
      conversationStarter: "What are you hoping to do at this activity?"
    }));
    return campusJson({ viewerOptedIn: true, interestedCount: matches.length + 1, matches });
  } catch {
    return campusJson({ error: "Matching could not be loaded. Please retry." }, { status: 503 });
  }
}

export async function POST(request) {
  const user = await requireCampusUser(request);
  if (user instanceof Response) return user;
  const { postId } = await request.json();
  const id = String(postId || "").slice(0, 100);
  if (!id) return campusJson({ error: "Choose an activity first." }, { status: 400 });
  try {
    const db = campusSupabase(request);
    const [{ data: profile, error: profileError }, { data: activity, error: activityError }] = await Promise.all([
      db.from("wox_profiles").select("profile_completed,discovery_enabled").eq("user_id", user.userId).maybeSingle(),
      db.from("wox_posts").select("title").eq("id", id).eq("type", "Activity").eq("status", "open").maybeSingle()
    ]);
    throwIf(profileError); throwIf(activityError);
    if (!profile?.profile_completed || !profile.discovery_enabled) return campusJson({ error: "Finish your profile and enable discovery first.", needsProfile: true }, { status: 409 });
    if (!activity) return campusJson({ error: "This activity is no longer available." }, { status: 409 });
    const { data: existing, error: existingError } = await db.from("wox_activity_interests").select("id").eq("post_id", id).eq("user_id", user.userId).maybeSingle();
    throwIf(existingError);
    if (!existing) {
      const { error } = await db.from("wox_activity_interests").insert({ id: crypto.randomUUID(), post_id: id, activity_title: activity.title, user_id: user.userId, created_at: Date.now() });
      throwIf(error);
    }
    return campusJson({ joined: true }, { status: 201 });
  } catch {
    return campusJson({ error: "Could not join matching. Please retry." }, { status: 503 });
  }
}

export async function DELETE(request) {
  const user = await requireCampusUser(request);
  if (user instanceof Response) return user;
  const { postId } = await request.json();
  const { error } = await campusSupabase(request).from("wox_activity_interests").delete().eq("post_id", String(postId || "").slice(0, 100)).eq("user_id", user.userId);
  return error ? campusJson({ error: "Could not leave matching." }, { status: 503 }) : campusJson({ joined: false });
}
