"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, Flag, LogOut, Send, ShieldAlert, Sparkles, UserCheck, UserX, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { StudentProfile } from "./profile";

type Activity = { id: string; title: string };
type Match = { userId: string | null; displayName: string; initials: string; school: string; course: string; year: string; rank: number; reasons: string[]; conversationStarter?: string; icebreaker?: {prompt:string;answer:string} | null; demo?: boolean };

type MatchesResponse = {error?:string;matches?:Match[];unavailableActivity?:boolean;viewerOptedIn?:boolean;needsProfile?:boolean;discoveryDisabled?:boolean;interestedCount?:number};

const demoMatches: Match[] = [
  { userId: null, displayName: "Aanya N.", initials: "AN", school: "School of Technology", course: "B.Tech CSE", year: "3", rank: 1, reasons: ["Both opted into this activity", "Shared circle: Founders' Build Circle", "Shared interests: AI, Product", "Available: Friday evening"], demo: true },
  { userId: null, displayName: "Arjun K.", initials: "AK", school: "School of Arts and Design", course: "B.Des", year: "2", rank: 2, reasons: ["Both opted into this activity", "Shared interests: AI, Photography", "Comfortable with small group"], demo: true },
  { userId: null, displayName: "Sahana R.", initials: "SR", school: "School of Business", course: "BBA", year: "4", rank: 3, reasons: ["Both opted into this activity", "Available: Weekday evenings", "Both open to meeting across schools"], demo: true },
];

export function MatchesView({ activity, viewer, invite, onInvite, onOpenProfile }: { activity: Activity; viewer: StudentProfile | null; invite: string | null; onInvite: (name: string, userId: string | null,openingMessage:string) => Promise<void>; onOpenProfile: () => void }) {
  const [openings,setOpenings]=useState<Record<string,string>>({});
  const [matches, setMatches] = useState<Match[]>([]);
  const [viewerOptedIn, setViewerOptedIn] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [discoveryDisabled, setDiscoveryDisabled] = useState(false);
  const [interestedCount, setInterestedCount] = useState(0);
  const [unavailableActivity, setUnavailableActivity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [safetyTarget, setSafetyTarget] = useState<{ person: Match; kind: "block" | "report" } | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [safetyBusy, setSafetyBusy] = useState(false);

  async function load() {
    if (!viewer) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/matches?postId=${encodeURIComponent(activity.id)}`);
      const data = await response.json() as MatchesResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not load matches.");
      setUnavailableActivity(Boolean(data.unavailableActivity));
      setMatches(data.matches ?? []);
      setViewerOptedIn(Boolean(data.viewerOptedIn));
      setNeedsProfile(Boolean(data.needsProfile));
      setDiscoveryDisabled(Boolean(data.discoveryDisabled));
      setInterestedCount(Number(data.interestedCount ?? 0));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load matches.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!viewer) return;
    let active = true;
    fetch(`/api/matches?postId=${encodeURIComponent(activity.id)}`).then(async response => ({ ok: response.ok, data: await response.json() as MatchesResponse })).then(({ ok, data }) => {
      if (!active) return;
      if (!ok) throw new Error(data.error ?? "Could not load matches.");
      setUnavailableActivity(Boolean(data.unavailableActivity));
      setMatches(data.matches ?? []);
      setViewerOptedIn(Boolean(data.viewerOptedIn));
      setNeedsProfile(Boolean(data.needsProfile));
      setDiscoveryDisabled(Boolean(data.discoveryDisabled));
      setInterestedCount(Number(data.interestedCount ?? 0));
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not load matches.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [activity.id, viewer]);

  async function joinMatching() {
    setJoining(true);
    setError("");
    try {
      const response = await fetch("/api/matches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: activity.id, activityTitle: activity.title }) });
      const data = await response.json() as MatchesResponse;
      if (!response.ok) {
        if (data.needsProfile) setNeedsProfile(true);
        throw new Error(data.error ?? "Could not join activity matching.");
      }
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not join activity matching.");
    } finally {
      setJoining(false);
    }
  }

  async function leaveMatching() {
    setLeaving(true);
    setError("");
    try {
      const response = await fetch("/api/matches", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: activity.id }) });
      const data = await response.json() as MatchesResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not leave activity matching.");
      setViewerOptedIn(false);
      setMatches([]);
      setInterestedCount(count => Math.max(0, count - 1));
      setNotice("You left this activity's matching pool. You will no longer be suggested here.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not leave activity matching.");
    } finally {
      setLeaving(false);
    }
  }

  async function submitSafetyAction() {
    if (!safetyTarget?.person.userId) return;
    if (safetyTarget.kind === "report" && reportReason.trim().length < 8) {
      setError("Please add a short reason so the report can be reviewed.");
      return;
    }
    setSafetyBusy(true);
    setError("");
    try {
      const response = await fetch("/api/safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safetyTarget.kind === "block"
          ? { kind: "block", targetUserId: safetyTarget.person.userId }
          : { kind: "report", targetUserId: safetyTarget.person.userId, targetType: "user", targetId: safetyTarget.person.userId, reason: reportReason }),
      });
      const data = await response.json() as MatchesResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not save the safety action.");
      if (safetyTarget.kind === "block") setMatches(current => current.filter(person => person.userId !== safetyTarget.person.userId));
      setNotice(safetyTarget.kind === "block" ? `${safetyTarget.person.displayName} is blocked and removed from your matches.` : "Report received. It is now in the moderation queue.");
      setSafetyTarget(null);
      setReportReason("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the safety action.");
    } finally {
      setSafetyBusy(false);
    }
  }

  if (!viewer) return <section className="rounded-[1.5rem] border border-[#D9E0CD] bg-white p-8 text-center"><UsersRound className="mx-auto size-8 text-[#6D8D5B]"/><h1 className="mt-4 text-2xl font-bold">Sign in to find someone to go with</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#607767]">Sign in, finish your introduction and choose whether to be discoverable.</p><a href="/login" target="_top" className="mt-5 inline-flex h-10 items-center rounded-lg bg-[#17392B] px-4 text-sm font-semibold text-white">Sign in</a></section>;

  return <><div className="space-y-5">
    <section className="rounded-[1.5rem] border border-[#D9E0CD] bg-white p-6 sm:p-8"><div className="flex flex-col justify-between gap-5 sm:flex-row"><div><span className="rounded-full bg-[#EAF5D0] px-2.5 py-1 text-xs font-bold text-[#315E33]">Activity buddy</span><h1 className="mt-3 text-3xl font-bold tracking-[-0.05em]">People to meet at<br/>{activity.title}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#607767]">Candidates must opt in, pass both students&apos; discovery settings and share a comfortable meeting format.</p></div><div className="rounded-2xl bg-[#17392B] p-4 text-white sm:w-52"><Sparkles className="size-5 text-[#D8FF48]"/><p className="mt-6 text-sm font-semibold">Explainable ranking</p><p className="mt-1 text-xs leading-5 text-[#C4D7C8]">Shared goals, interests, meeting options and curiosity. Optional answers add context; they are not a personality test.</p></div></div></section>

    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl border border-[#CFE0C1] bg-[#F3F9E8] px-4 py-3 text-sm text-[#315E33]">{notice}</p> : null}
    {loading ? <p className="rounded-xl bg-white p-5 text-sm text-[#607767]">Checking eligible students…</p> : null}

    {!loading && (needsProfile || discoveryDisabled) ? <section className="rounded-[1.25rem] border border-[#D9E0CD] bg-white p-6"><UserCheck className="size-7 text-[#5E7E49]"/><h2 className="mt-3 text-xl font-bold">{needsProfile ? "Complete your profile first" : "Turn discovery back on"}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#607767]">Matching needs interests, broad availability and comfortable meeting formats so every suggestion has a truthful reason.</p><Button onClick={onOpenProfile} className="mt-4 bg-[#17392B] text-white">Open profile <ChevronRight/></Button></section> : null}

    {!loading && !error && !unavailableActivity && !needsProfile && !discoveryDisabled && !viewerOptedIn ? <section className="rounded-[1.25rem] border border-[#BFD4AE] bg-[#F3F9E8] p-6"><h2 className="text-xl font-bold">Join this activity&apos;s matching pool</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#55705C]">Only other students who also opt into this activity can be suggested. You can remain hidden everywhere else.</p><Button onClick={joinMatching} disabled={joining} className="mt-4 bg-[#17392B] text-white"><UsersRound/> {joining ? "Joining…" : "I want someone to go with"}</Button></section> : null}

    {!loading && !error && unavailableActivity ? <p className="rounded-xl border border-[#D7C990] bg-[#FFFBEA] p-5 text-base leading-7 text-[#6A5A25]">This activity is an example, closed, or no longer available. Publish or choose an open campus activity from Explore to start real matching.</p> : null}
    {!loading && !error && viewerOptedIn ? <><div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-[#58705F]">{Math.max(interestedCount, matches.length + 1)} eligible in this pool</p><h2 className="text-2xl font-bold tracking-[-0.04em]">Eligible people, ranked by context</h2></div><Button variant="outline" disabled={leaving} onClick={leaveMatching}><LogOut/> {leaving ? "Leaving…" : "Leave matching"}</Button></div>
      {!matches.length ? <p className="rounded-xl border border-[#D7C990] bg-[#FFFBEA] p-4 text-sm leading-6 text-[#6A5A25]"><b>No other pilot profile is eligible yet.</b> Try again after more students join this activity. The cards below are examples; you cannot invite them.</p> : null}
      <div className="space-y-3">{(matches.length ? matches : demoMatches).map((person) => <article key={`${person.userId ?? "demo"}:${person.displayName}`} className="rounded-[1.25rem] border border-[#D9E0CD] bg-white p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#17392B] font-bold text-white">{person.initials}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{person.displayName}</h3>{person.rank === 1 ? <span className="rounded-full bg-[#D8FF48] px-2 py-0.5 text-[11px] font-bold text-[#17392B]">Strongest context</span> : null}{person.demo ? <span className="rounded-full bg-[#FFF0CC] px-2 py-0.5 text-[11px] font-bold text-[#76551A]">Example profile</span> : null}</div><p className="mt-0.5 text-sm text-[#607767]">{person.course} · Year {person.year} · {person.school}</p><div className="mt-3 grid gap-2 rounded-xl bg-[#F5F8F0] p-3">{person.reasons.map((reason) => <p key={reason} className="flex gap-2 text-sm text-[#48604F]"><Check className="mt-0.5 size-4 shrink-0 text-[#5A8E3C]"/>{reason}</p>)}</div>{person.conversationStarter ? <p className="mt-3 rounded-xl border border-[#D9E0CD] p-3 text-sm leading-6"><b>Try asking: </b>{person.conversationStarter}</p> : null}{person.icebreaker ? <blockquote className="mt-3 rounded-xl bg-[#EAF5D0] p-3"><p className="text-sm font-semibold">{person.icebreaker.prompt}</p><p className="mt-1 break-words text-sm leading-6">{person.icebreaker.answer}</p></blockquote> : null}{!person.demo&&<label className="mt-3 grid gap-2 text-sm font-semibold">Your first message<textarea maxLength={240} rows={2} className="rounded-xl border bg-white p-3 text-base" value={openings[person.userId??""]??person.conversationStarter??""} onChange={e=>setOpenings(v=>({...v,[person.userId??""]:e.target.value}))}/></label>}{!person.demo ? <div className="mt-2 flex gap-1"><button type="button" onClick={() => setSafetyTarget({ person, kind: "block" })} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#66756A] hover:bg-[#F1F3EE]"><UserX className="size-3.5"/> Block</button><button type="button" onClick={() => setSafetyTarget({ person, kind: "report" })} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#66756A] hover:bg-[#F1F3EE]"><Flag className="size-3.5"/> Report</button></div> : null}</div><Button disabled={person.demo || invite === person.displayName} onClick={async () => { setError(""); try { await onInvite(person.displayName, person.userId,openings[person.userId??""]??person.conversationStarter??""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send the invitation."); } }} className="bg-[#17392B] text-white hover:bg-[#244A39]">{person.demo ? "Example only" : invite === person.displayName ? <><Check/> Invitation sent</> : <><Send/> Invite</>}</Button></div></article>)}</div></> : null}
  </div><Dialog open={Boolean(safetyTarget)} onOpenChange={open => { if (!open) { setSafetyTarget(null); setReportReason(""); } }}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldAlert className="size-5 text-[#A3483D]"/>{safetyTarget?.kind === "block" ? `Block ${safetyTarget.person.displayName}?` : `Report ${safetyTarget?.person.displayName}?`}</DialogTitle><DialogDescription>{safetyTarget?.kind === "block" ? "You will no longer be suggested to each other, and pending and accepted invitations between you will be cancelled. You can unblock them later." : "Tell the moderation team what happened. The other student is not notified that you made a report."}</DialogDescription></DialogHeader>{safetyTarget?.kind === "report" ? <div><label htmlFor="report-reason" className="text-sm font-bold">Reason</label><textarea id="report-reason" value={reportReason} onChange={event => setReportReason(event.target.value)} maxLength={500} className="mt-2 min-h-28 w-full rounded-xl border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-[#8AA470]" placeholder="Describe the concern in a few words…"/><p className="mt-1 text-right text-xs text-[#78907F]">{reportReason.length}/500</p></div> : null}<DialogFooter><Button variant="outline" onClick={() => setSafetyTarget(null)}>Go back</Button><Button disabled={safetyBusy || (safetyTarget?.kind === "report" && reportReason.trim().length < 8)} onClick={submitSafetyAction} className="bg-[#9F3E34] text-white hover:bg-[#853129]">{safetyBusy ? "Saving…" : safetyTarget?.kind === "block" ? "Block student" : "Submit report"}</Button></DialogFooter></DialogContent></Dialog></>;
}
