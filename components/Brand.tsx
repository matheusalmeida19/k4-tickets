import Image from "next/image";
import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="K4 Ingressos — início">
      <Image
        src="/brand/k4-logo.png"
        alt="K4 Lounge"
        width={160}
        height={160}
        priority
      />
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <span className="header-label">
          K4 LOUNGE <span aria-hidden="true">/</span> INGRESSOS DIGITAIS
        </span>
        <Link className="text-link header-admin" href="/admin" prefetch={false}>
          Área administrativa
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer no-print">
      <div className="container footer-inner">
        <span>
          K4 Lounge <span className="muted">· Ingressos</span>
        </span>
        <nav aria-label="Links legais">
          <Link href="/termos">Termos</Link>
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/admin" prefetch={false}>
            Admin
          </Link>
        </nav>
      </div>
    </footer>
  );
}
