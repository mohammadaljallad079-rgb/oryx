/**
 * Option filtering for the searchable `Select`.
 *
 * A select whose list is long enough to scroll — the 29 vehicle makes, the
 * models under one make, the model years — carries a filter field. The match
 * runs over the label, the sublabel and the option's own `keywords`, so a
 * search can find a record by a term that is not displayed: "merc" finds
 * "Mercedes-Benz" (through the keyword) and an Arabic typist finds the Arabic
 * label without switching the app locale.
 *
 * Pure and locale-independent: the caller passes the already-localised label.
 */

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  /** Extra search terms that are not part of the visible label. */
  keywords?: string;
}

/**
 * The options a query leaves. An empty or whitespace-only query returns the
 * whole list, because a fresh sheet must not hide the very option the user came
 * back to change.
 */
export function filterOptions(options: SelectOption[], query: string): SelectOption[] {
  const term = query.trim().toLowerCase();
  if (term.length === 0) return options;
  return options.filter((option) =>
    `${option.label} ${option.sublabel ?? ''} ${option.keywords ?? ''}`.toLowerCase().includes(term),
  );
}
