import {AsyncLocalStorage} from 'node:async_hooks';
import type {Prisma} from '@prisma/client';
// import { PrismaClient } from "@prisma/client";

// const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// export const prisma =
//   globalForPrisma.prisma ??
//   new PrismaClient({
//     log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
//   });

// if (process.env.NODE_ENV !== "production") {
//   globalForPrisma.prisma = client;
// }

// // src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";
// If generate output is custom, import from that path instead, e.g.:
// import { PrismaClient } from "../generated/prisma/client";

import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { env } from "../config/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000, max: env.DB_POOL_MAX });
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const client = globalForPrisma.prisma ?? createPrismaClient();
const transactions=new AsyncLocalStorage<Prisma.TransactionClient>();
export function inPrismaTransaction<T>(tx:Prisma.TransactionClient,work:()=>Promise<T>){return transactions.run(tx,work);}
export const prisma=new Proxy(client,{get(target,key){const tx=transactions.getStore();if(tx&&key==='$transaction')return (work:((db:Prisma.TransactionClient)=>Promise<unknown>)|Promise<unknown>[])=>typeof work==='function'?work(tx):Promise.all(work);const source=tx??target,value=Reflect.get(source,key);return typeof value==='function'?value.bind(source):value;}});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = client;
}
