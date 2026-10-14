"use client";

import { useEffect } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * The safety net for every dashboard page: a page or tab that throws shows this
 * inside the dashboard, with the menu still in place, instead of Next's bare
 * "This page couldn't load". The message is deliberately generic -- the real
 * error stays in the server log, identified by the digest -- so nothing internal
 * reaches the screen.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] a page failed to render:", error);
  }, [error]);

  return (
    <Card role="alert" className="mx-auto max-w-xl space-y-3 text-center">
      <h1 className="font-heading text-section font-semibold">This page could not load</h1>
      <p className="text-muted">
        Something went wrong on our side while loading it. Nothing you entered was lost or changed.
        Try again, and if it keeps happening let the salon owner know.
      </p>
      {error.digest ? (
        <p className="text-fine text-muted">Reference: {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <ButtonLink href="/dashboard" variant="ghost">
          Back to Overview
        </ButtonLink>
      </div>
    </Card>
  );
}
