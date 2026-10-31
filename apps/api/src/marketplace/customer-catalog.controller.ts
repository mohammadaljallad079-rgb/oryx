import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.decorators';
import { CustomerCatalogService } from './customer-catalog.service';

/**
 * The public consumer catalogue.
 *
 * Public by design: browsing parts and stores is what a guest does, and requiring
 * a session to see a price would make the app unusable before sign-in. Nothing
 * here returns a cost price, a stock quantity or an accounting field — the
 * service selects the public projection only.
 */
@ApiTags('customer-catalog')
@Controller('customer/catalog')
export class CustomerCatalogController {
  constructor(private readonly catalog: CustomerCatalogService) {}

  private static localeOf(value?: string): 'ar' | 'en' {
    return value === 'en' ? 'en' : 'ar';
  }

  @Public()
  @Get('products')
  @ApiOperation({ summary: 'Browse the published product catalogue' })
  listProducts(
    @Query('locale') locale?: string,
    @Query('companyId') companyId?: string,
    @Query('query') query?: string,
    @Query('sort') sort?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.catalog.listProducts({
      locale: CustomerCatalogController.localeOf(locale),
      companyId: companyId || undefined,
      query: query?.trim() || undefined,
      sort: (sort as 'relevance' | 'price_asc' | 'price_desc' | 'name') || undefined,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(50, Math.max(1, Number(pageSize) || 20)),
    });
  }

  @Public()
  @Get('products/:id')
  @ApiOperation({ summary: 'Read one product with its images and related items' })
  getProduct(@Param('id') id: string, @Query('locale') locale?: string) {
    return this.catalog.getProduct(id, CustomerCatalogController.localeOf(locale));
  }

  @Public()
  @Get('stores')
  @ApiOperation({ summary: 'Browse the marketplace stores' })
  listStores(
    @Query('locale') locale?: string,
    @Query('query') query?: string,
    @Query('sort') sort?: string,
  ) {
    return this.catalog.listStores({
      locale: CustomerCatalogController.localeOf(locale),
      query: query?.trim() || undefined,
      sort: sort === 'name' ? 'name' : 'products',
    });
  }

  @Public()
  @Get('stores/:id')
  @ApiOperation({ summary: 'Read one store with its whole catalogue' })
  getStore(@Param('id') id: string, @Query('locale') locale?: string) {
    return this.catalog.getStore(id, CustomerCatalogController.localeOf(locale));
  }

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'The catalogue categories' })
  listCategories(@Query('locale') locale?: string) {
    return this.catalog.listCategories(CustomerCatalogController.localeOf(locale));
  }
}
