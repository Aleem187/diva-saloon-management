import Link from "next/link";
import type { Metadata } from "next";

import { ForgotPasswordForm } from "./forgot-password-form";
import { AuthCard } from "@/components/auth-shell";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter your email and we will send you a link to choose a new one."
    >
      <ForgotPasswordForm />

      <p className="mt-[18px] text-center text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
