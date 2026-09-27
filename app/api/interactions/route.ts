import {campusJson} from "../../lib/college-access";
import { env } from "@/lib/runtime-env";
import { requireCampusUser } from "../../lib/college-access";

const allowedEmojis = new Set(["👍", "❤️", "🎉", "🤝"]);

type Summary = {
  commentCount: number;
  reactions: Record<string, number>;
  myReactions: string[];
};

async function readSummaries(postId?: string, userId?: string) {
  const reactionQuery = postId
    ? env.DB.prepare("SELECT post_id AS postId, emoji, COUNT(*) AS count FROM post_reactions WHERE post_id = ? GROUP BY post_id, emoji").bind(postId)
    : env.DB.prepare("SELECT post_id AS postId, emoji, COUNT(*) AS count FROM post_reactions GROUP BY post_id, emoji");
  const commentQuery = postId
    ? env.DB.prepare("SELECT post_id AS postId, COUNT(*) AS count FROM post_comments WHERE post_id = ? GROUP BY post_id").bind(postId)
    : env.DB.prepare("SELECT post_id AS postId, COUNT(*) AS count FROM post_comments GROUP BY post_id");
  const mineQuery = userId ? (postId
    ? env.DB.prepare("SELECT post_id AS postId, emoji FROM post_reactions WHERE author_user_id = ? AND post_id = ?").bind(userId, postId)
    : env.DB.prepare("SELECT post_id AS postId, emoji FROM post_reactions WHERE author_user_id = ?").bind(userId)) : null;
  const [reactionRows, commentRows, mineRows] = await Promise.all([reactionQuery.all(), commentQuery.all(), mineQuery?.all() ?? Promise.resolve({ results: [] })]);
  const summaries: Record<string, Summary> = {};
  const getSummary = (id: string) => summaries[id] ??= { commentCount: 0, reactions: {}, myReactions: [] };
  for (const row of reactionRows.results ?? []) {
    const id = String(row.postId);
    getSummary(id).reactions[String(row.emoji)] = Number(row.count);
  }
  for (const row of commentRows.results ?? []) getSummary(String(row.postId)).commentCount = Number(row.count);
  for (const row of mineRows.results ?? []) getSummary(String(row.postId)).myReactions.push(String(row.emoji));
  if (postId) getSummary(postId);
  return summaries;
}

export async function GET(request: Request) {
  const user = await requireCampusUser(request);
  if (user instanceof Response) return user;
  const postId = new URL(request.url).searchParams.get("postId")?.slice(0, 100) || undefined;
  const summaries = await readSummaries(postId, user?.userId);
  if (!postId) return campusJson({ summaries });
  const comments = await env.DB.prepare(
    "SELECT id, post_id AS postId, author_name AS authorName, author_initials AS authorInitials, body, created_at AS createdAt FROM post_comments WHERE post_id = ? ORDER BY created_at ASC LIMIT 60"
  ).bind(postId).all();
  return campusJson({ summaries, comments: comments.results ?? [] });
}

export async function POST(request: Request) {
  const user = await requireCampusUser(request);
  if (user instanceof Response) return user;
  const data = await request.json() as Record<string, unknown>;
  const postId = typeof data.postId === "string" ? data.postId.trim().slice(0, 100) : "";
  if (!postId) return campusJson({ error: "This post could not be found." }, { status: 400 });

  if (data.kind === "reaction") {
    const emoji = typeof data.emoji === "string" ? data.emoji : "";
    if (!allowedEmojis.has(emoji)) return campusJson({ error: "Choose one of the available reactions." }, { status: 400 });
    const existing = await env.DB.prepare(
      "SELECT id FROM post_reactions WHERE post_id = ? AND emoji = ? AND author_user_id = ? LIMIT 1"
    ).bind(postId, emoji, user.userId).first<{ id: string }>();
    if (existing) {
      await env.DB.prepare("DELETE FROM post_reactions WHERE id = ?").bind(existing.id).run();
    } else {
      await env.DB.prepare(
        "INSERT INTO post_reactions (id, post_id, emoji, author_name, author_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), postId, emoji, user.displayName, user.userId, Date.now()).run();
    }
    return campusJson({ summaries: await readSummaries(postId, user.userId) });
  }

  if (data.kind === "comment") {
    const body = typeof data.body === "string" ? data.body.trim().slice(0, 400) : "";
    if (!body) return campusJson({ error: "Write a comment before posting." }, { status: 400 });
    const comment = { id: crypto.randomUUID(), postId, authorName: user.displayName, authorInitials: user.initials, body, createdAt: Date.now() };
    await env.DB.prepare(
      "INSERT INTO post_comments (id, post_id, author_name, author_initials, author_user_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(comment.id, comment.postId, comment.authorName, comment.authorInitials, user.userId, comment.body, comment.createdAt).run();
    return campusJson({ comment, summaries: await readSummaries(postId, user.userId) }, { status: 201 });
  }

  return campusJson({ error: "Choose a comment or reaction action." }, { status: 400 });
}
