import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Privacidade — rascunho" };
export default function PrivacyPage() {
  return (
    <article className="container legal-page">
      <p className="eyebrow">DOCUMENTO EM REVISÃO</p>
      <h1>Sua privacidade.</h1>
      <div className="notice notice-test">
        <p>
          <strong>Rascunho para revisão do responsável.</strong> Identificação
          do controlador, canal de atendimento, bases legais e prazos de
          retenção precisam ser definidos antes das vendas reais.
        </p>
      </div>
      <section>
        <h2>Dados utilizados</h2>
        <p>
          O fluxo solicita nome completo e CPF para registrar o comprador e
          associar o ingresso ao pedido. O sistema também mantém registros do
          evento, condições comerciais, cobrança, status e datas relevantes.
        </p>
        <p>
          Na fase de testes, utilize apenas dados fictícios. Não são solicitados
          dados bancários ou comprovantes.
        </p>
      </section>
      <section>
        <h2>Acesso ao pedido</h2>
        <p>
          O pedido é protegido por um link privado e por um cookie de acesso
          necessário. A credencial do link é trocada com o servidor para acessar
          apenas aquele pedido. Não há conta de comprador nesta versão.
        </p>
        <p>
          Não guardamos CPF em endereços de páginas ou no armazenamento local do
          navegador. O ingresso e seu QR Code não exibem o CPF completo; o QR
          Code usa um código exclusivo sem dados pessoais.
        </p>
      </section>
      <section>
        <h2>Acesso administrativo</h2>
        <p>
          Consultas de compradores e pedidos são restritas à equipe autorizada.
          As listagens administrativas apresentam o CPF mascarado. Ações
          administrativas relevantes são registradas para auditoria.
        </p>
      </section>
      <section>
        <h2>Infraestrutura e pagamentos</h2>
        <p>
          Esta versão utiliza banco de dados e autenticação próprios do projeto.
          A integração com um futuro provedor de pagamento ainda não está
          habilitada; não há cobrança Pix real nem envio de mensagens.
        </p>
        <p>
          Antes da operação real, o responsável deverá revisar os fornecedores
          utilizados, o tratamento dos dados, os prazos de retenção e o
          procedimento para exercício de direitos e atendimento aos titulares.
        </p>
      </section>
      <Link className="text-link" href="/termos">
        Ler termos <span aria-hidden="true">↗</span>
      </Link>
    </article>
  );
}
