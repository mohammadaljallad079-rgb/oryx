import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * A per-company identity update.
 *
 * The tri-state is deliberate and is why these are not simply `@IsOptional`:
 *
 *   key omitted      -> leave the stored value alone
 *   key = null       -> clear it, inheriting the platform default
 *   key = a value    -> set it
 *
 * `class-validator` cannot express "null is allowed but only to clear", so the
 * colour fields accept a string here and `BrandingService.validateColor` does
 * the strict `#rrggbb` check, which is also where the CSS-injection guard lives.
 */
export class UpdateBrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nameAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  logoAssetId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  logoDarkAssetId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  faviconAssetId?: string | null;

  /** Strict `#rrggbb`. Validated again in the service before storage. */
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'primaryColor must be a 6-digit hex colour such as #d4af37' })
  primaryColor?: string | null;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accentColor must be a 6-digit hex colour such as #d4af37' })
  accentColor?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supportEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  supportPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  websiteUrl?: string | null;
}
