"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Globe2, LockKeyhole, Plus, ShieldCheck, Sparkles, UserPlus, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { StudentProfile } from "./profile";

export type CircleRecord = {
  id: string;
  name: string;
  description: string;
  visibility: "public" | "private";
  category: string;
  creatorName: string;
  creatorUserId?: string | null;
  memberCount: number;
};

export type CircleMembership = {
  id: string;
  circleId: string;
  circleName: string;
  memberName: string;
  memberInitials: string;
  memberUserId?: string | null;
  state: "pending" | "accepted";
  role: "member" | "owner";
};

type CirclesResponse = {error?:string;circles?:CircleRecord[];memberships?:CircleMembership[];incomingRequests?:CircleMembership[];membership:CircleMembership;circle:CircleRecord};

export const circleFixtures: CircleRecord[] = [
  { id: "c1", name: "AI Builders at Woxsen", description: "Share unfinished AI projects, find collaborators and build together every Friday.", visibility: "public", category: "Technology", creatorName: "Arjun K.", memberCount: 42 },
  { id: "c2", name: "Weekend Photowalks", description: "Casual campus photo walks for beginners, phone photographers and camera users.", visibility: "public", category: "Creative", creatorName: "Sahana R.", memberCount: 18 },
  { id: "c3", name: "Founders' Build Circle", description: "A small accountability circle for students actively validating or shipping an idea.", visibility: "private", category: "Entrepreneurship", creatorName: "Demo organiser", memberCount: 12 },
  { id: "c4", name: "Research Paper Sprint", description: "Weekly focused sessions for students preparing literature reviews, experiments or papers.", visibility: "private", category: "Research", creatorName: "Meera P.", memberCount: 16 },
];

export function CirclesView({ currentUser, memberships, onMembershipsChange }: { currentUser: StudentProfile | null; memberships: CircleMembership[]; onMembershipsChange: (memberships: CircleMembership[]) => void }) {
  const [customCircles, setCustomCircles] = useState<CircleRecord[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<CircleMembership[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", visibility: "public" as "public" | "private", category: "General" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/circles").then((response) => response.ok ? response.json() as Promise<CirclesResponse> : null).then((data) => {
      if (!data) return;
      if (Array.isArray(data.circles)) setCustomCircles(data.circles);
      if (Array.isArray(data.memberships)) onMembershipsChange(data.memberships);
      if (Array.isArray(data.incomingRequests)) setIncomingRequests(data.incomingRequests);
    }).catch(() => undefined);
  }, [currentUser?.userId, onMembershipsChange]);

  const circles = useMemo(() => [...customCircles, ...circleFixtures], [customCircles]);

  async function joinOrRequest(circle: CircleRecord, action: "join" | "request") {
    setError("");
    setBusy(`${circle.id}:${action}`);
    try {
      const response = await fetch("/api/circles/membership", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, circleId: circle.id }) });
      const data = await response.json() as CirclesResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not update this circle.");
      const entry = data.membership as CircleMembership;
      onMembershipsChange([...memberships.filter((item) => item.circleId !== entry.circleId), entry]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this circle.");
    } finally {
      setBusy(null);
    }
  }

  async function leaveCircle(circle: CircleRecord) {
    setError("");
    setBusy(`${circle.id}:leave`);
    try {
      const response = await fetch("/api/circles/membership", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "leave", circleId: circle.id }) });
      const data = await response.json() as CirclesResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not leave this circle.");
      onMembershipsChange(memberships.filter(item => item.circleId !== circle.id));
      setCustomCircles(current => current.map(item => item.id === circle.id ? { ...item, memberCount: Math.max(1, item.memberCount - 1) } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not leave this circle.");
    } finally {
      setBusy(null);
    }
  }

  async function reviewMembership(entry: CircleMembership, action: "approve" | "reject") {
    setError("");
    setBusy(`${entry.id}:${action}`);
    try {
      const response = await fetch("/api/circles/membership", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, membershipId: entry.id }) });
      const data = await response.json() as CirclesResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not review this request.");
      setIncomingRequests((current) => current.filter((item) => item.id !== entry.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not review this request.");
    } finally {
      setBusy(null);
    }
  }

  async function createCircle() {
    setError("");
    try {
      const response = await fetch("/api/circles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json() as CirclesResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not create the circle.");
      setCustomCircles([data.circle, ...customCircles]);
      onMembershipsChange([...memberships, data.membership]);
      setForm({ name: "", description: "", visibility: "public", category: "General" });
      setCreateOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the circle.");
    }
  }

  const acceptedCount = memberships.filter((item) => item.state === "accepted").length;
  const pendingCount = memberships.filter((item) => item.state === "pending").length;

  return <div className="space-y-5">
    <section className="overflow-hidden rounded-[1.5rem] bg-[#17392B] p-6 text-white sm:p-8">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.13em] text-[#D8FF48]">Circles</p><h1 className="mt-3 text-3xl font-bold tracking-[-0.055em] sm:text-4xl">Belong around an interest, not just a classroom.</h1><p className="mt-3 text-sm leading-6 text-[#C4D7C8] sm:text-base">Join open communities instantly or request access to smaller private groups. Only accepted memberships can become match reasons.</p></div>
        {currentUser ? <Button onClick={() => { setError(""); setCreateOpen(true); }} className="bg-[#D8FF48] text-[#17392B] hover:bg-[#C8F23C]"><Plus/> Create circle</Button> : <a href="/signin-with-chatgpt?return_to=%2F" target="_top" className="inline-flex h-10 items-center justify-center rounded-lg bg-[#D8FF48] px-4 text-sm font-semibold text-[#17392B]">Sign in to join</a>}
      </div><div className="mt-6 flex gap-3 border-t border-white/10 pt-5 text-sm"><span className="rounded-full bg-white/10 px-3 py-1.5"><b>{acceptedCount}</b> joined</span><span className="rounded-full bg-white/10 px-3 py-1.5"><b>{pendingCount}</b> pending</span></div>
    </section>

    {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
    <div className="flex items-end justify-between gap-3"><div><p className="text-sm font-semibold text-[#58705F]">Discover communities</p><h2 className="text-2xl font-bold tracking-[-0.04em]">Public and private circles</h2></div><div className="hidden items-center gap-2 text-xs text-[#607767] sm:flex"><Sparkles className="size-4 text-[#6A8B55]"/> Shared circles strengthen context</div></div>

    <div className="grid gap-3 sm:grid-cols-2">{circles.map((circle) => {
      const ownMembership = memberships.find((item) => item.circleId === circle.id);
      const isAccepted = ownMembership?.state === "accepted";
      const isPending = ownMembership?.state === "pending";
      return <article key={circle.id} className="flex flex-col rounded-[1.25rem] border border-[#D9E0CD] bg-white p-5 shadow-[0_8px_22px_rgba(34,55,34,0.035)]"><div className="flex items-start justify-between gap-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${circle.visibility === "public" ? "bg-[#EAF5D0] text-[#315E33]" : "bg-[#EADFff] text-[#56338E]"}`}>{circle.visibility === "public" ? <Globe2 className="size-3.5"/> : <LockKeyhole className="size-3.5"/>}{circle.visibility === "public" ? "Public" : "Private"}</span><span className="rounded-full bg-[#F1F4EB] px-2.5 py-1 text-xs font-medium text-[#58705F]">{circle.category}</span></div><h3 className="mt-4 text-xl font-bold tracking-[-0.035em]">{circle.name}</h3><p className="mt-2 flex-1 text-sm leading-6 text-[#607767]">{circle.description}</p><p className="mt-3 text-xs text-[#78907F]">Created by {circle.creatorName}</p><div className="mt-4 flex items-center justify-between border-t border-[#E8EDE2] pt-4"><div className="flex items-center gap-2 text-sm text-[#506A58]"><UsersRound className="size-4"/><b>{circle.memberCount}</b> members</div>{isAccepted ? ownMembership?.role === "owner" ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF5D0] px-3 py-2 text-sm font-bold text-[#315E33]"><ShieldCheck className="size-4"/> Owner</span> : <Button disabled={busy === `${circle.id}:leave`} onClick={() => leaveCircle(circle)} variant="outline"><X/> Leave</Button> : isPending ? <Button disabled variant="outline"><LockKeyhole/> Request pending</Button> : circle.visibility === "public" ? <Button disabled={!currentUser || busy === `${circle.id}:join`} onClick={() => joinOrRequest(circle, "join")} className="bg-[#17392B] text-white hover:bg-[#244A39]"><UserPlus/> Join</Button> : <Button disabled={!currentUser || busy === `${circle.id}:request`} onClick={() => joinOrRequest(circle, "request")} variant="outline" className="border-[#C8B8E6] text-[#56338E]"><LockKeyhole/> Request access</Button>}</div></article>;
    })}</div>

    <section className="rounded-[1.25rem] border border-[#D9E0CD] bg-white p-5"><div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-[#EADFff] text-[#56338E]"><ShieldCheck className="size-5"/></span><div><p className="text-xs font-bold uppercase tracking-[0.1em] text-[#7B6994]">Member approvals</p><h2 className="mt-1 text-lg font-bold">Private access requests</h2><p className="mt-1 text-sm text-[#607767]">Any accepted member can approve or reject a request to their private circle.</p></div></div>
      <div className="mt-4 space-y-3">{incomingRequests.length ? incomingRequests.map((entry) => <div key={entry.id} className="flex flex-col gap-3 rounded-xl bg-[#F5F8F0] p-4 sm:flex-row sm:items-center"><span className="grid size-10 place-items-center rounded-xl bg-[#17392B] text-xs font-bold text-white">{entry.memberInitials}</span><div className="flex-1"><p className="font-bold">{entry.memberName}</p><p className="text-sm text-[#607767]">Requested {entry.circleName}</p></div><div className="flex gap-2"><Button disabled={busy === `${entry.id}:reject`} onClick={() => reviewMembership(entry, "reject")} variant="outline"><X/> Reject</Button><Button disabled={busy === `${entry.id}:approve`} onClick={() => reviewMembership(entry, "approve")} className="bg-[#17392B] text-white"><Check/> Approve</Button></div></div>) : <p className="rounded-xl border border-dashed border-[#C7D6BD] p-5 text-sm text-[#607767]">No pending requests in your private circles.</p>}</div>
    </section>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Create a circle</DialogTitle><DialogDescription>Choose whether students can join immediately or must be approved by you.</DialogDescription></DialogHeader><div className="grid gap-3"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-10 rounded-lg border bg-white px-3 text-sm" placeholder="Circle name"/><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-24 rounded-lg border bg-white p-3 text-sm" placeholder="What brings this group together?"/><div className="grid gap-3 sm:grid-cols-2"><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="h-10 rounded-lg border bg-white px-3 text-sm"><option>General</option><option>Technology</option><option>Creative</option><option>Research</option><option>Entrepreneurship</option><option>Sports</option></select><select value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value as "public" | "private" })} className="h-10 rounded-lg border bg-white px-3 text-sm"><option value="public">Public · instant join</option><option value="private">Private · approval required</option></select></div>{error ? <p className="text-sm text-red-700">{error}</p> : null}</div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={createCircle} className="bg-[#17392B] text-white hover:bg-[#244A39]">Create circle</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
