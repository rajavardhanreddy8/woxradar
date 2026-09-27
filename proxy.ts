import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || typeof claims.email !== "string") return response;

  const headers = new Headers(request.headers);
  headers.set("oai-authenticated-user-id", String(claims.sub));
  headers.set("oai-authenticated-user-email", claims.email);
  const fullName = typeof claims.user_metadata === "object" && claims.user_metadata && "full_name" in claims.user_metadata
    ? String(claims.user_metadata.full_name ?? "")
    : "";
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
