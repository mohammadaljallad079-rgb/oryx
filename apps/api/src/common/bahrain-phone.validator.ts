import { Transform } from 'class-transformer';
import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import { normaliseBahrainPhone, type PhoneNormalisationResult } from '@oryx/shared';

/**
 * Validates a Bahrain mobile number.
 *
 * The accepted forms and the rejection reasons live in
 * `packages/shared/src/bahrain.ts`; this constraint only adapts them to
 * class-validator so the API and the website cannot disagree about what a valid
 * Bahraini mobile number is.
 */
@ValidatorConstraint({ name: 'IsBahrainPhone', async: false })
export class IsBahrainPhoneConstraint implements ValidatorConstraintInterface {
  private lastReason: PhoneNormalisationResult['reason'] = 'empty';

  validate(value: unknown): boolean {
    // An absent optional number is not a malformed one.
    if (value === undefined || value === null || value === '') return true;
    if (typeof value !== 'string') {
      this.lastReason = 'not_a_number';
      return false;
    }
    const result = normaliseBahrainPhone(value);
    this.lastReason = result.reason;
    return result.valid;
  }

  defaultMessage(args: ValidationArguments): string {
    const detail: Record<NonNullable<PhoneNormalisationResult['reason']>, string> = {
      empty: 'must not be empty',
      not_a_number: 'must contain only digits, spaces or dashes',
      wrong_length: 'must be 8 digits (for example 3XXXXXXX)',
      wrong_prefix: 'must be a Bahrain mobile number beginning with 3',
      wrong_country: 'must be a Bahrain number (country code +973)',
    };
    return `${args.property} ${detail[this.lastReason ?? 'not_a_number']}`;
  }
}

export function IsBahrainPhone(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'IsBahrainPhone',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: IsBahrainPhoneConstraint,
    });
  };
}

/**
 * Stores the canonical E.164 form of a Bahrain number.
 *
 * Paired with `@IsBahrainPhone()`, which rejects a malformed value first, so
 * this never has to invent a fallback for bad input.
 */
export function NormaliseBahrainPhone(): PropertyDecorator {
  return Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const result = normaliseBahrainPhone(value);
    return result.valid ? result.e164 : value;
  });
}

