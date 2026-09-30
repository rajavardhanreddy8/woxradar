import { campusJson } from "../../lib/college-access";
import { env } from "@/lib/runtime-env";
import { requireCampusUser } from "../../lib/college-access";
const allowedTypes = new Set(["Activity", "Opportunity", "Exchange", "Gig"]);
export async function GET(request) {
    const user = await requireCampusUser(request);
    if (user instanceof Response)
        return user;
    if (!env.DB)
        return campusJson({ posts: [], storage: "browser" });
    const result = await env.DB.prepare("SELECT id, type, title, detail, time_label AS time, place, tags, accent, author_user_id AS authorUserId, COALESCE(author_name, 'Campus member') AS authorName, status, created_at AS createdAt FROM posts WHERE status != 'removed' ORDER BY created_at DESC LIMIT 40").all();
    return campusJson({ posts: result.results ?? [] });
}
export async function POST(request) {
    const user = await requireCampusUser(request);
    if (user instanceof Response)
        return user;
    const data = await request.json();
    const type = typeof data.type === "string" && allowedTypes.has(data.type) ? data.type : "Activity";
    const title = typeof data.title === "string" ? data.title.trim().slice(0, 100) : "";
    const detail = typeof data.detail === "string" ? data.detail.trim().slice(0, 360) : "";
    const time = typeof data.time === "string" ? data.time.trim().slice(0, 80) : "";
    const place = typeof data.place === "string" ? data.place.trim().slice(0, 100) : "";
    const tags = Array.isArray(data.tags) ? data.tags.filter((tag) => typeof tag === "string").slice(0, 5) : [];
    if (!title || !detail || !time || !place)
        return campusJson({ error: "Add a title, short description, time and location." }, { status: 400 });
    const createdAt = Date.now();
    const post = { id: crypto.randomUUID(), type, title, detail, time, place, tags, accent: "lime", authorUserId: user.userId, authorName: user.displayName, status: "open", createdAt };
    await env.DB.prepare("INSERT INTO posts (id, type, title, detail, time_label, place, tags, accent, author_user_id, author_name, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(post.id, post.type, post.title, post.detail, post.time, post.place, JSON.stringify(post.tags), post.accent, user.userId, post.authorName, post.status, createdAt).run();
    return campusJson({ post }, { status: 201 });
}
export async function PATCH(request) {
    const user = await requireCampusUser(request);
    if (user instanceof Response)
        return user;
    const data = await request.json();
    const postId = typeof data.postId === "string" ? data.postId.trim().slice(0, 100) : "";
    const status = data.status === "closed" ? "closed" : data.status === "open" ? "open" : "";
    if (!postId || !status)
        return campusJson({ error: "Choose a valid post status." }, { status: 400 });
    const post = await env.DB.prepare("SELECT author_user_id AS authorUserId FROM posts WHERE id = ? LIMIT 1").bind(postId).first();
    if (!post)
        return campusJson({ error: "Post not found." }, { status: 404 });
    if (post.authorUserId !== user.userId)
        return campusJson({ error: "Only the post owner can change its status." }, { status: 403 });
    await env.DB.prepare("UPDATE posts SET status = ? WHERE id = ?").bind(status, postId).run();
    return campusJson({ postId, status });
}
