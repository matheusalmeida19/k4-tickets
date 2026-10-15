export function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
export function dayAndMonth(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Manaus",
    day: "2-digit",
    month: "short",
  }).format(new Date(iso));
}
export function formatCpfInput(raw: string) {
  return raw
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
export function toManausInput(iso: string) {
  const shifted = new Date(new Date(iso).getTime() - 4 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}
export function fromManausInput(value: string) {
  return new Date(`${value}:00-04:00`).toISOString();
}

export class RequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

export async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new RequestError(
      typeof data.error === "string"
        ? data.error
        : "Não foi possível concluir. Tente novamente.",
      typeof data.code === "string" ? data.code : "REQUEST_FAILED",
      response.status,
    );
  return data as T;
}
