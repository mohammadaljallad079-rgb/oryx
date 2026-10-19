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
