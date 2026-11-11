import { Transform } from 'class-transformer';

/**
 * Trim a string before validation.
 *
 * Mobile keyboards and copy/paste routinely append a trailing space. Without
 * this, `@IsEmail()` rejects the value with a 400 "email must be an email"
 * before the service ever gets to normalise it — which reads to the user as a
 * broken login rather than a stray character.
 */
export const TrimString = (): PropertyDecorator =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/**
 * Accept a bare `YYYY-MM-DD` and promote it to a full ISO 8601 instant.
 *
 * A native `<input type="date">` yields `2026-12-01`, which `@IsISO8601()`
 * rejects ("startDate must be a valid ISO 8601 date string") even though the
 * value is a perfectly good calendar date. Rejecting it turns an ordinary form
 * submission into a 400 the user cannot act on. The value is normalised to the
 * start of the day in UTC before validation, so the stored instant is
 * unambiguous and the validator sees a complete timestamp. Anything that is not
 * a bare date (an empty string, a full timestamp, junk) is left untouched so
 * `@IsOptional` and the required-field checks still behave as written.
 */
const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const NormaliseIsoDate = (): PropertyDecorator =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return BARE_DATE.test(trimmed) ? `${trimmed}T00:00:00.000Z` : value;
  });
