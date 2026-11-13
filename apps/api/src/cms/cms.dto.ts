import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpsertCmsPageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  slug!: string;

  @IsIn(['ar', 'en'])
  locale!: 'ar' | 'en';

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  excerpt?: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

export class UpsertBannerDto {
  @IsString()
  @MaxLength(60)
  placement!: string;

  @IsIn(['ar', 'en'])
  locale!: 'ar' | 'en';

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  actionUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertFeatureFlagDto {
  @IsString()
  @MaxLength(80)
  key!: string;

  @IsString()
  @MaxLength(160)
  nameEn!: string;

  @IsString()
  @MaxLength(160)
  nameAr!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  audience?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  rolloutPercentage?: number;
}

export class UpsertAppVersionDto {
  @IsIn(['IOS', 'ANDROID'])
  platform!: 'IOS' | 'ANDROID';

  @IsString()
  @MaxLength(40)
  version!: string;

  @IsString()
  @MaxLength(40)
  buildNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  releaseNotes?: string;

  @IsString()
  @MaxLength(40)
  minSupportedVersion!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertSiteContentDto {
  @IsIn(['ar', 'en'])
  locale!: 'ar' | 'en';

  /**
   * The editable website document. It is validated structurally in the service
   * against the shared `SiteContent` shape; unknown keys are dropped and the
   * website merges the result over its approved defaults.
   */
  @IsObject()
  data!: Record<string, unknown>;
}

export class CreateApiClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimitPerMinute?: number;

  @IsOptional()
  @IsString({ each: true })
  scopes?: string[];
}
