# K4 Ingressos

Plataforma independente de ingressos do K4 Lounge, em Next.js App Router, TypeScript, Tailwind, PostgreSQL e Supabase Auth. Frontend e backend no mesmo projeto. O institucional não foi modificado.

**Esta versão funciona localmente com pagamentos simulados. Nenhum Pix pagável é gerado. Não há integração bancária, envio de mensagens ou deploy. Ingressos simulados exibem “TESTE — SEM VALIDADE”.**

## Executar localmente

Requisitos: Node.js 22+, npm e Docker Desktop em execução. Portas livres: 3008 (aplicação), 54331 (API Supabase), 54332 (PostgreSQL), 54333 (Studio), 54334 (caixa de e-mail local, sem envio externo).

```powershell
cd D:\Projects\K4\K4Ingressos
npm ci
npm run db:start
npm run db:migrate
npm run local:env
npm run dev
```

Abra [http://127.0.0.1:3009](http://127.0.0.1:3009). O projeto Supabase local chama-se `K4Ingressos`; suas portas, volumes e dados são separados dos outros projetos. `npm run db:stop` encerra somente esta instância e preserva os dados. Não use reset/prune para iniciar o projeto.

`local:env` consulta a CLI desta instância, captura suas chaves reais de desenvolvimento e gera `.env.local` ignorado pelo Git, incluindo segredos aleatórios privados para assinatura, acompanhamento e rate limit. Não imprime segredos e recusa sobrescrever um arquivo existente. Não reutilize chaves locais em produção. O modelo `.env.example` fica sem segredos.

Na pasta entregue, a instância e o servidor local já foram iniciados. `.env.local` já existe; não execute `local:env` novamente sem necessidade.

## Demonstração fictícia

```powershell
npm run demo
```

Cria um evento **fictício em rascunho**, sem vendas abertas. Para testar explicitamente a compra local:

```powershell
npm run demo -- --open
```

O comando imprime o caminho do evento de demonstração. Ele escolhe uma sexta-feira cujo encerramento ainda não passou e sugere quarta-feira às 20h e sábado às 00h de Manaus. Não cria evento real, capacidade ou restrição de CPF único.

Na execução inicial, a demonstração foi aberta explicitamente em `/ingressos/demonstracao-local-2026-10-23`. Esse evento continuará sujeito ao prazo no servidor. A página inicial não contém catálogo.

1. Abra o evento de demonstração; informe um nome fictício completo e um CPF matematicamente válido de teste (por exemplo, `123.456.789-09`, sem atribuí-lo a uma pessoa real).
2. Leia as condições e continue no ambiente de teste. Salve o link privado completo da página do pedido.
3. Copie apenas o UUID do pedido mostrado no resumo, para usar no terminal local:

```powershell
npm run simulate -- <UUID-do-pedido> pending
npm run simulate -- <UUID-do-pedido> confirmed
```

4. A consulta automática mostrará o ingresso. Também existe atualização manual do status; ela apenas consulta o backend.
5. Repita a confirmação: continuará existindo um único ingresso. Imprima pelo botão do ingresso.

Estados simuláveis pelo script: `pending`, `confirmed`, `expired`, `cancelled`, `error`, `unknown`. Para testar cada desfecho separadamente, crie novos pedidos. Confirmação de pedido expirado não é aprovação automática: apenas pagamento efetivamente realizado dentro da validade pode emitir ingresso. O script usa o relógio do banco para o instante sintético. Após expiração efetiva, registra uma exceção, sem inventar política de aprovação/reembolso.

O script exige configuração privada, ambiente local de desenvolvimento/teste e cobrança simulada. Produz e autentica uma notificação interna por HMAC. Não existe rota pública, botão do comprador ou botão administrativo para aprovar pagamentos.

## Primeiro administrador

```powershell
npm run admin:provision
```

O comando local solicita seu e-mail e **uma senha escolhida por você**, com 12 a 200 caracteres, em entrada oculta. Cria a conta pelo Supabase Auth administrativo e a associação restrita em `admin_users`. Não há senha padrão, cadastro público ou envio de e-mail. Acesse `/admin/login`.

Para automação local, use `K4_ADMIN_EMAIL` e `K4_ADMIN_PASSWORD` como variáveis privadas do processo, sem gravá-las no código ou no histórico do terminal. O script recusa ambiente remoto/publicado. As credenciais dos testes são geradas em tempo de execução, utilizadas somente em fixtures e removidas ao final; não são contas de acesso entregues.

Em `supabase/config.toml`, `auth.enable_signup=false` bloqueia cadastro público; `auth.email.enable_signup=true` mantém o provedor de login por senha habilitado na CLI atual. O teste HTTP comprova que `auth.signUp` é recusado. Não habilite cadastro público para resolver problemas de login.

Uma futura implantação deverá ter seu próprio Supabase Auth, cadastro público desativado e provisionamento inicial controlado pelo responsável, com identidade verificada e senha própria. A associação administrativa deve ser feita exclusivamente por operador confiável; nunca pelo navegador ou metadados editáveis do usuário. Não foi criado administrador humano nesta execução.

## Painel

- Criar/editar título, slug, descrição, data, preço e horários; horários apresentados/editados em Manaus.
- Sugerir regras de sexta-feira, deixando o início de vendas à escolha do administrador.
- Publicar após revisão explícita, pausar e encerrar. Copiar o link individual.
- Consultar pedidos, tentativas e ingressos com filtros e busca restrita por nome ou CPF, sempre mascarado nas listagens.
- Ver quantidade e valor de pedidos efetivamente confirmados; números de demonstração são dados de teste.
- Registrar ações administrativas em auditoria. Alterações do evento não alteram snapshots de compras existentes.

## Regras e integridade

Valores em centavos, BRL e um ingresso por pedido. Sem taxa adicional e sem unicidade de CPF por evento. Preço, status, janela de vendas e condições são definidos no servidor e novamente protegidos no banco. O encerramento é exclusivo: a partir de quarta-feira às 20h de Manaus não é possível criar pedido ou nova cobrança, inclusive por página antiga/requisição direta.

Instantes são armazenados como `timestamptz` em UTC; a interface usa `America/Manaus`. O limite promocional de sábado às 00h encerra o benefício, preservando o ingresso pago e indicando diferença na bilheteria sem inventar valor.

Pedidos possuem chave de idempotência e fingerprint. Snapshots de comprador/valor/condições ficam imutáveis; pedido e tentativa têm estados separados. Transações com locks, referência de pagamento única, notificações idempotentes e ingresso único por pedido evitam duplicação e regressão de uma confirmação por status antigo.

Notificações autenticadas divergentes, incompletas ou efetivamente pagas fora do prazo ficam em `payment_exceptions`. Notificação recebida depois é aceita se o pagamento efetivo ocorreu antes da expiração. Erro de comunicação permanece incerto; não significa ausência de pagamento. Não há exclusão automática de pedidos, reconciliação financeira manual ou política de reembolso inventada.

## Privacidade e proteção

O comprador não cria conta. Acompanhamento: `/pedido/<UUID>#acesso=<credencial>`. O fragmento não é enviado nos access logs HTTP. É trocado por cookie HttpOnly, SameSite e restrito ao pedido. Uma credencial não abre outro pedido. Não coloque o link completo em logs/suporte público. Preserve `TRACKING_SECRET` para manter a continuidade das repetições idempotentes: sua troca impede recriar a mesma credencial em retries antigos. Links já emitidos continuam validados pelo hash salvo no banco. A recuperação assistida de links ainda não foi implementada.

QR do ingresso contém apenas uma credencial opaca distinta, sem nome/CPF. O ingresso não mostra CPF completo. Não há CPF em URLs/localStorage, listagem pública de compradores ou chaves privilegiadas no cliente. Respostas privadas usam `private, no-store`; páginas privadas não são indexáveis. Escritas verificam origem e tamanho; rate limit atômico persiste no PostgreSQL com chaves HMAC, compatível com serverless e sem serviço adicional.

Todas as tabelas têm RLS restritiva e grants explícitos. `anon`/`authenticated` não leem dados de compradores nem executam RPCs privilegiadas. O backend usa a chave privada e revalida usuário e associação administrativa; não confia em esconder botões. Detalhes em [docs/DATABASE-CONTRACT.md](docs/DATABASE-CONTRACT.md).

## Testes

Com o Supabase local ativo e migrations aplicadas:

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:integration
# Requer npm run dev em outro terminal:
npm run test:e2e
npm run build
# Executa o build de produção localmente na porta 3009 e comprova o bloqueio de vendas:
npm run test:published
```

Os testes de integração usam PostgreSQL real na porta 54332 e fixtures próprias, sem resets. E2E faz HTTP real para a aplicação e inclui Auth, cookies, isolamento entre pedidos, criação concorrente, confirmação interna, QR, máscaras, RLS, cadastro público negado e edição administrativa com conflito de versão. A suíte de banco cobre simultaneidade, snapshots, exceções, prazos, virada promocional preservando o ingresso e auditoria. Testes de domínio cobrem CPF/nome, limites de Manaus, payload adulterado, provedor indisponível e bloqueio de simulação em produção/preview. O teste `test:published` sobe e encerra seu próprio servidor de produção local, sem criar recursos externos.

Última verificação: **39 testes aprovados** (10 unitários, 23 de integração real, 5 HTTP e 1 de produção/preview), lint, tipos e build aprovados. Revisão independente concluída sem pendências. Evidência detalhada em [docs/VERIFICATION.md](docs/VERIFICATION.md).

Use somente as variáveis do projeto local. Os testes verificam o endereço isolado antes de escrever dados. Dados dos testes são fictícios e removidos pelos próprios testes. O evento e pedido de demonstração visual permanecem identificados como teste.

## Conectar o futuro banco Pix

Contrato `PaymentProvider` em `lib/domain/types.ts`; implementações em `lib/server/payments/providers.ts`; confirmação em `lib/server/payments/confirmation.ts`. O adapter futuro implementará criar cobrança, consultar pagamento e autenticar/interpretar notificações. A emissão permanece concentrada na RPC transacional `apply_payment_notification`.

Antes de habilitar vendas reais: implementar o adapter e sua autenticação criptográfica, idempotência do provedor, conciliação e tratamento das exceções, homologar expiração/data efetiva e revisar termos/privacidade/condições com o responsável. Não publicar webhook financeiro sem autenticação. As páginas de termos/privacidade atuais são rascunhos, sem uma regra definitiva de recusa de reembolso.

`PAYMENT_PROVIDER=unconfigured` é o padrão seguro. `simulated` só funciona em `NODE_ENV=development|test`, URLs de aplicação/Supabase/PostgreSQL loopback e sem `VERCEL`/`VERCEL_ENV`. Eventos não fictícios não podem usar simulação. `NEXT_PUBLIC_*` ou parâmetros do cliente não habilitam esse modo. Em build/ambiente publicado, inclusive previews, o checkout permanece indisponível para vendas reais.

## Organização e publicação futura

`app/` contém páginas e rotas HTTP; `components/` contém interface; `lib/domain/` contém contratos/regras puras; `lib/server/` orquestra persistência, Auth e pagamentos; `supabase/migrations/` contém o banco; `scripts/` contém ferramentas locais; `tests/` contém provas unitárias, PostgreSQL e HTTP.

Repositório Git próprio já inicializado, sem commit/push nesta entrega. Dependências fixadas no lockfile. Logo do pato fornecida pelo usuário em `public/brand/duck.png`, sem redesenho; não foram inventados fotos, atrações ou endereço.

Para futura Vercel, selecione **este** diretório como novo projeto Next.js e configure um Supabase separado e variáveis próprias. `APP_BASE_URL` é configurável, links de negócio são relativos. Não copie `.env.local`, `DATABASE_URL` local ou chaves privadas para variáveis `NEXT_PUBLIC_*`. Não há vínculo/deploy/credencial do institucional neste projeto.

Fora desta versão: Pix bancário real, notificações por mensagem, recuperação assistida de links, scanner/check-in, operação offline, cartão/cupons/lotes/capacidade e reembolsos financeiros.
