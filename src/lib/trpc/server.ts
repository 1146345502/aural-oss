import "server-only";
import { createContext } from "@/server/context";
import { appRouter } from "@/server/routers/_app";

export async function serverTrpc() {
  const ctx = await createContext();
  return appRouter.createCaller(ctx);
}
