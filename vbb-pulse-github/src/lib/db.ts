import "server-only";
import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot reloads in development.
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const db: PrismaClient =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = db;
