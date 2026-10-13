import Link from "next/link";
import type { Metadata } from "next";

import { LoginForm } from "./login-form";
import { AUTH_TABS, AuthCard } from "@/components/auth-shell";
import { Flash } from "@/components/ui/flash";
import { RouteTabs } from "@/components/ui/route-tabs";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const confirmed = params.confirmed === "1";
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <>
      <RouteTabs tabs={AUTH_TABS} active="/login" label="Account screens" />
      <AuthCard title="Welcome back" subtitle="Sign in to your salon dashboard.">
        {confirmed ? (
          <Flash tone="success" className="mb-4">
            Email confirmed. You can sign in now.
          </Flash>
        ) : null}

        {error ? (
          <Flash tone="error" className="mb-4">
            {error}
          </Flash>
        ) : null}

        <LoginForm next={next} />

        <p className="mt-[18px] text-center text-muted">
          New here?{" "}
          <Link href="/signup" className="font-semibold text-accent hover:underline">
            Create your salon account
          </Link>
        </p>
      </AuthCard>
    </>
  );
}
