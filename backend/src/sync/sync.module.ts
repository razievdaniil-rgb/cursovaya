import { Module } from '@nestjs/common';

import { MockRegistryProvider } from './mock-registry.provider';
import { NomenclatureController } from './nomenclature/nomenclature.controller';
import { NomenclatureService } from './nomenclature/nomenclature.service';
import { NomenclatureSyncService } from './nomenclature/nomenclature-sync.service';
import { RoszdravnadzorNomenclatureProvider } from './nomenclature/roszdravnadzor-nomenclature.provider';
import { REGISTRY_PROVIDER } from './registry-provider';
import { SyncService } from './sync.service';

/**
 * Два источника с разным статусом (ADR 0009):
 *
 *  * `MockRegistryProvider` — демонстрационный реестр изделий. Реальный набор
 *    «Государственный реестр медицинских изделий» доступен только через
 *    авторизацию в ЕСИА, поэтому подменить провайдер пока нечем.
 *  * `RoszdravnadzorNomenclatureProvider` — настоящий источник: публичный
 *    набор открытых данных с номенклатурной классификацией видов.
 */
@Module({
  controllers: [NomenclatureController],
  providers: [
    MockRegistryProvider,
    { provide: REGISTRY_PROVIDER, useExisting: MockRegistryProvider },
    SyncService,
    RoszdravnadzorNomenclatureProvider,
    NomenclatureSyncService,
    NomenclatureService,
  ],
  exports: [
    SyncService,
    REGISTRY_PROVIDER,
    NomenclatureSyncService,
    NomenclatureService,
    RoszdravnadzorNomenclatureProvider,
  ],
})
export class SyncModule {}
