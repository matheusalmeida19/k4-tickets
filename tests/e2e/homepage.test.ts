import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Client } from "pg";

const base = process.env.APP_BASE_URL!;
const db = new Client({ connectionString: process.env.DATABASE_URL });
const ids = [randomUUID(), randomUUID(), randomUUID()];
const slug = `demonstracao-local-home-${randomUUID()}`;
const title = "Demonstração fictícia da página inicial";

before(async () => {
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(databaseUrl.hostname));
  assert.equal(databaseUrl.port, "54332");
  await db.connect();
  for (const [index, id] of ids.entries()) {
    await db.query(
      `insert into public.events(id,slug,title,description,event_starts_at,sales_starts_at,sales_closes_at,promo_ends_at,price_cents,publication,sales_status,reviewed,is_demo)
       values($1,$2,$3,'Somente teste local da página inicial',now()+$4::interval,now()-interval '1 day',now()+interval '10 minutes',now()+interval '2 days',4500,$5,'open',true,$6)`,
      [
        id,
        index === 0 ? slug : `${slug}-${index}`,
        index === 0 ? title : `Evento oculto ${id}`,
        index === 0 ? "1 hour" : "30 minutes",
        index === 1 ? "draft" : "published",
        index !== 2,
      ],
    );
  }
});

after(async () => {
  await db.query("delete from public.events where id=any($1::uuid[])", [ids]);
  await db.end();
});

test("home combines the introduction and checkout for a published local demonstration only", async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /O próximo rolê/);
  assert.ok(html.includes(title));
  assert.match(html, /id="buyer-name"/);
  assert.match(html, /id="buyer-cpf"/);
  assert.match(html, /Continuar em ambiente de teste/);
  assert.match(html, /DEMONSTRAÇÃO FICTÍCIA/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.ok(!html.includes(`Evento oculto ${ids[1]}`), "draft is not promoted");
  assert.ok(
    !html.includes(`Evento oculto ${ids[2]}`),
    "real events stay on individual links",
  );
});

test("health endpoint reads the database without disclosing runtime configuration", async () => {
  const response = await fetch(new URL("/api/health", base));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    payments: "disabled",
  });
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});

test("home refreshes availability from the server and keeps individual event links working", async () => {
  await db.query("update public.events set sales_status='paused' where id=$1", [
    ids[0],
  ]);
  try {
    const html = await (await fetch(base)).text();
    assert.ok(html.includes(title));
    assert.match(html, /Vendas pausadas/);
    assert.doesNotMatch(html, /id="buyer-name"/);
    const individual = await fetch(new URL(`/ingressos/${slug}`, base));
    assert.equal(individual.status, 200);
    assert.ok((await individual.text()).includes(title));
  } finally {
    await db.query("update public.events set sales_status='open' where id=$1", [
      ids[0],
    ]);
  }
});
