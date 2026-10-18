import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
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

// ------------------------------------------------------- Execution 07: media

export class UpsertMediaFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug may contain lowercase letters, digits and dashes only.' })
  slug!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateMediaAssetDto {
  @IsOptional()
  @IsString()
  folderId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  altAr?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  altEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  caption?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  credit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  licenseNote?: string | null;

  @IsOptional()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  focalX?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  focalY?: number;
}

export class UploadMediaDto {
  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  altAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  altEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  caption?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  credit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  licenseNote?: string;

  /** Comma-separated, because multipart form fields are strings. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  tags?: string;

  @IsOptional()
  @IsString()
  focalX?: string;

  @IsOptional()
  @IsString()
  focalY?: string;
}

// ----------------------------------------------------- Execution 07: content

export class UpsertContentBlockDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Matches(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, {
    message: 'Key must be a dot-separated lowercase identifier, e.g. home.hero.title.',
  })
  key!: string;

  @IsIn(['ar', 'en'])
  locale!: 'ar' | 'en';

  @IsString()
  @MaxLength(4000)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string | null;

  @IsOptional()
  @IsString()
  mediaAssetId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  linkUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  linkLabel?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class PublishContentDto {
  @IsBoolean()
  isPublished!: boolean;
}

export class RestoreRevisionDto {
  @IsInt()
  @Min(1)
  revision!: number;
}

/** Editing a service category's marketing presentation. */
export class UpdateServiceCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(400)
  descriptionEn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  descriptionAr?: string | null;

  @IsOptional()
  @IsString()
  imageAssetId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/** Creating or editing a banner, including its photography. */
export class UpsertBannerFullDto {
  @IsString()
  @MaxLength(60)
  placement!: string;

  @IsIn(['ar', 'en'])
  locale!: 'ar' | 'en';

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  mediaAssetId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  actionUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
