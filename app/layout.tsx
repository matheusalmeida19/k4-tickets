import type { Metadata, Viewport } from "next";
import { SiteFooter, SiteHeader } from "@/components/Brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "K4 Ingressos", template: "%s · K4 Ingressos" },
  description: "Ingressos digitais do K4 Lounge. Acesse o link do seu evento.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  icons: { icon: "/brand/k4-logo.png" },
};
export const viewport: Viewport = {
  themeColor: "#0c0d0c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <a href="#conteudo" className="skip-link">
          Ir para o conteúdo
        </a>
        <SiteHeader />
        <main id="conteudo">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
