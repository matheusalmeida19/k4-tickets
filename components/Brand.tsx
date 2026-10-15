import Image from "next/image";
import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="K4 Ingressos — início">
      <Image src="/brand/duck.png" alt="" width={52} height={52} priority />
      <span>
        <strong>
          K4<span className="brand-dot">.</span>
        </strong>
        {!compact && <small>INGRESSOS</small>}
      </span>
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
          Área administrativa <span aria-hidden="true">↗</span>
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
