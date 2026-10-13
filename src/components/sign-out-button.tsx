/** POSTs to /auth/signout. Styled for the dark sidebar. */
export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="min-h-9 rounded-lg border border-side-line px-2.5 text-fine text-side-ink transition-colors hover:bg-side-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-side-ink"
      >
        Sign out
      </button>
    </form>
  );
}
