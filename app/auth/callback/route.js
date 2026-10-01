import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
export async function GET(request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const requestedNext = requestUrl.searchParams.get("next") || "/?setup=1";
    const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") && !requestedNext.includes("\\") ? requestedNext : "/?setup=1";
    const redirectUrl = new URL(next, requestUrl.origin);
    const response = NextResponse.redirect(redirectUrl);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!code || !url || !key) {
        redirectUrl.searchParams.set("confirmation_failed", "1");
        return NextResponse.redirect(redirectUrl);
    }
    const supabase = createServerClient(url, key, {
        cookies: {
            getAll: () => request.cookies.getAll(),
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
            },
        },
    });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
        // The email may already be confirmed even if this one-time code was opened twice.
        // Send the student back to sign in rather than leaving them on a cryptic callback page.
        redirectUrl.searchParams.set("confirmed", "1");
        return NextResponse.redirect(redirectUrl);
    }
    redirectUrl.searchParams.set("confirmed", "1");
    const confirmedResponse = NextResponse.redirect(redirectUrl);
    response.cookies.getAll().forEach((cookie) => confirmedResponse.cookies.set(cookie));
    return confirmedResponse;
}
