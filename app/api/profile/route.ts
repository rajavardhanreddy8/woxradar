import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { emptyPreferences, INTRODUCTION_VERSION, profileInputSchema, readinessErrors, type StudentProfile } from "@/app/lib/introduction";

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CM"; }
function getClient(request: NextRequest, response: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured");
  return createServerClient(url, key, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
}
function fromUser(user: any): StudentProfile {
  const stored = user.user_metadata?.wox_profile;
  const base = stored && typeof stored === "object" ? stored : {};
  const email = user.email ?? "", displayName = typeof base.displayName === "string" ? base.displayName : String(user.user_metadata?.full_name ?? email.split("@")[0] ?? "Campus member");
  return { userId: user.id, email, displayName, initials: initials(displayName), school: "", course: "", year: "", interests: [], skills: [], availability: [], meetingFormats: [], discoveryScope: "all", discoveryEnabled: false, socialContacts: [], preferences: emptyPreferences(), onboardingStep: 0, onboardingVersion: 0, profileCompleted: false, ...base, collegeVerified: email.endsWith("@woxsen.edu.in") && Boolean(user.email_confirmed_at), collegeEmail: email.endsWith("@woxsen.edu.in") ? email : undefined } as StudentProfile;
}

export async function GET(request: NextRequest) {
  const response = NextResponse.json({});
  try { const { data: { user } } = await getClient(request, response).auth.getUser(); return user ? NextResponse.json({ signedIn: true, profile: fromUser(user) }) : NextResponse.json({ signedIn: false }, { status: 401 }); }
  catch { return NextResponse.json({ error: "Your profile could not be loaded. Please retry." }, { status: 503 }); }
}
export async function PUT(request: NextRequest) {
  const response = NextResponse.json({});
  try {
    const supabase = getClient(request, response), { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
    const parsed = profileInputSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") }, { status: 400 });
    const completed = parsed.data.intent === "complete", profile = { ...fromUser(user), ...parsed.data, profileCompleted: completed, onboardingVersion: completed ? INTRODUCTION_VERSION : 0 } as StudentProfile;
    if (completed && (!profile.collegeVerified || readinessErrors(profile).length)) return NextResponse.json({ error: !profile.collegeVerified ? "Confirm your Woxsen email before finishing." : readinessErrors(profile).join(" ") }, { status: 400 });
    const { error } = await supabase.auth.updateUser({ data: { ...user.user_metadata, full_name: profile.displayName, wox_profile: profile } }); if (error) throw error;
    return NextResponse.json({ profile });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save your introduction." }, { status: 503 }); }
}
export async function PATCH(request: NextRequest) {
  const response = NextResponse.json({});
  try { const supabase = getClient(request, response), { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 }); const profile = { ...fromUser(user), discoveryEnabled: false }; const { error } = await supabase.auth.updateUser({ data: { ...user.user_metadata, wox_profile: profile } }); if (error) throw error; return NextResponse.json({ paused: true, profile }); }
  catch { return NextResponse.json({ error: "Could not pause discovery." }, { status: 503 }); }
}
