import { spawn } from "node:child_process";
import { resolve } from "node:path";

const action = process.argv[2];
if (!["start", "stop"].includes(action)) throw new Error("Use start ou stop para esta instância local.");
if (process.env.VERCEL !== undefined || process.env.VERCEL_ENV !== undefined || process.env.NODE_ENV === "production") throw new Error("Comando exclusivo de desenvolvimento local.");
console.log(action === "start" ? "Iniciando o Supabase local K4Ingressos. A primeira execução pode baixar imagens Docker." : "Encerrando o Supabase local K4Ingressos e preservando seus dados.");
// CLI startup prints local privileged keys. Discard its output instead of creating credential logs.
const child = spawn(process.execPath, [resolve("node_modules/supabase/dist/supabase.js"), action], { stdio: "ignore", windowsHide: true });
child.once("error", () => { console.error("Não foi possível iniciar a CLI local. Verifique a instalação e o Docker."); process.exitCode = 1; });
child.once("exit", (code) => {
  if (code !== 0) { console.error("A operação local falhou. Verifique se Docker está ativo e as portas 54331–54334 estão livres. Nenhuma credencial foi registrada."); process.exitCode = code ?? 1; }
  else console.log(action === "start" ? "Supabase K4Ingressos pronto: API 54331, PostgreSQL 54332, Studio 54333. Chaves omitidas; use npm run local:env." : "Supabase K4Ingressos encerrado. Dados preservados.");
});
