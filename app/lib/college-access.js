import { requireRequestUser } from "./current-user";
import { campusSupabase } from "./supabase-server";
export function campusJson(data, init = {}) { const headers = new Headers(init.headers); headers.set("Cache-Control", "no-store"); return Response.json(data, { ...init, headers }); }
export function collegeEmail(value) { const email = typeof value === "string" ? value.trim().toLowerCase() : ""; return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@woxsen\.edu\.in$/.test(email) && email.length <= 254 ? email : null; }
export async function verificationFor(userId, request) {
  if (!request) return null;
  const { data: { user } } = await campusSupabase(request).auth.getUser();
  if (!user || user.id !== userId || !user.email_confirmed_at || !collegeEmail(user.email)) return null;
  return { collegeEmail: user.email, verifiedAt: new Date(user.email_confirmed_at).getTime() };
}
export async function requireCampusUser(request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  const verification = await verificationFor(user.userId, request);
  if (!verification) return campusJson({ error: "Use a confirmed Woxsen account." }, { status: 403 });
  return { ...user, collegeEmail: user.email };
}
export function isModerator() { return false; }
