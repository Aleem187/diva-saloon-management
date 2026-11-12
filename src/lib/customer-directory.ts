/*
 * The salon's customers, held in the browser for instant search.
 *
 * Searching on the server costs a full round trip per pause (the session is
 * re-checked on every Server Action), which is what made the till's customer box
 * feel slow. A salon with a few thousand customers can simply hand the list to the
 * page: it is the same rows the customer search already returns, for the same
 * signed-in user, and the match rule below is the one search_customers() applies
 * in Postgres. Above DIRECTORY_MAX the page sends nothing and the box searches on
 * the server as before.
 *
 * Not a "use client" module: the server page imports DIRECTORY_MAX, the picker
 * imports the matcher (CLAUDE.md rule 9).
 */

/** Largest customer list worth sending to the browser (about 100 KB). */
export const DIRECTORY_MAX = 2000;

export interface DirectoryCustomer {
  id: string;
  full_name: string;
  phone: string;
  /** Digits only, as stored in customers.phone_normalized. */
  phone_normalized: string;
}

/**
 * The same rule as search_customers(): a name containing the text, or, when the text
 * holds at least three digits, a phone containing those digits. Sorted by name.
 */
export function searchDirectory(
  directory: DirectoryCustomer[],
  query: string,
  limit: number,
): { id: string; full_name: string; phone: string }[] {
  const text = query.trim().toLowerCase();
  if (!text) return [];
  const digits = query.replace(/[^0-9]/g, "");
  const byPhone = digits.length >= 3;

  const found: DirectoryCustomer[] = [];
  for (const customer of directory) {
    if (
      customer.full_name.toLowerCase().includes(text) ||
      (byPhone && customer.phone_normalized.includes(digits))
    ) {
      found.push(customer);
    }
  }
  found.sort((a, b) => a.full_name.localeCompare(b.full_name));
  return found.slice(0, limit).map(({ id, full_name, phone }) => ({ id, full_name, phone }));
}
