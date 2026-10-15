import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { appBaseUrl, privateSecret } from "./config";
import { rpc } from "./database";
import { AppError } from "./errors";
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };
export function json(value: unknown, status = 200): NextResponse { return NextResponse.json(value, { status, headers: PRIVATE_HEADERS }); }
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) return json({ code: error.code, error: error.message }, error.status);
  if (error instanceof ZodError || error instanceof SyntaxError) return json({ code: "INVALID_INPUT", error: "Confira os dados enviados." }, 400);
  return json({ code: "SERVICE_UNAVAILABLE", error: "O serviço está indisponível. Tente novamente em alguns instantes." }, 503);
}
export function sameOrigin(request: Request): void {
  if (request.headers.get("origin") !== appBaseUrl() || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("ORIGIN_DENIED", "Origem da solicitação não autorizada.", 403);
}
export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError("INVALID_INPUT", "Envie os dados no formato adequado.", 415);
  if (Number(request.headers.get("content-length") ?? 0) > 8192) throw new AppError("INVALID_INPUT", "Solicitação muito extensa.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing JSON body");
  const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 8192) { await reader.cancel(); throw new AppError("INVALID_INPUT", "Solicitação muito extensa.", 413); }
    chunks.push(chunk.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function rateLimit(request: Request, scope: string, limit = 60, windowSeconds = 60): Promise<void> {
  // Vercel sets x-real-ip at the trusted edge. Local requests share a development bucket.
  const client = process.env.VERCEL ? (request.headers.get("x-real-ip") ?? "unknown") : "local";
  const digest = createHmac("sha256", privateSecret("RATE_LIMIT_SECRET")).update(`${scope}:${client}`).digest("hex");
  const accepted = await rpc<boolean>("consume_rate_limit", { p_key: digest, p_limit: limit, p_window_seconds: windowSeconds });
  if (!accepted) throw new AppError("RATE_LIMITED", "Muitas tentativas. Aguarde um momento e tente novamente.", 429);
}
export const orderCookieName = (id: string) => `k4_order_${id.replaceAll("-", "")}`;
