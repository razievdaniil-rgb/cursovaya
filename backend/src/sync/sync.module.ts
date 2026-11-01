import { Module } from '@nestjs/common';

import { MockRegistryProvider } from './mock-registry.provider';
import { NomenclatureController } from './nomenclature/nomenclature.controller';
import { NomenclatureService } from './nomenclature/nomenclature.service';
import { NomenclatureSyncService } from './nomenclature/nomenclature-sync.service';
import { RoszdravnadzorNomenclatureProvider } from './nomenclature/roszdravnadzor-nomenclature.provider';
import { RegistrySyncService } from './registry/registry-sync.service';
import { RoszdravnadzorRegistryProvider } from './registry/roszdravnadzor-registry.provider';
import { REGISTRY_PROVIDER } from './registry-provider';
import { SyncService } from './sync.service';

/**
 * Три источника с разным статусом:
 *
 *  * `MockRegistryProvider` — демонстрационный реестр. Остаётся ради
 *    frontend-only демонстрации на GitHub Pages (ADR 0007) и помечен
 *    `isReal: false`, чтобы его нельзя было принять за настоящий.
 *  * `RoszdravnadzorNomenclatureProvider` — настоящий источник: публичный
 *    набор открытых данных с номенклатурной классификацией видов (ADR 0009).
 *  * `RoszdravnadzorRegistryProvider` — настоящий государственный реестр
 *    медицинских изделий через публичный API виджета (ADR 0010).
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
    RoszdravnadzorRegistryProvider,
    RegistrySyncService,
  ],
  exports: [
    SyncService,
    REGISTRY_PROVIDER,
    NomenclatureSyncService,
    NomenclatureService,
    RoszdravnadzorNomenclatureProvider,
    RoszdravnadzorRegistryProvider,
    RegistrySyncService,
  ],
})
export class SyncModule {}
