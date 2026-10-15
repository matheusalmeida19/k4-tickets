import { AppError } from "./errors";
export type ServerEnvironment = Record<string, string | undefined>;
const loopback = (hostname: string) => ["127.0.0.1", "localhost", "[::1]", "::1"].includes(hostname);
export function isLocalEnvironment(env: ServerEnvironment = process.env): boolean {
  if (!["development", "test"].includes(env.NODE_ENV ?? "") || env.VERCEL !== undefined || env.VERCEL_ENV !== undefined) return false;
  try {
    const app = new URL(env.APP_BASE_URL ?? ""), api = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? ""), db = new URL(env.DATABASE_URL ?? "");
    return [app, api, db].every((url) => loopback(url.hostname)) && [app, api].every((url) => ["http:", "https:"].includes(url.protocol)) && ["postgres:", "postgresql:"].includes(db.protocol);
  } catch { return false; }
}
export function isLocalSimulationAllowed(env: ServerEnvironment = process.env): boolean {
  return env.PAYMENT_PROVIDER === "simulated" && isLocalEnvironment(env) && (env.SIMULATION_SECRET?.length ?? 0) >= 32;
}
export function assertLocalEnvironment(env: ServerEnvironment = process.env): void {
  if (!isLocalEnvironment(env)) throw new AppError("LOCAL_ONLY", "Este comando exige desenvolvimento/teste e configuração exclusivamente local.", 503);
}
export function privateSecret(name: string, env: ServerEnvironment = process.env): string {
  const value = env[name];
  if (!value || value.length < 32) throw new AppError("CONFIGURATION_UNAVAILABLE", "Configuração privada indisponível.", 503);
  return value;
}
export function appBaseUrl(): string {
  const value = process.env.APP_BASE_URL;
  if (!value) throw new AppError("CONFIGURATION_UNAVAILABLE", "URL da aplicação não configurada.", 503);
  return new URL(value).origin;
}
export function chargeTtlSeconds(): number {
  const seconds = Number(process.env.CHARGE_TTL_SECONDS ?? "900");
  if (!Number.isInteger(seconds) || seconds < 30 || seconds > 86400) throw new AppError("CONFIGURATION_UNAVAILABLE", "Prazo de cobrança inválido.", 503);
  return seconds;
}
