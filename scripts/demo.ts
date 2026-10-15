import { Client } from "pg";
import { getFridayDefaults } from "../lib/domain/rules";
import { assertLocalEnvironment, isLocalSimulationAllowed } from "../lib/server/config";

async function main() {
  if (!process.env.NODE_ENV) Object.assign(process.env, { NODE_ENV: "development" });
  assertLocalEnvironment();
  const open = process.argv.includes("--open");
  if (open && !isLocalSimulationAllowed()) throw new Error("Ative a simulação privada local antes de abrir a demonstração.");
  const now = new Date();
  const mana = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const friday = new Date(Date.UTC(mana.getUTCFullYear(), mana.getUTCMonth(), mana.getUTCDate()));
  friday.setUTCDate(friday.getUTCDate() + ((5 - friday.getUTCDay() + 7) % 7));
  let defaults = getFridayDefaults(friday.toISOString().slice(0, 10))!;
  if (Date.parse(defaults.salesClosesAt) <= now.getTime()) { friday.setUTCDate(friday.getUTCDate() + 7); defaults = getFridayDefaults(friday.toISOString().slice(0, 10))!; }
  const date = friday.toISOString().slice(0, 10), slug = `demonstracao-local-${date}`;
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query(`insert into public.events(slug,title,description,event_starts_at,sales_starts_at,sales_closes_at,promo_ends_at,price_cents,publication,sales_status,reviewed,is_demo)
      values($1,'Demonstração local K4','Evento fictício para testar o fluxo. Nenhuma venda ou pagamento real.',$2,$3,$4,$5,3500,$6,$7,$8,true)
      on conflict(slug) do update set publication=excluded.publication,sales_status=excluded.sales_status,reviewed=excluded.reviewed,sales_starts_at=excluded.sales_starts_at,updated_at=clock_timestamp(),version=public.events.version+1`,
    [slug, `${date}T21:00:00-04:00`, open ? new Date(now.getTime() - 60000).toISOString() : null, defaults.salesClosesAt, defaults.promoEndsAt, open ? "published" : "draft", open ? "open" : "paused", open]);
    console.log(open ? `Demonstração fictícia de teste disponível em /ingressos/${slug}. Nenhum pagamento real.` : `Demonstração fictícia criada como rascunho: ${slug}. Vendas fechadas.`);
  } finally { await db.end(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error && !error.message.includes("postgres") ? error.message : "Não foi possível preparar a demonstração local."); process.exitCode = 1; });
