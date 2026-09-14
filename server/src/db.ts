import { PrismaClient } from '@prisma/client';

/**
 * Один экземпляр клиента на процесс.
 *
 * В dev-режиме tsx перезапускает модуль при каждой правке, и без
 * кеширования на глобальном объекте пул соединений разрастался бы
 * до исчерпания лимита Postgres за десяток сохранений файла.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
