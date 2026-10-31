import { Module } from '@nestjs/common';

import { ProductsController } from '../products/products.controller';
import { ProductsService } from '../products/products.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/**
 * Каталог и изделия живут в одном модуле: они читают одни и те же
 * представления и всегда меняются вместе.
 */
@Module({
  controllers: [CatalogController, ProductsController],
  providers: [CatalogService, ProductsService],
  exports: [ProductsService],
})
export class CatalogModule {}
