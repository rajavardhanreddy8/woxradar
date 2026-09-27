"use client";

import { useState } from "react";
import { CalendarDays, CircleCheck, CircleOff, Flag, MapPin, MessageCircle, ShieldAlert, UserRound, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { StudentProfile } from "./profile";

export type DetailPost = { id: string; type: "Activity" | "Opportunity" | "Exchange" | "Gig"; title: string; detail: string; time: string; place: string; tags: string[]; accent: string; authorUserId?: string | null; authorName?: string; status?: "open" | "closed"; createdAt?: number; count?: number };

export function PostDetail({ post, viewer, onClose, onMatch, onComments, onPostChange }: { post: DetailPost | null; viewer: StudentProfile | null; onClose: () => void; onMatch: (post: DetailPost) => void; onComments: (post: DetailPost) => void; onPostChange: (post: DetailPost) => void }) {
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!post) return null;
  const isOwner = Boolean(viewer && post.authorUserId && viewer.userId === post.authorUserId);
  const status = post.status ?? "open";

  async function changeStatus() {
    if (!post) return;
    setBusy(true); setError("");
    const nextStatus = status === "open" ? "closed" : "open";
    try {
      const response = await fetch("/api/posts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: post.id, status: nextStatus }) });
      const data = await response.json() as {error?:string};
      if (!response.ok) throw new Error(data.error ?? "Could not update the post.");
      onPostChange({ ...post, status: nextStatus });
      setMessage(nextStatus === "closed" ? "Marked closed. It remains visible for context." : "Post reopened.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the post."); }
    finally { setBusy(false); }
  }

  async function submitReport() {
    if (!post || reason.trim().length < 8) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/safety", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "report", targetType: "post", targetId: post.id, reason }) });
      const data = await response.json() as {error?:string};
      if (!response.ok) throw new Error(data.error ?? "Could not submit the report.");
      setReporting(false); setReason(""); setMessage("Report received for moderation.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not submit the report."); }
    finally { setBusy(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="sm:max-w-xl"><DialogHeader><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#EAF5D0] px-2.5 py-1 text-[11px] font-bold text-[#315E33]">{post.type}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${status === "open" ? "bg-[#D8FF48] text-[#17392B]" : "bg-[#ECEFEB] text-[#617065]"}`}>{status === "open" ? "Open" : "Closed"}</span></div><DialogTitle className="pt-2 text-2xl tracking-[-0.04em]">{post.title}</DialogTitle><DialogDescription>Posted by {post.authorName ?? "WoxRadar demo"}{post.createdAt ? ` · ${new Date(Number(post.createdAt)).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}</DialogDescription></DialogHeader>
    <div className="space-y-4"><p className="whitespace-pre-wrap text-sm leading-6 text-[#48604F]">{post.detail}</p><div className="grid gap-2 rounded-xl bg-[#F5F8F0] p-4 text-sm text-[#516A59]"><p className="flex gap-2"><CalendarDays className="mt-0.5 size-4 text-[#779A61]"/>{post.time}</p><p className="flex gap-2"><MapPin className="mt-0.5 size-4 text-[#779A61]"/>{post.place}</p><p className="flex gap-2"><UserRound className="mt-0.5 size-4 text-[#779A61]"/>Use comments for public questions; never post phone numbers publicly.</p></div><div className="flex flex-wrap gap-1.5">{post.tags.map(tag => <span key={tag} className="rounded-md bg-[#F1F4EB] px-2 py-1 text-xs text-[#57705D]">{tag}</span>)}</div>{message ? <p role="status" className="rounded-xl bg-[#F3F9E8] p-3 text-sm text-[#315E33]">{message}</p> : null}{error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}{reporting ? <div className="rounded-xl border border-[#E7CAC5] bg-[#FFF8F6] p-4"><label htmlFor="post-report" className="text-sm font-bold">Why should this post be reviewed?</label><textarea id="post-report" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} className="mt-2 min-h-24 w-full rounded-xl border bg-white p-3 text-sm" placeholder="Describe the concern…"/><div className="mt-2 flex justify-end gap-2"><Button variant="outline" onClick={() => setReporting(false)}>Cancel</Button><Button disabled={busy || reason.trim().length < 8} onClick={submitReport} className="bg-[#9F3E34] text-white"><ShieldAlert/> Submit report</Button></div></div> : null}</div>
    <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between"><div className="flex gap-2">{!isOwner ? <Button variant="ghost" onClick={() => setReporting(true)}><Flag/> Report</Button> : null}{isOwner ? <Button variant="outline" disabled={busy} onClick={changeStatus}>{status === "open" ? <><CircleOff/> Mark closed</> : <><CircleCheck/> Reopen</>}</Button> : null}</div><div className="flex gap-2"><Button variant="outline" onClick={() => { onClose(); onComments(post); }}><MessageCircle/> Ask in comments</Button>{post.type === "Activity" && status === "open" ? <Button onClick={() => { onClose(); onMatch(post); }} className="bg-[#17392B] text-white"><UsersRound/> Find a buddy</Button> : null}</div></DialogFooter>
  </DialogContent></Dialog>;
}
