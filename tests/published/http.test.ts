import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { Client } from "pg";
const base = "http://127.0.0.1:3009";
const featuredBase = "http://127.0.0.1:3010";
const demoBase = "http://127.0.0.1:3011";
let server: ChildProcess;
let featuredServer: ChildProcess;
let demoServer: ChildProcess;
const fixtureId = randomUUID();
const fixtureSlug = `published-fixture-${fixtureId}`;
const fixtureTitle = "Evento fictício de apresentação publicada";
const db = new Client({ connectionString: process.env.DATABASE_URL });
const demoId = randomUUID(),
  demoSlug = `demo-fixture-${demoId}`;
const demoInput = () => ({
  eventSlug: demoSlug,
  fullName: "Pessoa Ficticia Teste",
  cpf: "12345678909",
  acknowledged: true,
  idempotencyKey: randomUUID(),
});
const demoRequest = (input: unknown) =>
  fetch(`${demoBase}/api/orders`, {
    method: "POST",
    headers: { origin: demoBase, "content-type": "application/json" },
    body: JSON.stringify(input),
  });

async function ready(child: ChildProcess, url: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null)
      throw new Error(
        "Production test server could not start; ensure ports 3009/3010 are free and build exists.",
      );
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* Bounded startup retry. */
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("Production test server did not become ready.");
}

before(async () => {
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(databaseUrl.hostname));
  assert.equal(databaseUrl.port, "54332");
  await db.connect();
  await db.query(
    `insert into public.events(id,slug,title,description,event_starts_at,sales_starts_at,sales_closes_at,promo_ends_at,price_cents,publication,sales_status,reviewed,is_demo)
    values($1,$2,$3,'Apresentação de teste sem vendas',now()+interval '2 days',now()-interval '1 day',now()+interval '1 day',now()+interval '3 days',3500,'published','open',true,true)`,
    [fixtureId, fixtureSlug, fixtureTitle],
  );
  // Executes the actual production artifact locally; creates no Vercel resources.
  server = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3009",
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        APP_BASE_URL: base,
        FEATURED_EVENT_SLUG: "",
        PAYMENT_PROVIDER: "simulated",
        VERCEL: "1",
        VERCEL_ENV: "preview",
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  await ready(server, base);
  featuredServer = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3010",
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        APP_BASE_URL: featuredBase,
        FEATURED_EVENT_SLUG: fixtureSlug,
        PAYMENT_PROVIDER: "unconfigured",
        VERCEL: "1",
        VERCEL_ENV: "production",
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  await ready(featuredServer, featuredBase);
  await db.query(
    `insert into public.events(id,slug,title,description,event_starts_at,sales_starts_at,sales_closes_at,promo_ends_at,price_cents,publication,sales_status,reviewed,is_demo)
    values($1,$2,'Demonstração publicada de teste','Somente dados fictícios',now()+interval '2 days',now()-interval '1 day',now()+interval '1 day',now()+interval '3 days',3500,'published','open',true,true)`,
    [demoId, demoSlug],
  );
  demoServer = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3011",
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        APP_BASE_URL: demoBase,
        FEATURED_EVENT_SLUG: demoSlug,
        DEMO_EVENT_SLUG: demoSlug,
        DEMO_SECRET: "fixture-demo-private-".repeat(3),
        PAYMENT_PROVIDER: "demo",
        VERCEL: "1",
        VERCEL_ENV: "production",
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  await ready(demoServer, demoBase);
});
after(async () => {
  for (const child of [server, featuredServer, demoServer]) {
    if (!child || child.exitCode !== null) continue;
    await new Promise<void>((done) => {
      child.once("exit", () => done());
      child.kill();
    });
  }
  for (const table of [
    "payment_exceptions",
    "tickets",
    "payment_notifications",
    "payment_attempts",
    "orders",
  ]) {
    const clause =
      table === "orders"
        ? "event_id=$1"
        : "order_id in(select id from public.orders where event_id=$1)";
    await db.query(`delete from public.${table} where ${clause}`, [demoId]);
  }
  await db.query("delete from public.events where id=any($1::uuid[])", [
    [fixtureId, demoId],
  ]);
  await db.end();
});

test("production/preview home keeps the local demonstration checkout private", async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /O próximo rolê/);
  assert.doesNotMatch(html, /id="buyer-name"/);
  assert.doesNotMatch(html, /id="buyer-cpf"/);
  assert.doesNotMatch(html, /DEMONSTRAÇÃO FICTÍCIA/);
});
test("production/preview artifact refuses simulated checkout despite private flag", async () => {
  const response = await fetch(`${base}/api/orders`, {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({
      eventSlug: "fictitious-published-test",
      fullName: "Pessoa Ficticia Teste",
      cpf: "12345678909",
      acknowledged: true,
      idempotencyKey: randomUUID(),
    }),
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, "PAYMENT_UNAVAILABLE");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});

test("health fails closed for an invalid published configuration without leaking diagnostics", async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable" });
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});

test("published home can present an explicitly featured event without collecting buyer data or simulating payments", async () => {
  const response = await fetch(featuredBase);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes(fixtureTitle));
  assert.match(html, /home-booking/);
  assert.match(html, /Compra indisponível/);
  assert.doesNotMatch(
    html,
    /id="buyer-name"|id="buyer-cpf"|Continuar em ambiente de teste/,
  );
  const order = await fetch(`${featuredBase}/api/orders`, {
    method: "POST",
    headers: { origin: featuredBase, "content-type": "application/json" },
    body: JSON.stringify({
      eventSlug: fixtureSlug,
      fullName: "Pessoa Ficticia Teste",
      cpf: "12345678909",
      acknowledged: true,
      idempotencyKey: randomUUID(),
    }),
  });
  assert.equal(order.status, 503);
  assert.equal((await order.json()).code, "PAYMENT_UNAVAILABLE");
  const count = await db.query(
    "select count(*)::integer as count from public.orders where event_id=$1",
    [fixtureId],
  );
  assert.equal(count.rows[0].count, 0);
});

test("featured homepage cannot reveal a draft event", async () => {
  await db.query("update public.events set publication='draft' where id=$1", [
    fixtureId,
  ]);
  const response = await fetch(featuredBase);
  assert.equal(response.status, 200);
  assert.ok(!(await response.text()).includes(fixtureTitle));
});

test("published demo completes concurrent fictitious orders with exactly one nonpayable test ticket", async () => {
  const html = await (await fetch(demoBase)).text();
  assert.match(html, /id="buyer-name"/);
  assert.match(html, /Gerar ingresso de teste/);
  assert.doesNotMatch(html, /Área administrativa[^<]*↗/);
  const input = demoInput();
  const responses = await Promise.all(
    Array.from({ length: 6 }, () => demoRequest(input)),
  );
  assert.ok(
    responses.every((response) => response.status === 201),
    "all concurrent requests succeed",
  );
  const results = await Promise.all(
    responses.map((response) => response.json()),
  );
  const order = results[0];
  assert.ok(
    results.every(
      (result) =>
        result.id === order.id && result.accessToken === order.accessToken,
    ),
  );
  const counts = (
    await db.query(
      `select o.status,o.is_test,
    (select count(*)::int from public.payment_attempts where order_id=o.id) attempts,
    (select count(*)::int from public.tickets where order_id=o.id and is_test) tickets,
    (select count(*)::int from public.payment_notifications where order_id=o.id) notifications,
    (select count(*)::int from public.payment_exceptions where order_id=o.id) exceptions
    from public.orders o where o.id=$1`,
      [order.id],
    )
  ).rows[0];
  assert.deepEqual(counts, {
    status: "confirmed",
    is_test: true,
    attempts: 1,
    tickets: 1,
    notifications: 1,
    exceptions: 0,
  });
  const access = await fetch(`${demoBase}/api/orders/${order.id}/access`, {
    method: "POST",
    headers: { origin: demoBase, "content-type": "application/json" },
    body: JSON.stringify({ credential: order.accessToken }),
  });
  assert.equal(access.status, 200);
  const cookie = access.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  const viewResponse = await fetch(`${demoBase}/api/orders/${order.id}`, {
    headers: { cookie },
  });
  assert.equal(viewResponse.status, 200);
  const view = await viewResponse.json();
  assert.equal(view.ticket.isTest, true);
  assert.equal(view.payment.pixCopyPaste, null);
  assert.equal(view.payment.pixQrCode, null);
  assert.ok(view.ticket.code !== order.accessToken);
  assert.ok(!JSON.stringify(view.ticket).includes(input.cpf));
  assert.equal(
    (await demoRequest({ ...input, fullName: "Outra Pessoa Ficticia" })).status,
    409,
  );
  await db.query("update public.events set is_demo=false where id=$1", [
    demoId,
  ]);
  assert.equal(
    (await demoRequest(input)).status,
    503,
    "replaying a request cannot bypass current demo scope",
  );
  assert.doesNotMatch(await (await fetch(demoBase)).text(), /id="buyer-name"/);
  await db.query("update public.events set is_demo=true where id=$1", [demoId]);
});

test("published demo denies other events, draft/paused/closed sales and forged financial fields", async () => {
  assert.equal(
    (await demoRequest({ ...demoInput(), eventSlug: fixtureSlug })).status,
    503,
  );
  assert.equal(
    (await demoRequest({ ...demoInput(), priceCents: 1, status: "confirmed" }))
      .status,
    400,
  );
  for (const state of ["paused", "closed"]) {
    await db.query("update public.events set sales_status=$1 where id=$2", [
      state,
      demoId,
    ]);
    assert.equal((await demoRequest(demoInput())).status, 409);
  }
  await db.query(
    "update public.events set sales_status='open',publication='draft' where id=$1",
    [demoId],
  );
  assert.equal((await demoRequest(demoInput())).status, 503);
  await db.query(
    "update public.events set publication='published',sales_closes_at=now()-interval '1 second' where id=$1",
    [demoId],
  );
  assert.equal((await demoRequest(demoInput())).status, 409);
});
