import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { emptyPreferences, INTRODUCTION_VERSION, profileInputSchema, readinessErrors } from "@/app/lib/introduction";
function initials(name) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CM"; }
function getClient(request, response) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key)
        throw new Error("Supabase is not configured");
    return createServerClient(url, key, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
}
function fromUser(user) {
    const stored = user.user_metadata?.wox_profile;
    const base = stored && typeof stored === "object" ? stored : {};
    const email = user.email ?? "", displayName = typeof base.displayName === "string" ? base.displayName : String(user.user_metadata?.full_name ?? email.split("@")[0] ?? "Campus member");
    const defaults = { displayName, school: "", course: "", year: "", interests: [], skills: [], availability: [], meetingFormats: [], discoveryScope: "all", discoveryEnabled: false, socialContacts: [], preferences: emptyPreferences(), onboardingStep: 0 };
    const parsed = profileInputSchema.omit({ intent: true }).safeParse({ ...defaults, ...base });
    const fields = parsed.success ? parsed.data : defaults;
    const collegeVerified = email.toLowerCase().endsWith("@woxsen.edu.in") && Boolean(user.email_confirmed_at);
    const profileCompleted = collegeVerified && parsed.success && base.profileCompleted === true && base.onboardingVersion === INTRODUCTION_VERSION && readinessErrors(fields).length === 0;
    return { ...fields, userId: user.id, email, initials: initials(fields.displayName), onboardingVersion: profileCompleted ? INTRODUCTION_VERSION : 0, profileCompleted, discoveryEnabled: profileCompleted && fields.discoveryEnabled, collegeVerified, collegeEmail: collegeVerified ? email : undefined, isModerator: false };
}
export async function GET(request) {
    const response = NextResponse.json({});
    try {
        const { data: { user } } = await getClient(request, response).auth.getUser();
        const profile = user ? fromUser(user) : null;
        return profile?.collegeVerified ? NextResponse.json({ signedIn: true, profile }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ signedIn: false, error: "Confirm your Woxsen email before signing in." }, { status: 401 });
    }
    catch {
        return NextResponse.json({ error: "Your profile could not be loaded. Please retry." }, { status: 503 });
    }
}
export async function PUT(request) {
    const response = NextResponse.json({});
    try {
        const supabase = getClient(request, response), { data: { user } } = await supabase.auth.getUser();
        if (!user || !fromUser(user).collegeVerified)
            return NextResponse.json({ error: "Confirm your Woxsen email before continuing." }, { status: 403 });
        const parsed = profileInputSchema.safeParse(await request.json());
        if (!parsed.success)
            return NextResponse.json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") }, { status: 400 });
        const completed = parsed.data.intent === "complete", profile = { ...fromUser(user), ...parsed.data, profileCompleted: completed, onboardingVersion: completed ? INTRODUCTION_VERSION : 0 };
        if (completed && (!profile.collegeVerified || readinessErrors(profile).length))
            return NextResponse.json({ error: !profile.collegeVerified ? "Confirm your Woxsen email before finishing." : readinessErrors(profile).join(" ") }, { status: 400 });
        const { error } = await supabase.auth.updateUser({ data: { ...user.user_metadata, full_name: profile.displayName, wox_profile: profile } });
        if (error)
            throw error;
        return NextResponse.json({ profile });
    }
    catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save your introduction." }, { status: 503 });
    }
}
export async function PATCH(request) {
    const response = NextResponse.json({});
    try {
        const supabase = getClient(request, response), { data: { user } } = await supabase.auth.getUser();
        if (!user || !fromUser(user).collegeVerified)
            return NextResponse.json({ error: "Confirm your Woxsen email before continuing." }, { status: 403 });
        const profile = { ...fromUser(user), discoveryEnabled: false };
        const { error } = await supabase.auth.updateUser({ data: { ...user.user_metadata, wox_profile: profile } });
        if (error)
            throw error;
        return NextResponse.json({ paused: true, profile });
    }
    catch {
        return NextResponse.json({ error: "Could not pause discovery." }, { status: 503 });
    }
}
