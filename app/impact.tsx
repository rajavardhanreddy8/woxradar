"use client";

import { useEffect, useState } from "react";
import { Activity, BarChart3, CheckCircle2, ShieldCheck, Target, UsersRound } from "lucide-react";

type ImpactData = {
  updatedAt: number;
  metrics: { completedProfiles: number; matchingUsers: number; realInvites: number; acceptedInvites: number; sharedContacts: number; circleMembers: number; campusPosts: number; weeklyActive: number };
  rates: { invitationAcceptance: number | null; contactUnlock: number | null };
  last7Days: { eventName: string; count: number }[];
  definitions: { realInvites: string; sharedContacts: string; weeklyActive: string };
};

const targets = [
  { key: "completedProfiles", label: "Completed profiles", target: 10 },
  { key: "matchingUsers", label: "Joined activity matching", target: 6 },
  { key: "realInvites", label: "Real invitations", target: 5 },
  { key: "acceptedInvites", label: "Accepted introductions", target: 2 },
  { key: "sharedContacts", label: "Mutual contact unlocks", target: 1 },
] as const;

export function ImpactView() {
  const [data, setData] = useState<ImpactData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/impact").then(async response => ({ ok: response.ok, data: await response.json() as ImpactData & {error?:string} })).then(({ ok, data }) => {
      if (!active) return;
      if (!ok) throw new Error(data.error ?? "Could not load pilot metrics.");
      setData(data);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Could not load pilot metrics."); });
    return () => { active = false; };
  }, []);

  return <div className="space-y-5">
    <section className="relative overflow-hidden rounded-[1.5rem] bg-[#17392B] p-6 text-white sm:p-8"><div className="relative z-10"><p className="text-xs font-bold uppercase tracking-[0.13em] text-[#D8FF48]">Pilot evidence</p><h1 className="mt-3 text-3xl font-bold tracking-[-0.05em]">Measure useful connections, not vanity.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#C4D7C8]">This dashboard counts real authenticated actions. Fictional example profiles and their preview invitations never enter the evidence funnel.</p></div><BarChart3 className="absolute -bottom-7 -right-5 size-40 text-white/5"/></section>
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
    {!data && !error ? <p className="rounded-xl bg-white p-5 text-sm text-[#607767]">Calculating pilot metrics…</p> : null}
    {data ? <>
      <section className="grid gap-3 sm:grid-cols-3"><Metric icon={<UsersRound/>} label="Weekly active students" value={data.metrics.weeklyActive}/><Metric icon={<CheckCircle2/>} label="Invitation acceptance" value={displayRate(data.rates.invitationAcceptance)}/><Metric icon={<ShieldCheck/>} label="Mutual contact unlock" value={displayRate(data.rates.contactUnlock)}/></section>
      <section className="rounded-[1.25rem] border border-[#D9E0CD] bg-white p-5 sm:p-6">
        <div className="flex items-center gap-3"><Target className="size-5 text-[#557B3E]"/><div><h2 className="font-bold">Minimum convincing pilot</h2><p className="text-sm text-[#607767]">Small enough to finish; strong enough to support the submission story.</p></div></div>
        <div className="mt-5 space-y-4">{targets.map((item, index) => {
          const value = data.metrics[item.key];
          const done = value >= item.target;
          return <div key={item.key} className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-3">
            <span className={`grid size-7 place-items-center rounded-full text-xs font-bold ${done ? "bg-[#D8FF48] text-[#17392B]" : "bg-[#EFF3E9] text-[#708073]"}`}>{done ? <CheckCircle2 className="size-4"/> : index + 1}</span>
            <div><div className="flex justify-between gap-3 text-sm"><span className="font-semibold">{item.label}</span><span className="text-[#607767]">{value}/{item.target}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#EEF2E9]"><div className="h-full rounded-full bg-[#79A65A]" style={{ width: `${Math.min(100, (value / item.target) * 100)}%` }}/></div></div>
          </div>;
        })}</div>
      </section>
      <section className="grid gap-3 sm:grid-cols-3"><SmallMetric label="Campus posts" value={data.metrics.campusPosts}/><SmallMetric label="Circle members" value={data.metrics.circleMembers}/><SmallMetric label="Feed actions · 7 days" value={data.last7Days.reduce((sum, event) => sum + Number(event.count), 0)}/></section>
      <section className="rounded-[1.25rem] border border-[#D7C990] bg-[#FFFBEA] p-5"><div className="flex gap-3"><Activity className="mt-0.5 size-5 shrink-0 text-[#7B6526]"/><div><h2 className="font-bold text-[#5E4D1F]">How to read this honestly</h2><ul className="mt-2 space-y-1.5 text-sm leading-6 text-[#6A5A25]"><li><b>Real invitation:</b> {data.definitions.realInvites}</li><li><b>Connection outcome:</b> {data.definitions.sharedContacts}</li><li><b>Weekly active:</b> {data.definitions.weeklyActive}</li></ul><p className="mt-3 text-xs text-[#8A773A]">Last refreshed {new Date(data.updatedAt).toLocaleString()}.</p></div></div></section>
    </> : null}
  </div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) { return <article className="rounded-[1.25rem] border border-[#D9E0CD] bg-white p-5"><span className="grid size-10 place-items-center rounded-xl bg-[#EAF5D0] text-[#315E33]">{icon}</span><p className="mt-5 text-3xl font-bold tracking-[-0.05em]">{value}</p><p className="mt-1 text-sm text-[#607767]">{label}</p></article>; }
function SmallMetric({ label, value }: { label: string; value: number }) { return <article className="rounded-xl border border-[#D9E0CD] bg-white p-4"><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-xs font-semibold text-[#607767]">{label}</p></article>; }
function displayRate(value: number | null) { return value === null ? "—" : `${value}%`; }
