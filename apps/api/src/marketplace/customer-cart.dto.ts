import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, Max, Min, MinLength } from 'class-validator';

/**
 * Request bodies for the cart and favourites.
 *
 * Note what is **absent**: there is no price field anywhere. The unit price is
 * read from the catalogue inside the transaction, so a client cannot propose the
 * price it would like to pay. `companyId` is absent for the same reason — it is
 * taken from the authenticated principal.
 */

export class AddCartItemDto {
  @ApiProperty({ description: 'The product to add' })
  @IsString()
  @MinLength(1)
  productId!: string;

  @ApiPropertyOptional({ description: 'How many to add', default: 1, minimum: 1, maximum: 999 })
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;
}

export class SetQuantityDto {
  @ApiProperty({ description: 'The absolute quantity for the line; zero removes it', minimum: 0, maximum: 999 })
  @IsInt()
  @Min(0)
  @Max(999)
  quantity!: number;
}

export class FavoriteDto {
  @ApiProperty({ description: 'The product to save' })
  @IsString()
  @MinLength(1)
  productId!: string;
}
