import Link from "next/link";
import type { Metadata } from "next";

import { SignupForm } from "./signup-form";
import { AUTH_TABS, AuthCard } from "@/components/auth-shell";
import { RouteTabs } from "@/components/ui/route-tabs";

export const metadata: Metadata = { title: "Create your salon" };

export default function SignupPage() {
  return (
    <>
      <RouteTabs tabs={AUTH_TABS} active="/signup" label="Account screens" />
      <AuthCard
        title="Create your salon account"
        subtitle="Set up your salon in under two minutes. One account per location."
      >
        <SignupForm />

        <p className="mt-[18px] text-center text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </AuthCard>
    </>
  );
}
