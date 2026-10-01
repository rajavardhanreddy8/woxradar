import { campusJson, requireCampusUser } from "../../lib/college-access";
import { campusSupabase, throwIf } from "../../lib/supabase-server";

function serialize(row, userId) {
  const incoming = row.recipient_user_id === userId;
  return {
    id: row.id, recipientName: row.recipient_name, senderName: row.sender_name,
    activityTitle: row.activity_title, openingMessage: row.opening_message,
    otherUserId: incoming ? row.sender_user_id : row.recipient_user_id,
    state: row.state, direction: incoming ? "incoming" : "outgoing",
    senderSharedContact: Boolean(row.sender_shared_contact),
    recipientSharedContact: Boolean(row.recipient_shared_contact),
    createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    contactUnlocked: false, otherContacts: [], otherEmail: null
  };
}

export async function GET(request) {
  const user = await requireCampusUser(request);
  if (user instanceof Response) return user;
  try {
    const db = campusSupabase(request);
    const [sent, received] = await Promise.all([
      db.from("wox_requests").select("*").eq("sender_user_id", user.userId),
      db.from("wox_requests").select("*").eq("recipient_user_id", user.userId)
    ]);
    throwIf(sent.error); throwIf(received.error);
    const requests = [...(sent.data || []), ...(received.data || [])].sort((a, b) => Number(b.created_at) - Number(a.created_at)).map(row => serialize(row, user.userId));
    return campusJson({ incoming: requests.filter(item => item.direction === "incoming"), outgoing: requests.filter(item => item.direction === "outgoing"), storage: "supabase" });
  } catch {
    return campusJson({ error: "Invitations could not be loaded." }, { status: 503 });
  }
}

export async function POST(request) {
  const user = await requireCampusUser(request);
  if (user instanceof Response) return user;
  const data = await request.json();
  const recipientUserId = String(data.recipientUserId || "").slice(0, 100);
  const postId = String(data.postId || "").slice(0, 100);
  const openingMessage = String(data.openingMessage || "").trim().slice(0, 240);
  if (!recipientUserId || recipientUserId === user.userId || !postId) return campusJson({ error: "Choose an eligible student and activity." }, { status: 400 });
  try {
    const db = campusSupabase(request);
    const [post, recipient, mine, theirs, duplicate] = await Promise.all([
      db.from("wox_posts").select("title").eq("id", postId).eq("type", "Activity").eq("status", "open").maybeSingle(),
      db.from("wox_profiles").select("display_name").eq("user_id", recipientUserId).eq("discovery_enabled", 1).eq("profile_completed", 1).maybeSingle(),
      db.from("wox_activity_interests").select("id").eq("post_id", postId).eq("user_id", user.userId).maybeSingle(),
      db.from("wox_activity_interests").select("id").eq("post_id", postId).eq("user_id", recipientUserId).maybeSingle(),
      db.from("wox_requests").select("id").eq("post_id", postId).eq("sender_user_id", user.userId).eq("recipient_user_id", recipientUserId).eq("state", "pending").maybeSingle()
    ]);
    throwIf(post.error); throwIf(recipient.error); throwIf(mine.error); throwIf(theirs.error); throwIf(duplicate.error);
    if (!post.data || !recipient.data || !mine.data || !theirs.data) return campusJson({ error: "Both students must still be eligible and opted in." }, { status: 403 });
    if (duplicate.data) return campusJson({ error: "You already sent an invitation for this activity." }, { status: 409 });
    const now = Date.now();
    const { data: saved, error } = await db.from("wox_requests").insert({
      id: crypto.randomUUID(), post_id: postId, activity_title: post.data.title,
      sender_user_id: user.userId, sender_name: user.displayName,
      recipient_user_id: recipientUserId, recipient_name: recipient.data.display_name,
      opening_message: openingMessage, state: "pending", sender_shared_contact: 0,
      recipient_shared_contact: 0, created_at: now, updated_at: now
    }).select().single();
    throwIf(error);
    return campusJson({ request: serialize(saved, user.userId) }, { status: 201 });
  } catch {
    return campusJson({ error: "Could not send the invitation. Please retry." }, { status: 503 });
  }
}

export async function PATCH(request) {
  const user = await requireCampusUser(request);
  if (user instanceof Response) return user;
  const { requestId, action } = await request.json();
  const db = campusSupabase(request);
  const { data: row, error: rowError } = await db.from("wox_requests").select("*").eq("id", String(requestId || "").slice(0, 100)).maybeSingle();
  if (rowError || !row) return campusJson({ error: "Request not found." }, { status: 404 });
  const incoming = row.recipient_user_id === user.userId, outgoing = row.sender_user_id === user.userId;
  const update = { updated_at: Date.now() };
  if (action === "accept" && incoming && row.state === "pending") update.state = "accepted";
  else if (action === "decline" && incoming && row.state === "pending") update.state = "declined";
  else if (action === "cancel" && outgoing && row.state === "pending") update.state = "cancelled";
  else if (action === "share-contact" && row.state === "accepted") update[outgoing ? "sender_shared_contact" : "recipient_shared_contact"] = 1;
  else if (action === "revoke-contact" && row.state === "accepted") update[outgoing ? "sender_shared_contact" : "recipient_shared_contact"] = 0;
  else return campusJson({ error: "This request action is not allowed." }, { status: 403 });
  const { error } = await db.from("wox_requests").update(update).eq("id", row.id);
  return error ? campusJson({ error: "Could not update this invitation." }, { status: 503 }) : campusJson(update);
}
