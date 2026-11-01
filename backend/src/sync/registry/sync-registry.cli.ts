import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { RegistrySyncService } from './registry-sync.service';
import { RoszdravnadzorRegistryProvider } from './roszdravnadzor-registry.provider';

/** Operational import without a long-lived HTTP request or demo seed. */
async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
  const options = z.object({
    'page-size': z.coerce.number().int().positive().max(1000).default(500),
    'max-pages': z.coerce.number().int().positive().optional(),
  }).strict().parse(args);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaService();
  try {
    const provider = new RoszdravnadzorRegistryProvider(new ConfigService(process.env));
    const result = await new RegistrySyncService(prisma, provider).run(null, {
      pageSize: options['page-size'], maxPages: options['max-pages'],
    });
    console.log(JSON.stringify(result));
    if (result.status !== 'success') process.exitCode = 2;
  } finally { await prisma.$disconnect(); }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Registry import failed');
  process.exitCode = 1;
});
