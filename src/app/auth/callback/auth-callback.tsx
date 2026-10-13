"use client";

import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { ButtonLink } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { Spinner } from "@/components/ui/spinner";

/** Only ever navigate within this app, never to a caller-supplied origin. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export function AuthCallback() {
  const [problem, setProblem] = useState<string | null>(null);
  // React runs effects twice in development; the token is one-time, so a
  // second exchange would fail and overwrite a perfectly good session.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const supabase = createClient();
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

    /*
     * The destination. `type` comes from whichever half of the link carried
     * it -- an invited user has no password yet, so they go and set one
     * rather than to the dashboard.
     */
    const type = params.get("type") ?? hash.get("type");
    const next = safeNext(params.get("next") ?? hash.get("next"));
    const destination = type === "invite" ? "/accept-invite" : next;

    async function complete() {
      // GoTrue reports its own failures in the query or the fragment.
      const failed = params.get("error_description") ?? hash.get("error_description");
      if (failed) return failed;

      // 1. Implicit flow: the session arrives in the fragment. This is what
      //    Supabase's DEFAULT invite and recovery emails produce.
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        return error?.message ?? null;
      }

      // 2. PKCE: an authorisation code in the query.
      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        return error?.message ?? null;
      }

      // 3. A customised email template using {{ .TokenHash }}.
      const tokenHash = params.get("token_hash");
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          type: type as "invite" | "recovery" | "email" | "signup" | "email_change",
          token_hash: tokenHash,
        });
        return error?.message ?? null;
      }

      return "This link did not carry a sign-in token. It may have already been used.";
    }

    complete().then((failure) => {
      if (failure) {
        setProblem(failure);
        return;
      }
      /*
       * A full navigation, not a client-side push: the session cookie was
       * just written, and the next page is server-rendered from it. A soft
       * navigation can render from a cache that predates the cookie.
       */
      window.location.replace(destination);
    });
  }, []);

  if (problem) {
    return (
      <>
        <h1 className="mb-4 font-heading text-kpi font-semibold tracking-[-0.01em]">
          This link could not be used
        </h1>
        <Flash tone="error">
          <p>{problem}</p>
          <p className="mt-1">
            Invitation and password links expire, and each one works only once. Ask your
            salon owner to send a new invitation.
          </p>
        </Flash>
        <p className="mt-5 text-center text-muted">Already set up?</p>
        <ButtonLink href="/login" variant="ghost" className="mt-2 w-full">
          Sign in
        </ButtonLink>
      </>
    );
  }

  return (
    <div className="py-2 text-center">
      <Spinner size="lg" className="mb-[18px]" />
      <h1 className="mb-1.5 font-heading text-kpi font-semibold tracking-[-0.01em]">
        Signing you in…
      </h1>
      <p role="status" className="text-muted">
        Checking your email link. You&rsquo;ll be taken to your dashboard in a moment.
      </p>
    </div>
  );
}
