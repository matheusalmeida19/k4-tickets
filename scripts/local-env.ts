import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Generated local keys are captured, never printed. Refuse to overwrite private configuration.
const target = resolve(".env.local");
if (existsSync(target)) throw new Error(".env.local já existe. Preserve-o; ajuste a configuração conscientemente.");
if (process.env.VERCEL || process.env.VERCEL_ENV || process.env.NODE_ENV === "production") {
  throw new Error("Este comando é exclusivo do desenvolvimento local.");
}
const cli = resolve("node_modules/supabase/dist/supabase.js");
const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const api = new URL(status.API_URL);
const database = new URL(status.DB_URL);
if (!(["localhost", "127.0.0.1"].includes(api.hostname) && api.port === "54331" && ["localhost", "127.0.0.1"].includes(database.hostname) && database.port === "54332")) {
  throw new Error("A instância não corresponde ao Supabase local isolado do K4 Ingressos.");
}
const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
const secret = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
if (!key || !secret) throw new Error("A CLI não retornou as chaves locais.");
const contents = [
  "# Generated for K4Ingressos local only. Never commit this file.",
  "NODE_ENV=development",
  "APP_BASE_URL=http://127.0.0.1:3009",
  `NEXT_PUBLIC_SUPABASE_URL=${api.origin}`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}`,
  `SUPABASE_SECRET_KEY=${secret}`,
  `DATABASE_URL=${status.DB_URL}`,
  "PAYMENT_PROVIDER=simulated",
  `SIMULATION_SECRET=${randomBytes(32).toString("hex")}`,
  `TRACKING_SECRET=${randomBytes(32).toString("hex")}`,
  `RATE_LIMIT_SECRET=${randomBytes(32).toString("hex")}`,
  "CHARGE_TTL_SECONDS=900", "",
].join("\n");
writeFileSync(target, contents, { flag: "wx", mode: 0o600 });
console.log(".env.local criado com chaves geradas pela instância local. Nenhum segredo foi exibido.");
