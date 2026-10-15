"use client";
import { Icon } from "@/components/Icons";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="container state-page">
      <p className="eyebrow">TENTE NOVAMENTE</p>
      <h1>Não foi possível carregar.</h1>
      <p>
        O serviço está temporariamente indisponível. Seus pedidos permanecem
        salvos.
      </p>
      <button className="button button-primary" onClick={reset}>
        Tentar novamente <Icon name="arrow" />
      </button>
    </section>
  );
}
