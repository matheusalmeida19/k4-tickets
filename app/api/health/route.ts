import { deploymentIssues } from "@/lib/server/deployment";
import { rpc } from "@/lib/server/database";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    if (
      (process.env.NODE_ENV === "production" || process.env.VERCEL) &&
      deploymentIssues().length
    ) {
      return json({ status: "unavailable" }, 503);
    }
    // Read-only RPC: no buyer data, credentials, orders or payment mutations.
    const now = await rpc<string>("database_now", {});
    if (!Number.isFinite(Date.parse(now)))
      throw new Error("DATABASE_UNAVAILABLE");
    return json({ status: "ok", payments: "disabled" });
  } catch {
    return json({ status: "unavailable" }, 503);
  }
}
