import Link from "next/link";
import { Icon } from "@/components/Icons";
export default function NotFound() {
  return (
    <section className="container state-page">
      <span className="state-icon">
        <Icon name="ticket" size={30} />
      </span>
      <p className="eyebrow">LINK DO EVENTO</p>
      <h1>Não encontramos este evento.</h1>
      <p>Confira o link divulgado pelo K4 e tente novamente.</p>
      <Link href="/" className="button button-primary">
        Voltar ao início <Icon name="arrow" />
      </Link>
    </section>
  );
}
