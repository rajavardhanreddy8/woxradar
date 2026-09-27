"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Compass, ShieldCheck, UsersRound } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export function SignInPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const redirectTo = typeof window === "undefined" ? undefined : `${window.location.origin}/auth/callback`;

  async function resendConfirmation() {
    const normalized = email.trim().toLowerCase();
    if (!normalized.endsWith("@woxsen.edu.in")) { setMessage("Enter your @woxsen.edu.in email address first."); return; }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await createSupabaseBrowserClient().auth.resend({
        type: "signup",
        email: normalized,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setMessage("A fresh confirmation link was sent to your Woxsen inbox. Check spam too.");
      setCanResend(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not resend the confirmation email. Please try again shortly.");
    } finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(""); setCanResend(false);
    const normalized = email.trim().toLowerCase();
    if (!normalized.endsWith("@woxsen.edu.in")) { setMessage("Use your @woxsen.edu.in email address."); return; }
    if (password.length < 8) { setMessage("Use a password with at least 8 characters."); return; }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({ email: normalized, password });
      if (!signInError && signedIn.session) { window.location.assign("/?setup=1"); return; }
      if (signInError && !/invalid login credentials|email not confirmed/i.test(signInError.message)) throw signInError;
      const { error: signUpError } = await supabase.auth.signUp({ email: normalized, password, options: { emailRedirectTo: redirectTo } });
      if (signUpError) throw signUpError;
      setMessage("Check your Woxsen inbox to confirm your account. You must use the confirmation link before signing in.");
      setCanResend(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in. Please try again.");
    } finally { setBusy(false); }
  }
  return <section className="mx-auto max-w-2xl rounded-3xl border border-[#D9E0CD] bg-white p-6 sm:p-10">
    <span className="inline-flex items-center gap-2 text-sm font-bold text-[#315E33]"><Compass className="size-5"/> WoxRadar · Woxsen pilot</span>
    <h1 className="mt-5 text-3xl font-bold tracking-tight text-[#17392B]">Meet through something you both want to do.</h1>
    <p className="mt-4 text-base leading-7 text-[#607767]">Sign in, verify your @woxsen.edu.in inbox, and discover shared interests beyond your class.</p>
    <form onSubmit={submit} className="mt-7 grid gap-3">
      <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required placeholder="you@woxsen.edu.in" className="min-h-12 rounded-xl border border-[#D9E0CD] px-4 text-base" />
      <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required minLength={8} placeholder="Password (8+ characters)" className="min-h-12 rounded-xl border border-[#D9E0CD] px-4 text-base" />
      <button disabled={busy} className="inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-[#17392B] px-5 text-base font-semibold text-white disabled:opacity-60">{busy ? "Working…" : "Sign in or create account"} <ArrowRight className="size-4"/></button>
      {message ? <p role="status" className="text-sm leading-6 text-[#315E33]">{message}</p> : null}
      {canResend ? <button type="button" disabled={busy} onClick={()=>void resendConfirmation()} className="justify-self-start text-sm font-semibold text-[#315E33] underline disabled:opacity-60">Resend Woxsen confirmation email</button> : null}
    </form>
    <div className="mt-8 grid gap-5 border-t border-[#D9E0CD] pt-6 sm:grid-cols-2"><div><UsersRound className="size-5 text-[#315E33]"/><h2 className="mt-2 font-bold">An introduction at your pace</h2><p className="mt-1 text-sm leading-6 text-[#607767]">Everyday interests, optional questions, and saved drafts.</p></div><div><ShieldCheck className="size-5 text-[#315E33]"/><h2 className="mt-2 font-bold">Your choice to be discovered</h2><p className="mt-1 text-sm leading-6 text-[#607767]">Discovery starts off. Contact sharing needs both people’s consent.</p></div></div>
    <p className="mt-6 text-sm leading-6 text-[#607767]">Use your Woxsen email to create an account. After confirmation, complete the introduction questions before accessing campus features.</p>
    <a href="/" className="mt-5 inline-block min-h-11 py-2 text-sm font-semibold text-[#315E33] underline">Back to WoxRadar</a>
  </section>;
}
