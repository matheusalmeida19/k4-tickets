import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { AppError } from "./errors";
export async function authClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new AppError("AUTH_UNAVAILABLE", "Autenticação indisponível.", 503);
  const store = await cookies();
  return createServerClient(url, key, { cookieOptions: { httpOnly: true, secure: process.env.APP_BASE_URL?.startsWith("https://") ?? true, sameSite: "lax", path: "/" }, cookies: { getAll: () => store.getAll(), setAll: (items) => { try { for (const { name, value, options } of items) store.set(name, value, options); } catch { /* Server-component refresh is performed by proxy. */ } } } });
}
