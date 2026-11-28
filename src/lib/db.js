import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client.ts';
import { pgConnection } from './dbConnection.js';

export { Prisma };

// Prisma 7 se conecta a PostgreSQL con el driver pg a través de un adaptador. Cada cliente
// tiene su propio pool; los scripts crean el suyo y lo cierran con $disconnect().
export function createPrismaClient(url = process.env.DATABASE_URL) {
    const { pool, schema } = pgConnection(url);
    return new PrismaClient({ adapter: new PrismaPg(pool, schema ? { schema } : undefined) });
}

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
