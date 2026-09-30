import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // These were supplied by the old hosting platform. Never trust copies sent
  // by a browser; only this proxy may populate them after checking Supabase.
  const headers = new Headers(request.headers);
  for (const name of ["oai-authenticated-user-id", "oai-authenticated-user-email", "oai-authenticated-user-full-name", "oai-authenticated-user-full-name-encoding"]) headers.delete(name);
  let response = NextResponse.next({ request: { headers } });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        headers.set("cookie", request.headers.get("cookie") ?? "");
        response = NextResponse.next({ request: { headers } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser checks the current Auth record, including email confirmation,
  // instead of trusting mutable JWT metadata or a client-provided header.
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;
  const email = user?.email?.toLowerCase() ?? "";
  if (error || !user || !email.endsWith("@woxsen.edu.in") || !user.email_confirmed_at) return response;

  headers.set("oai-authenticated-user-id", user.id);
  headers.set("oai-authenticated-user-email", email);
  const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.slice(0, 70) : "";
  if (fullName) {
    headers.set("oai-authenticated-user-full-name", encodeURIComponent(fullName));
    headers.set("oai-authenticated-user-full-name-encoding", "percent-encoded-utf-8");
  }
  const authenticatedResponse = NextResponse.next({ request: { headers } });
  response.cookies.getAll().forEach((cookie) => authenticatedResponse.cookies.set(cookie));
  return authenticatedResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
