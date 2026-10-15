import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { z } from "zod";
import { assertLocalEnvironment } from "../lib/server/config";
import { database } from "../lib/server/database";

async function hiddenPassword(): Promise<string> {
  if (!process.stdin.isTTY) throw new Error("Use um terminal interativo ou forneça K4_ADMIN_PASSWORD por variável privada do processo.");
  process.stdout.write("Senha escolhida por você (mínimo 8 caracteres; entrada oculta): ");
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const terminal = createInterface({ input: process.stdin, output: muted, terminal: true });
  try { return await terminal.question(""); } finally { terminal.close(); process.stdout.write("\n"); }
}
async function main() {
  if (!process.env.NODE_ENV) Object.assign(process.env, { NODE_ENV: "development" });
  assertLocalEnvironment();
  let email = process.env.K4_ADMIN_EMAIL;
  if (!email) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try { email = await prompt.question("E-mail da conta administrativa local: "); } finally { prompt.close(); }
  }
  const password = process.env.K4_ADMIN_PASSWORD ?? await hiddenPassword();
  if (!z.email().safeParse(email).success || password.length < 8 || password.length > 200) throw new Error("Informe um e-mail válido e uma senha escolhida por você com 8 a 200 caracteres.");
  const db = database();
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error("Não foi possível criar a conta local. Confira os dados e se o usuário já existe. Nenhuma credencial foi exibida.");
  const membership = await db.from("admin_users").insert({ user_id: data.user.id });
  if (membership.error) { await db.auth.admin.deleteUser(data.user.id); throw new Error("Não foi possível autorizar o administrador local; a conta incompleta foi removida."); }
  console.log("Administrador local criado. Entre em /admin/login com as credenciais que você escolheu. Nenhuma mensagem foi enviada.");
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Provisionamento local indisponível."); process.exitCode = 1; });
