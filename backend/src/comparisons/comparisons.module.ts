import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { ComparisonsController } from './comparisons.controller';
import { ComparisonsService } from './comparisons.service';

@Module({
  imports: [CatalogModule],
  controllers: [ComparisonsController],
  providers: [ComparisonsService],
  exports: [ComparisonsService],
})
export class ComparisonsModule {}
