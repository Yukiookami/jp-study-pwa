import { PrismaClient, Prisma } from '@prisma/client';
import './config.js';
export const db = new PrismaClient();
export const userId = '00000000-0000-0000-0000-000000000001';
export const asJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function lock(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(19841011)`;
}
export async function ensureUser() {
  await db.user.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
}
