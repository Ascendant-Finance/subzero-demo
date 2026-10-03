import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/** Either the root client or an interactive transaction client. */
export type Tx = Prisma.TransactionClient | PrismaService;
