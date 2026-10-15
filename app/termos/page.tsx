import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Termos — rascunho" };
export default function TermsPage() {
  return (
    <article className="container legal-page">
      <p className="eyebrow">DOCUMENTO EM REVISÃO</p>
      <h1>Termos de uso.</h1>
      <div className="notice notice-test">
        <p>
          <strong>Rascunho para revisão do responsável.</strong> As vendas reais
          não estão habilitadas nesta versão. Os ingressos de teste não têm
          validade.
        </p>
      </div>
      <section>
        <h2>Compra e ingresso</h2>
        <p>
          Cada pedido corresponde a um ingresso individual, pelo preço e nas
          condições apresentados no evento, sem taxa adicional. O pedido
          registra essas condições no momento da compra.
        </p>
        <p>
          O nome completo e o CPF são informados pelo comprador. A conferência
          matemática do CPF não comprova identidade nem consulta a Receita
          Federal.
        </p>
      </section>
      <section>
        <h2>Datas e entrada promocional</h2>
        <p>
          As datas e os horários são apresentados no fuso de Manaus
          (America/Manaus, UTC−4). O encerramento das vendas e o limite da
          entrada promocional são informados na página de cada evento.
        </p>
        <p>
          Quando a condição do evento estabelecer entrada promocional até 00h de
          sábado, após esse horário o ingresso pago permanece disponível e será
          necessário pagar a diferença na bilheteria. O valor dessa diferença
          não é definido por esta plataforma nesta etapa.
        </p>
      </section>
      <section>
        <h2>Confirmação e acesso</h2>
        <p>
          O ingresso é disponibilizado automaticamente na página privada após
          uma confirmação válida no servidor. Abrir a página ou informar que
          pagou não libera um ingresso.
        </p>
        <p>
          Guarde o link privado do pedido e não o compartilhe. Esta versão não
          envia ingressos por e-mail, mensagens ou redes sociais e não oferece
          recuperação assistida de links.
        </p>
      </section>
      <section>
        <h2>Cancelamentos e situações excepcionais</h2>
        <p>
          As condições de cancelamento, atendimento, reembolso e tratamento de
          pagamentos divergentes precisam ser revisadas e definidas pelo
          responsável antes da abertura de vendas reais, observando os direitos
          aplicáveis. Este rascunho não estabelece uma negativa definitiva de
          reembolso.
        </p>
      </section>
      <section>
        <h2>Versão de desenvolvimento</h2>
        <p>
          Os fluxos simulados são exclusivos do ambiente local. Não faça
          transferências para testar. Todo ingresso simulado exibe “TESTE — SEM
          VALIDADE”.
        </p>
      </section>
      <Link className="text-link" href="/privacidade">
        Ler privacidade <span aria-hidden="true">↗</span>
      </Link>
    </article>
  );
}
