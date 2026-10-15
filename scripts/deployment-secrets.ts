import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  if (process.env.VERCEL || process.env.NODE_ENV === "production")
    throw new Error("LOCAL_ONLY");
  const directory = resolve("work");
  await mkdir(directory, { recursive: true });
  const target = resolve(directory, "production-secrets.env");
  await writeFile(
    target,
    `TRACKING_SECRET=${randomBytes(32).toString("hex")}\nRATE_LIMIT_SECRET=${randomBytes(32).toString("hex")}\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Segredos criados em work/production-secrets.env, ignorado pelo Git e pelo upload. Transfira pelo painel privado da hospedagem.",
  );
}
main().catch(() => {
  console.error(
    "Não foi possível criar o arquivo privado. Execute localmente e preserve qualquer arquivo já existente.",
  );
  process.exitCode = 1;
});
