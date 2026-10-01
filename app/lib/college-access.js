import { campusSupabase } from "./supabase-server";
export function campusJson(data, init = {}) { const headers = new Headers(init.headers); headers.set("Cache-Control", "no-store"); return Response.json(data, { ...init, headers }); }
export function collegeEmail(value) { const email = typeof value === "string" ? value.trim().toLowerCase() : ""; return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@woxsen\.edu\.in$/.test(email) && email.length <= 254 ? email : null; }
export async function verificationFor(userId, request) {
  if (!request) return null;
  const { data: { user } } = await campusSupabase(request).auth.getUser();
  if (!user || user.id !== userId || !user.email_confirmed_at || !collegeEmail(user.email)) return null;
  return { collegeEmail: user.email, verifiedAt: new Date(user.email_confirmed_at).getTime(), authUser: user };
}
export async function requireCampusUser(request, requireSocial = true, requireCompleted = true) {
  const db = campusSupabase(request);
  const { data: { user }, error: userError } = await db.auth.getUser();
  if (userError || !user) return campusJson({ error: "Sign in to continue." }, { status: 401 });
  const email = collegeEmail(user.email);
  if (!email || !user.email_confirmed_at) return campusJson({ error: "Use a confirmed Woxsen account." }, { status: 403 });
  const { data: suspension, error } = await db.from("wox_suspensions").select("user_id").eq("user_id", user.id).maybeSingle();
  if (error) return campusJson({ error: "Campus access could not be checked. Retry." }, { status: 503 });
  if (suspension) return campusJson({ error: "Your campus access is paused. Contact the WoxRadar administrator." }, { status: 403 });
  const profile = user.user_metadata?.wox_profile;
  if (requireCompleted && profile?.profileCompleted !== true) return campusJson({ error: "Finish the WoxRadar questions before opening campus features.", needsProfile: true }, { status: 409 });
  if (requireSocial && (!Array.isArray(profile?.socialContacts) || !profile.socialContacts.some(contact => typeof contact?.value === "string" && contact.value.trim()))) return campusJson({ error: "Add and save at least one social handle or profile link in My profile first.", needsProfile: true }, { status: 409 });
  const displayName = String(profile?.displayName || user.user_metadata?.full_name || email.split("@")[0] || "Campus member").trim().slice(0, 70);
  return { userId: user.id, email, displayName, collegeEmail: email };
}
export function isModerator() { return false; }
