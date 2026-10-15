import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/server/admin";
import { AdminDashboard } from "@/components/AdminDashboard";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Administração" };
export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return <AdminDashboard />;
}
