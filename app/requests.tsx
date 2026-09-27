"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronRight, Clock3, Contact, MessageCircle, Send, ShieldCheck, UsersRound, X } from "lucide-react";
import {ConnectionChat} from "./connection-chat";
import { Button } from "@/components/ui/button";

type InviteState = "pending" | "accepted" | "declined" | "cancelled";
type Invite = {
  id: string;
  recipientName: string;
  activityTitle: string;
  openingMessage:string;otherUserId:string;
  senderName: string;
  state: InviteState;
  direction: "incoming" | "outgoing";
  senderSharedContact: boolean;
  recipientSharedContact: boolean;
  contactUnlocked: boolean;
  otherEmail: string | null;
  otherContacts:{platform:string;href:string}[];
  createdAt: number;
};

type RequestsResponse = {error?:string;incoming?:Invite[];outgoing?:Invite[]};

export function RequestsView({ refreshKey, onExplore, onCountChange }: { refreshKey: number; onExplore: () => void; onCountChange: (count: number) => void }) {
  const [incoming, setIncoming] = useState<Invite[]>([]);
  const [outgoing, setOutgoing] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/requests");
      const data = await response.json() as RequestsResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not load invitations.");
      setIncoming(data.incoming ?? []);
      setOutgoing(data.outgoing ?? []);
      onCountChange([...(data.incoming ?? []), ...(data.outgoing ?? [])].filter((entry: Invite) => entry.state === "pending").length);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load invitations.");
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    let active = true;
    fetch("/api/requests").then(async response => ({ ok: response.ok, data: await response.json() as RequestsResponse })).then(({ ok, data }) => {
      if (!active) return;
      if (!ok) throw new Error(data.error ?? "Could not load invitations.");
      setIncoming(data.incoming ?? []);
      setOutgoing(data.outgoing ?? []);
      onCountChange([...(data.incoming ?? []), ...(data.outgoing ?? [])].filter((entry: Invite) => entry.state === "pending").length);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not load invitations.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey, onCountChange]);

  async function act(requestId: string, action: "accept" | "decline" | "cancel" | "share-contact" | "revoke-contact") {
    setBusy(`${requestId}:${action}`);
    setError("");
    try {
      const response = await fetch("/api/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      const data = await response.json() as RequestsResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not update the invitation.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the invitation.");
    } finally {
      setBusy(null);
    }
  }

  const hasRequests = incoming.length + outgoing.length > 0;
  return <div className="space-y-5">
    <section className="rounded-[1.5rem] bg-[#17392B] p-7 text-white">
      <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#D8FF48]">Your introductions</p>
      <h1 className="mt-3 text-3xl font-bold tracking-[-0.05em]">Keep the first step low pressure.</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-[#C4D7C8]">Accept or decline privately. You can chat after acceptance. College email and social contacts stay private until both people choose to share.</p>
    </section>
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
    {loading ? <p className="rounded-xl bg-white p-5 text-sm text-[#607767]">Loading invitations…</p> : null}
    {!loading && !hasRequests ? <section className="rounded-[1.25rem] border border-dashed border-[#C7D6BD] bg-white p-10 text-center"><UsersRound className="mx-auto size-8 text-[#89A378]"/><h2 className="mt-3 font-bold">No invitations yet</h2><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#607767]">Start with an activity, then invite someone who has also chosen to join it.</p><Button onClick={onExplore} variant="outline" className="mt-5">Explore activities <ChevronRight/></Button></section> : null}
    {!loading && incoming.length ? <RequestGroup title="Incoming" description="You decide whether this introduction moves forward." requests={incoming} busy={busy} onAction={act}/> : null}
    {!loading && outgoing.length ? <RequestGroup title="Sent by you" description="The other student can answer without pressure." requests={outgoing} busy={busy} onAction={act}/> : null}
    {!loading && hasRequests ? <section className="flex gap-3 rounded-[1.25rem] border border-[#CFE0C1] bg-[#F3F9E8] p-4"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#4E7937]"/><div><p className="text-sm font-bold">Designed for consent</p><p className="mt-1 text-xs leading-5 text-[#55705C]">Pending requests can be declined or cancelled. Contact sharing is bilateral; contacts stay hidden when only one person opts in.</p></div></section> : null}
  </div>;
}

function RequestGroup({ title, description, requests, busy, onAction }: { title: string; description: string; requests: Invite[]; busy: string | null; onAction: (id: string, action: "accept" | "decline" | "cancel" | "share-contact" | "revoke-contact") => void }) {
  return <section className="space-y-3"><div><h2 className="text-xl font-bold tracking-[-0.03em]">{title}</h2><p className="text-sm text-[#607767]">{description}</p></div>{requests.map(request => <RequestCard key={request.id} request={request} busy={busy} onAction={onAction}/>)}</section>;
}

function RequestCard({ request, busy, onAction }: { request: Invite; busy: string | null; onAction: (id: string, action: "accept" | "decline" | "cancel" | "share-contact" | "revoke-contact") => void }) {
  const otherName = request.direction === "incoming" ? request.senderName : request.recipientName;
  const viewerShared = request.direction === "incoming" ? request.recipientSharedContact : request.senderSharedContact;
  const otherShared = request.direction === "incoming" ? request.senderSharedContact : request.recipientSharedContact;
  const status = statusStyle(request.state);
  const [chatOpen,setChatOpen]=useState(false);
  return <article className="rounded-[1.25rem] border border-[#D9E0CD] bg-white p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#EAF5D0] text-[#315E33]"><MessageCircle className="size-5"/></span>
      <div className="min-w-0 flex-1"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${status.className}`}>{status.icon}{status.label}</span><h3 className="mt-2 text-lg font-bold">{request.direction === "incoming" ? `${otherName} invited you` : `Invitation to ${otherName}`}</h3><p className="mt-1 text-sm text-[#607767]">{request.activityTitle}</p>{request.openingMessage&&<blockquote className="mt-3 rounded-xl bg-[#F5F8F0] p-3 text-base">{request.openingMessage}</blockquote>}<p className="mt-2 text-xs text-[#829386]">{new Date(Number(request.createdAt)).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p></div>
      {request.state === "pending" && request.direction === "incoming" ? <div className="flex gap-2"><Button variant="outline" disabled={busy !== null} onClick={() => onAction(request.id, "decline")}><X/> Decline</Button><Button disabled={busy !== null} onClick={() => onAction(request.id, "accept")} className="bg-[#17392B] text-white"><Check/> Accept</Button></div> : null}
      {request.state === "pending" && request.direction === "outgoing" ? <Button variant="outline" disabled={busy !== null} onClick={() => onAction(request.id, "cancel")}><X/> Cancel</Button> : null}
    </div>
    {request.state === "accepted" ? <div className="mt-4 rounded-xl bg-[#F5F8F0] p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex gap-3"><Contact className="mt-0.5 size-5 shrink-0 text-[#5A7B49]"/><div><p className="text-sm font-bold">Optional contact exchange</p>{request.contactUnlocked ? <p className="mt-1 break-all text-sm text-[#315E33]">{otherName}: <a className="font-bold underline" href={`mailto:${request.otherEmail}`}>{request.otherEmail}</a>{request.otherContacts?.map(c=><a key={c.platform+c.href} className="mt-2 block font-bold underline" href={c.href} target="_blank" rel="noopener noreferrer">{c.platform} profile</a>)}</p> : <p className="mt-1 text-xs leading-5 text-[#607767]">{viewerShared ? otherShared ? "Contact unlocked." : "You chose to share. Waiting for them." : otherShared ? "They chose to share. Share yours to unlock both." : "Neither person has shared contact yet."}</p>}</div></div>{!viewerShared ? <Button disabled={busy !== null} onClick={() => onAction(request.id, "share-contact")} className="bg-[#D8FF48] text-[#17392B] hover:bg-[#C8F23C]"><Send/> Share my contacts</Button> : <span className="inline-flex items-center gap-1 text-xs font-bold text-[#4D7540]"><Check className="size-4"/> You opted in<Button variant="outline" disabled={busy!==null} onClick={()=>onAction(request.id,"revoke-contact")}>Stop sharing</Button></span>}</div></div> : null}
    {request.state === "accepted" && <><Button variant="outline" className="mt-4" onClick={()=>setChatOpen(v=>!v)}>{chatOpen?"Close conversation":"Open conversation"}</Button>{chatOpen&&<ConnectionChat requestId={request.id} otherUserId={request.otherUserId}/>}</>}
  </article>;
}

function statusStyle(state: InviteState) {
  if (state === "accepted") return { label: "Accepted", icon: <Check className="size-3"/>, className: "bg-[#EAF5D0] text-[#315E33]" };
  if (state === "pending") return { label: "Pending", icon: <Clock3 className="size-3"/>, className: "bg-[#FFF0CC] text-[#76551A]" };
  return { label: state === "declined" ? "Declined" : "Cancelled", icon: <X className="size-3"/>, className: "bg-[#F1F3EE] text-[#617065]" };
}
