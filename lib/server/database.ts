import { createClient } from "@supabase/supabase-js";
import { AppError, databaseError } from "./errors";
export function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new AppError("DATABASE_UNAVAILABLE", "Banco de dados não configurado.", 503);
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } });
}
export async function rpc<T>(name: string, parameters: Record<string, unknown>): Promise<T> {
  const { data, error } = await database().rpc(name, parameters);
  if (error) databaseError(error.message);
  return data as T;
}
export type Row = Record<string, unknown>;
