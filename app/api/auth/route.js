import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

function configuredClient(request, pendingCookies) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => pendingCookies.push(...items)
    }
  });
}

function responseWithCookies(payload, status, pendingCookies) {
  const response = NextResponse.json(payload, { status });
  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

export async function POST(request) {
  const pendingCookies = [];
  try {
    const { action, email, password } = await request.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail.endsWith("@woxsen.edu.in")) return responseWithCookies({ error: "Use your @woxsen.edu.in email." }, 400, pendingCookies);
    const supabase = configuredClient(request, pendingCookies);
    const callbackUrl = new URL("/auth/callback", request.url).toString();

    if (action === "signin") {
      const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password: String(password || "") });
      return responseWithCookies({ session: Boolean(data.session), error: error?.message || "" }, error ? 400 : 200, pendingCookies);
    }
    if (action === "signup") {
      const suppliedPassword = String(password || "");
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(suppliedPassword)) {
        return responseWithCookies({ error: "Use 8+ characters with an uppercase letter, lowercase letter, and number." }, 400, pendingCookies);
      }
      const { error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: suppliedPassword,
        options: { emailRedirectTo: callbackUrl }
      });
      return responseWithCookies({ ok: !error, error: error?.message || "" }, error ? 400 : 200, pendingCookies);
    }
    if (action === "resend") {
      const { error } = await supabase.auth.resend({ type: "signup", email: normalizedEmail, options: { emailRedirectTo: callbackUrl } });
      return responseWithCookies({ ok: !error, error: error?.message || "" }, error ? 400 : 200, pendingCookies);
    }
    return responseWithCookies({ error: "Unknown authentication action." }, 400, pendingCookies);
  } catch (error) {
    return responseWithCookies({ error: error instanceof Error ? error.message : "Authentication request failed." }, 500, pendingCookies);
  }
}
