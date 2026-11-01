
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RegistrySyncService, registryManufacturerIdentity } from '../../src/sync/registry/registry-sync.service';
import { RoszdravnadzorRegistryProvider } from '../../src/sync/registry/roszdravnadzor-registry.provider';
import type { RegistryEntry, RegistryPage } from '../../src/sync/registry/registry.types';

const entry: RegistryEntry = {
  externalId: 101, registrationNumber: 'RU 101', name: 'Device',
  statusCode: 'active', statusName: 'Active', legalSystem: 'RUSSIA',
  registrationDate: '2000-01-01', expiresAt: null,
  producer: { name: 'Maker', actualAddress: 'Address A' },
  modelsDescription: null, frnsiId: null, nomenclatureIds: [],
};
function page(entries: RegistryEntry[] = [entry], overrides: Partial<RegistryPage> = {}): RegistryPage {
  return { entries, rawCount: entries.length, rejected: [], page: 0, totalPages: 1,
    totalElements: entries.length, last: true, ...overrides };
}
function harness(pages = [page()]) {
  const tx = {
    product: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'product' }),
      update: vi.fn().mockResolvedValue({ id: 'product' }),
    },
    manufacturer: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'maker' }),
    },
    registryStatusHistory: {
      findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    syncSource: { upsert: vi.fn().mockResolvedValue({ id: 'source', isEnabled: true }) },
    syncRunStatus: { upsert: vi.fn(), findUniqueOrThrow: vi.fn()
      .mockImplementation(async ({ where }: { where: { code: string } }) => ({ id: where.code })) },
    registryStatus: { upsert: vi.fn(), findMany: vi.fn().mockResolvedValue(
      ['active', 'expired', 'cancelled', 'invalid', 'suspended'].map((code) => ({ id: code, code }))) },
    syncRun: { create: vi.fn().mockResolvedValue({ id: 'run' }), update: vi.fn().mockResolvedValue({}) },
    syncRunError: { create: vi.fn().mockResolvedValue({}) },
    refreshAnalyticsViews: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn().mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const provider = {
    describe: () => ({ code: 'roszdravnadzor-registry', name: 'Registry', baseUrl: 'https://example.test', isReal: true }),
    iterate: vi.fn().mockImplementation(async function* () { yield* pages; }),
  };
  const service = new RegistrySyncService(prisma as unknown as PrismaService,
    provider as unknown as RoszdravnadzorRegistryProvider);
  return { service, prisma, provider, tx };
}
afterEach(() => vi.useRealTimers());

describe('Registry background start', () => {
  function activeRuns(service: RegistrySyncService) {
    return (service as unknown as { activeRuns: Map<string, Promise<unknown>> }).activeRuns;
  }
  it('acknowledges the persisted run while the source is still blocked', async () => {
    const h = harness();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    h.provider.iterate.mockImplementation(async function* () {
      await gate;
      yield page();
    });
    try {
      expect(await h.service.start(null, { maxPages: 1 })).toEqual({ runId: 'run', status: 'running' });
      expect(h.prisma.syncRun.create).toHaveBeenCalledOnce();
      expect(h.tx.product.create).not.toHaveBeenCalled();
      expect(activeRuns(h.service).size).toBe(1);
    } finally {
      release();
    }
    await vi.waitFor(() => expect(activeRuns(h.service).size).toBe(0));
    expect(h.prisma.syncRun.update).toHaveBeenLastCalledWith({
      where: { id: 'run' }, data: expect.objectContaining({ statusId: 'success', finishedAt: expect.any(Date) }),
    });
  });
  it('rejects disabled sources before acknowledging or creating a background run', async () => {
    const h = harness();
    h.prisma.syncSource.upsert.mockResolvedValue({ id: 'source', isEnabled: false });
    await expect(h.service.start(null)).rejects.toThrow();
    expect(h.prisma.syncRun.create).not.toHaveBeenCalled();
    expect(h.provider.iterate).not.toHaveBeenCalled();
    expect(activeRuns(h.service).size).toBe(0);
  });
  it('propagates the cross-process guard conflict before acknowledgment', async () => {
    const h = harness();
    h.prisma.syncRun.create.mockRejectedValue({ code: 'P2002' });
    await expect(h.service.start(null)).rejects.toThrow('unfinished import');
    expect(h.prisma.syncRun.update).not.toHaveBeenCalled();
    expect(activeRuns(h.service).size).toBe(0);
  });
  it('observes background source failure and persists failed status without an unhandled rejection', async () => {
    const h = harness();
    h.provider.iterate.mockImplementation(async function* () {
      yield page();
      throw new Error('background source failed');
    });
    expect(await h.service.start(null)).toEqual({ runId: 'run', status: 'running' });
    await vi.waitFor(() => expect(activeRuns(h.service).size).toBe(0));
    expect(h.prisma.syncRun.update).toHaveBeenLastCalledWith({
      where: { id: 'run' }, data: expect.objectContaining({
        statusId: 'failed', finishedAt: expect.any(Date), recordsChanged: 1,
        errorMessage: 'background source failed',
      }),
    });
  });
  it('handles failure immediately after persistence even before provider iteration', async () => {
    const h = harness();
    h.prisma.registryStatus.upsert.mockRejectedValue(new Error('status lookup failed'));
    expect(await h.service.start(null)).toEqual({ runId: 'run', status: 'running' });
    await vi.waitFor(() => expect(activeRuns(h.service).size).toBe(0));
    expect(h.provider.iterate).not.toHaveBeenCalled();
    expect(h.prisma.syncRun.update).toHaveBeenLastCalledWith({
      where: { id: 'run' }, data: expect.objectContaining({ statusId: 'failed', finishedAt: expect.any(Date) }),
    });
  });
});

describe('Registry import integrity', () => {
  it('rejects disabled sources before creating a run or calling the provider', async () => {
    const h = harness();
    h.prisma.syncSource.upsert.mockResolvedValue({ id: 'source', isEnabled: false });
    await expect(h.service.run(null)).rejects.toThrow();
    expect(h.prisma.syncRun.create).not.toHaveBeenCalled();
    expect(h.provider.iterate).not.toHaveBeenCalled();
  });
  it('maps the database active-run conflict and leaves the existing run alone', async () => {
    const h = harness();
    h.prisma.syncRun.create.mockRejectedValue({ code: 'P2002' });
    await expect(h.service.run(null)).rejects.toThrow('unfinished import');
    expect(h.prisma.syncRun.update).not.toHaveBeenCalled();
    expect(h.provider.iterate).not.toHaveBeenCalled();
  });
  it('updates by external id, including a corrected registration number', async () => {
    const h = harness();
    h.tx.product.findUnique.mockImplementation(async ({ where }) =>
      'externalRegistryId' in where ? { id: 'stable', currentRegistryStatusId: 'active' } : null);
    const result = await h.service.run(null);
    expect(h.tx.product.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'stable' }, data: expect.objectContaining({ registrationNumber: 'RU 101' }),
    }));
    expect(h.tx.product.create).not.toHaveBeenCalled();
    expect(h.tx.registryStatusHistory.create).not.toHaveBeenCalled();
    expect(result.complete).toBe(true);
  });
  it('does not adopt an existing registration number with another or absent source id', async () => {
    const h = harness();
    h.tx.product.findUnique.mockImplementation(async ({ where }) =>
      'registrationNumber' in where ? { id: 'unrelated' } : null);
    const result = await h.service.run(null);
    expect(result).toMatchObject({ status: 'partial', skipped: 1, productsUpdated: 0 });
    expect(h.tx.product.update).not.toHaveBeenCalled();
    expect(h.tx.manufacturer.create).not.toHaveBeenCalled();
    expect(h.prisma.syncRunError.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ errorCode: 'IDENTITY_CONFLICT' }),
    }));
  });
  it('records observation time and verifiedAt without backdating to registration', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-01T12:00:00Z'));
    const h = harness();
    await h.service.run(null);
    expect(h.tx.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ verifiedAt: new Date(), registrationDate: new Date('2000-01-01') }),
    }));
    expect(h.tx.registryStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ effectiveAt: new Date(), sourceRunId: 'run' }),
    });
    expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });
  it('appends a distinct observation rather than overwriting same-millisecond history', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-01T12:00:00Z'));
    const h = harness();
    h.tx.product.findUnique.mockResolvedValue({ id: 'product', currentRegistryStatusId: 'expired' });
    h.tx.registryStatusHistory.findFirst.mockResolvedValue({ effectiveAt: new Date() });
    await h.service.run(null);
    expect(h.tx.registryStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ effectiveAt: new Date(Date.now() + 1) }),
    });
  });
  it('retries serialization failures without double-counting committed records', async () => {
    const h = harness();
    h.prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    const result = await h.service.run(null);
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ productsCreated: 1, manufacturersCreated: 1, skipped: 0 });
  });

  it('marks an otherwise valid maxPages-limited load partial', async () => {
    const h = harness([page([entry], { totalElements: 2, totalPages: 2, last: false })]);
    expect(await h.service.run(null, { maxPages: 1 })).toMatchObject({
      status: 'partial', complete: false, skipped: 0, warnings: 1, productsCreated: 1,
    });
  });
  it('rejects duplicate external ids instead of silently updating the same product twice', async () => {
    const h = harness([page([entry, { ...entry, statusCode: 'expired' }])]);
    expect(await h.service.run(null)).toMatchObject({
      status: 'partial', complete: false, skipped: 1, productsCreated: 1,
    });
    expect(h.prisma.$transaction).toHaveBeenCalledOnce();
  });
  it('counts source rejections and marks a capped traversal partial', async () => {
    const h = harness([page([], { rawCount: 1, rejected: [{ index: 0, message: 'Bad noRu' }],
      totalElements: 20, totalPages: 20, last: false })]);
    const result = await h.service.run(null, { maxPages: 1 });
    expect(result).toMatchObject({ status: 'partial', complete: false, pagesRead: 1,
      recordsRead: 1, rejected: 1, skipped: 1, analyticsRefreshed: true });
    expect(h.prisma.syncRunError.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ errorCode: 'INCOMPLETE_TRAVERSAL' }),
    });
  });
  it('refuses complete success when source totals change between pages', async () => {
    const h = harness([page([], { rawCount: 0, totalElements: 1, totalPages: 2, last: false }),
      page([], { page: 1, totalElements: 0, totalPages: 2 })]);
    expect(await h.service.run(null)).toMatchObject({ complete: false, status: 'partial' });
  });
  it('refreshes partial committed writes after a later source failure and preserves counters', async () => {
    const h = harness();
    h.provider.iterate.mockImplementation(async function* () { yield page(); throw new Error('source failed'); });
    await expect(h.service.run(null)).rejects.toThrow('source failed');
    expect(h.prisma.refreshAnalyticsViews).toHaveBeenCalledOnce();
    expect(h.prisma.syncRun.update).toHaveBeenLastCalledWith({
      where: { id: 'run' }, data: expect.objectContaining({
        statusId: 'failed', recordsRead: 1, recordsChanged: 1, finishedAt: expect.any(Date),
      }),
    });
  });
  it('records refresh failure as a warning and preserves the successful writes', async () => {
    const h = harness();
    h.prisma.refreshAnalyticsViews.mockRejectedValue(new Error('refresh unavailable'));
    expect(await h.service.run(null)).toMatchObject({
      status: 'partial', productsCreated: 1, analyticsRefreshed: false, warnings: 1,
    });
  });
  it('separates namesakes by address, normalizes Unicode and scopes unknown producers', () => {
    const a = registryManufacturerIdentity(entry);
    expect(registryManufacturerIdentity({ ...entry, externalId: 102 }).id).toBe(a.id);
    expect(registryManufacturerIdentity({ ...entry, producer: { name: 'Maker', actualAddress: 'Address B' } }).id)
      .not.toBe(a.id);
    expect(registryManufacturerIdentity({ ...entry, producer: null }).id)
      .not.toBe(registryManufacturerIdentity({ ...entry, externalId: 102, producer: null }).id);
    const normalized = registryManufacturerIdentity({ ...entry, producer: { name: 'Café', actualAddress: null } });
    expect(registryManufacturerIdentity({ ...entry, producer: { name: 'Cafe\u0301', actualAddress: null } }).id)
      .toBe(normalized.id);
  });
});
