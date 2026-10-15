import type { Metadata } from "next";
import { AdminLogin } from "@/components/AdminLogin";
export const metadata: Metadata = { title: "Acesso administrativo" };
export default function LoginPage() {
  return (
    <div className="container login-page">
      <AdminLogin />
    </div>
  );
}
