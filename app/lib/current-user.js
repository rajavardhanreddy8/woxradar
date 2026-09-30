export function getRequestUser(request) {
    const userId = request.headers.get("oai-authenticated-user-id")?.trim();
    const email = request.headers.get("oai-authenticated-user-email")?.trim();
    if (!userId || !email)
        return null;
    const encodedName = request.headers.get("oai-authenticated-user-full-name");
    const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
    const fullName = encodedName && encoding === "percent-encoded-utf-8" ? safeDecode(encodedName) : null;
    const displayName = cleanDisplayName(fullName || email.split("@")[0] || "Campus member");
    return { userId, email, displayName, initials: initialsFor(displayName) };
}
export function requireRequestUser(request) {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        const origin = request.headers.get("origin");
        if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
            return Response.json({ error: "Use WoxRadar to make this change." }, { status: 403 });
        }
    }
    const user = getRequestUser(request);
    return user ?? Response.json({ error: "Sign in to continue." }, { status: 401 });
}
export function initialsFor(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CM";
}
function cleanDisplayName(value) {
    return value.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 70);
}
function safeDecode(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return null;
    }
}
