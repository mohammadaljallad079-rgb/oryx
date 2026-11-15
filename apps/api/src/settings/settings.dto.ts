import { IsObject } from 'class-validator';

export class UpdateSettingsDto {
  /**
   * The namespace payload. Shape is validated against `@oryx/shared/settings.ts`
   * inside the service, where the per-namespace defaults live, so the DTO only
   * asserts that an object was sent.
   */
  @IsObject()
  value!: Record<string, unknown>;
}
