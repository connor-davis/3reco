/**
 * The rough area for a new wanted post, taken from the business profile:
 * "City, Province". If only one is set, that one alone. The street address and
 * area code never go in, because a wanted post is shown to other businesses.
 */
export function roughArea(
  profile?: { city?: string | null; province?: string | null } | null
): string {
  return [profile?.city, profile?.province]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * What to put in the area box now, or null to leave it alone. It only fills a
 * box that is empty and that the person has not typed in, so a profile that
 * loads late never overwrites their words.
 */
export function areaToPrefill(
  current: string,
  touched: boolean,
  suggested: string
): string | null {
  return !touched && current === '' && suggested ? suggested : null;
}
