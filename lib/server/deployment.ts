import { isPublicDemoAllowed, type ServerEnvironment } from "./config";

export interface DeploymentIssue {
  field: string;
  message: string;
}

function isPublicOrigin(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? "");
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      host.includes(".") &&
      !host.endsWith(".localhost") &&
      !host.endsWith(".local") &&
      !/^(127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
    );
  } catch {
    return false;
  }
}

function legacyKeyRole(value: string | undefined): string | null {
  try {
    const parts = value?.split(".");
    if (parts?.length !== 3) return null;
    return (
      JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).role ??
      null
    );
  } catch {
    return null;
  }
}

/** Structural checks only; credentials and database access are verified separately. Never returns values. */
export function deploymentIssues(
  env: ServerEnvironment = process.env,
): DeploymentIssue[] {
  const issues: DeploymentIssue[] = [];
  const fail = (field: string, message: string) => {
    issues.push({ field, message });
  };
  for (const field of ["APP_BASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    if (!isPublicOrigin(env[field]))
      fail(
        field,
        "Use uma origem HTTPS pública, sem caminho, credenciais ou parâmetros.",
      );
  }
  const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const privateKey = env.SUPABASE_SECRET_KEY;
  if (
    !publicKey ||
    (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey) &&
      legacyKeyRole(publicKey) !== "anon")
  ) {
    fail(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "Informe a publishable key (ou anon legada) do projeto remoto.",
    );
  }
  if (
    !privateKey ||
    (!/^sb_secret_[A-Za-z0-9_-]+$/.test(privateKey) &&
      legacyKeyRole(privateKey) !== "service_role")
  ) {
    fail(
      "SUPABASE_SECRET_KEY",
      "Informe a secret key (ou service_role legada), somente no servidor.",
    );
  }
  for (const field of ["TRACKING_SECRET", "RATE_LIMIT_SECRET"]) {
    if ((env[field]?.trim().length ?? 0) < 32)
      fail(
        field,
        "Use um segredo aleatório privado de pelo menos 32 caracteres.",
      );
    else if (env[field] === privateKey)
      fail(field, "Use um segredo independente da chave do Supabase.");
  }
  if (env.TRACKING_SECRET && env.TRACKING_SECRET === env.RATE_LIMIT_SECRET) {
    fail(
      "RATE_LIMIT_SECRET",
      "Use um segredo diferente do acompanhamento de pedidos.",
    );
  }
  if (env.PAYMENT_PROVIDER !== "unconfigured" && !isPublicDemoAllowed(env)) {
    fail(
      "PAYMENT_PROVIDER",
      "Use unconfigured ou demo com DEMO_EVENT_SLUG igual ao evento em destaque e DEMO_SECRET privado de pelo menos 32 caracteres.",
    );
  }
  for (const field of ["SIMULATION_SECRET", "DATABASE_URL"]) {
    if (env[field])
      fail(
        field,
        "Variável exclusiva das ferramentas locais; remova do ambiente publicado.",
      );
  }
  for (const field of Object.keys(env)) {
    if (
      field.startsWith("NEXT_PUBLIC_") &&
      /SECRET|SERVICE_ROLE|DATABASE_URL|SIMULATION|DEMO/i.test(field) &&
      env[field]
    ) {
      fail(field, "Segredos e controles de simulação não podem ser públicos.");
    }
  }
  const ttl = env.CHARGE_TTL_SECONDS ?? "900";
  if (!/^\d+$/.test(ttl) || Number(ttl) < 30 || Number(ttl) > 86400) {
    fail(
      "CHARGE_TTL_SECONDS",
      "Use um número inteiro entre 30 e 86400 segundos.",
    );
  }
  if (
    env.FEATURED_EVENT_SLUG &&
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(env.FEATURED_EVENT_SLUG)
  ) {
    fail("FEATURED_EVENT_SLUG", "Informe somente o slug do evento publicado.");
  } else if ((env.FEATURED_EVENT_SLUG?.length ?? 0) > 100) {
    fail("FEATURED_EVENT_SLUG", "O slug deve ter no máximo 100 caracteres.");
  }
  return issues;
}
