import { Module } from '@nestjs/common';

import { MockRegistryProvider } from './mock-registry.provider';
import { REGISTRY_PROVIDER } from './registry-provider';
import { SyncService } from './sync.service';

/**
 * Единственная реализация RegistryProvider — демонстрационная (ADR 0008).
 * Реальный HTTP-провайдер появится здесь вместе с официальной документацией
 * и доступом к внешнему реестру; до тех пор подменять токен нечем.
 */
@Module({
  providers: [
    MockRegistryProvider,
    { provide: REGISTRY_PROVIDER, useExisting: MockRegistryProvider },
    SyncService,
  ],
  exports: [SyncService, REGISTRY_PROVIDER],
})
export class SyncModule {}
