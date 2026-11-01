import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { SavedListsController } from './saved-lists.controller';
import { SavedListsService } from './saved-lists.service';

@Module({
  // CatalogModule экспортирует ProductsService: позиции списка отдаются
  // актуальными карточками из каталожного представления.
  imports: [CatalogModule],
  controllers: [SavedListsController],
  providers: [SavedListsService],
  exports: [SavedListsService],
})
export class SavedListsModule {}
