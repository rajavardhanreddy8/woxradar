import { requireRequestUser } from "./current-user";
export function campusJson(data, init = {}) { const headers = new Headers(init.headers); headers.set("Cache-Control", "no-store"); return Response.json(data, { ...init, headers }); }
export function collegeEmail(value) { const email = typeof value === "string" ? value.trim().toLowerCase() : ""; return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@woxsen\.edu\.in$/.test(email) && email.length <= 254 ? email : null; }
export async function verificationFor() { return null; }
export async function requireCampusUser(request) {
  const user = requireRequestUser(request);
  if (user instanceof Response) return user;
  if (!collegeEmail(user.email)) return campusJson({ error: "Use a verified Woxsen account." }, { status: 403 });
  return { ...user, collegeEmail: user.email };
}
export function isModerator() { return false; }
