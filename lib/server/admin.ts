import { authClient } from "./auth";
import { database } from "./database";
import { AppError, databaseError } from "./errors";
export async function getAdminSession(): Promise<{ id: string } | null> {
  const client = await authClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  const membership = await database().from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (membership.error) databaseError(membership.error.message);
  return membership.data ? { id: user.id } : null;
}
export async function requireAdmin(): Promise<{ id: string }> {
  const admin = await getAdminSession();
  if (!admin) throw new AppError("ADMIN_REQUIRED", "Entre com uma conta administrativa autorizada.", 401);
  return admin;
}
