# Verificação — 14/10/2026

## Atualização — página inicial com cadastro, 15/10/2026

Escopo: somente `D:/Projects/K4/k4-tickets`, sem deploy. A apresentação e o evento de demonstração agora compartilham a página inicial. O checkout ocupa a coluna direita, no lugar da ilustração, e os detalhes ficam abaixo da apresentação na coluna esquerda. No layout móvel, a ordem é apresentação, cadastro e detalhes.

O evento vem do Supabase local: próxima demonstração publicada e futura, criada com prefixo `demonstracao-local-`. Rascunhos e eventos reais não são promovidos. A disponibilidade e o pagamento continuam usando as mesmas verificações do servidor; `/ingressos/[slug]` reutiliza `EventDetails` e mantém os links individuais.

Evidências novas: lint e TypeScript aprovados; 10 testes unitários, 23 de integração, 7 HTTP e 2 do artefato production/preview aprovados; build de produção local aprovado. Os testes novos verificam cadastro na home, seleção apenas de demonstração publicada, atualização de disponibilidade e preservação da rota individual. O artefato production/preview não exibe o cadastro de demonstração nem permite simulação.

Um teste de integração preexistente comparava um prazo criado pelo relógio do computador com o relógio do Docker, usando apenas 50 ms de tolerância. Reproduziu tanto encerramento antecipado quanto ausência da rejeição esperada; a instrumentação mostrou prazo gravado ainda 243 ms no futuro para uma janela nominal de 200 ms. O teste passou a definir e aguardar o prazo no relógio do próprio banco. A suíte completa e duas repetições isoladas passaram, sem alteração das regras de vendas, RPCs ou migrações; a instrumentação temporária foi removida.

Navegador Chrome: duas colunas no computador; uma coluna com cadastro antes dos detalhes no modo móvel; ausência de transbordamento horizontal nas larguras efetivas observadas (1686, 500 e 406 px). Validação de formulário vazio mostra erros de nome, CPF e aceite sem criar pedido. Não foi utilizado Safari/iPhone físico. Override de viewport removido ao final.

## Evidência histórica da primeira versão

Nota de localização, 15/10/2026: o usuário moveu o projeto para `D:/Projects/K4/k4-tickets`, agora o diretório autorizado. A evidência abaixo registra a execução original, anterior à mudança.

Escopo: repositório independente `D:/Projects/K4/K4Ingressos`, branch main sem commits. Nenhum deploy, push, migration remota, banco Pix ou envio de mensagens. Site institucional protegido e sem alterações desta tarefa.

## Evidências executadas

| Comando | Resultado |
| --- | --- |
| `supabase migration up --local` | 001–006 aplicadas no projeto Docker K4Ingressos, PostgreSQL 54332 |
| `npm run lint` | exit 0, sem avisos |
| `npm run typecheck` | exit 0 |
| `npm run test` | 10 aprovados |
| `npm run test:integration` | 23 aprovados, PostgreSQL real |
| `npm run test:e2e` | 5 aprovados, servidor HTTP real e Supabase Auth |
| `npm run build` | exit 0, Next.js 16.3.4 |
| `npm run test:published` | 1 aprovado, artefato compilado local/production com Vercel preview flags recusa checkout simulado |
| `npm run db:start` | wrapper inicia instância local e descarta saída com credenciais |
| `npm run demo` / `npm run demo -- --open` | evento fictício, rascunho por padrão, abertura explícita local |
| `npm run simulate -- <pedido fictício> confirmed` | confirmação interna válida, ingresso emitido automaticamente |

## Comportamentos comprovados

- Nome/CPF inválidos, CPF repetido inválido, payload com preço/status adulterados rejeitados. Apóstrofos ASCII/tipográficos e acentos aceitos no banco e aplicação.
- Janela de vendas validada com relógio do banco, evento draft/pausado/fechado/futuro bloqueado, reserva/repetição de cobrança sem ultrapassar encerramento.
- Criação concorrente idempotente, snapshot comercial imutável, compras distintas com mesmo CPF permitidas.
- Notificação autenticada, repetições/simultaneidade com um ingresso, confirmação preservada contra status antigo, exceções divergentes/incompletas preservadas.
- Pagamento efetivamente tempestivo com notificação tardia aceito; efetivamente atrasado fica registrado sem ingresso/política financeira inventada.
- Virada exata de sábado às 00h de Manaus encerra somente o benefício e preserva o mesmo ingresso emitido.
- Credencial de pedido não abre outro pedido; acesso anônimo negado; cookie HttpOnly; QR sem CPF e distinto da credencial de acompanhamento.
- Admin sem autorização negado; Supabase Auth real, associação restrita, cadastro público desativado, sessão revogada recusada; CRUD/publicar/pausar/encerrar com auditoria e conflito de versão.
- RLS/grants impedem leitura/escrita/execução financeira pública; rate limit atômico em PostgreSQL; origem e tamanho de body protegidos; respostas privadas sem cache.
- Produção/preview bloqueia a simulação apesar da flag privada; nenhuma cobrança real sem adapter configurado.

## Verificação visual

Navegador real: landing, evento/checkout, cadastro fictício, pedido pendente e emissão automática após script interno; login administrativo. Larguras de 320, 375 e 1280 px verificadas, sem transbordamento horizontal nos pontos observados. Impressão possui stylesheet dedicado, com ingresso legível em fundo branco e selo de teste. Impressão física não foi executada.

Capturas locais ignoradas pelo Git: `work/k4-ingressos-inicio.jpg` e `work/ingresso-mobile.jpg`. Nenhuma captura contém credencial do link privado. O QR exibido é exclusivamente de teste.

## Revisão independente

Agente `independent_review`, somente leitura: **Looks good / Review Gate PASS**, sem P0–P3 restantes. Executou lint e os 10 testes unitários independentemente; reavaliou correções e demais evidências do responsável. Correções resultantes: versão original em edição administrativa, escopo explícito das métricas, validação consistente de nomes, preservação do ingresso após meia-noite e descarte de saída sensível da CLI local.

## Limites e próximos passos humanos

Sem provedor Pix real, scanner/check-in, recuperação assistida, mensagens ou deploy, conforme escopo. Antes de vendas reais: adapter bancário autenticado/homologado, decisões de conciliação/exceções, revisão dos textos e condições pelo responsável, Supabase independente publicado e provisionamento administrativo seguro. Nenhuma credencial humana foi inventada; `admin:provision` solicita a senha escolhida pelo responsável.

Checkpoint: implementação → revisão independente concluída → entrega local. Proof e Review aprovados. Nenhuma etapa de shipping externo autorizada nesta solicitação.

Next / upcoming task: none — sequence complete.

## Preparação de publicação e mobile first — 15/10/2026

Escopo: somente `k4-tickets`. Primeira publicação definida pelo usuário como demonstração sem pagamentos reais. Não foi executado deploy, criado banco remoto, aplicado SQL remoto ou modificado o institucional.

| Verificação fresca | Resultado |
| --- | --- |
| `npm run lint` / `npm run typecheck` | exit 0 |
| `npm run test` | 16 aprovados, incluindo preflight e ausência de segredos nos diagnósticos |
| `npm run test:integration` | 24 aprovados no PostgreSQL local; catálogo confirma 6 migrations, 9 tabelas com RLS e 10 RPCs restritas |
| `npm run test:e2e` | 8 aprovados, HTTP real e Auth local; health sem dados privados |
| `npm run build` | exit 0; Next.js 16.3.4, incluindo `/api/health` |
| `npm run test:published` | 5 aprovados no build real com flags Production/Preview; evento destacado publicado sem campos de comprador, rascunho oculto e nenhum pedido criado |
| `npm run deploy:check`, sem variáveis publicadas | exit 1 esperado, lista somente os campos ausentes; `.env.local` não é carregado |
| `npm run deploy:secrets` | arquivo privado criado sem valores no output e ignorado pelo Git/upload |

Total: 53 testes aprovados. A primeira tentativa de integração no sandbox não acessou a porta local (`EACCES`); a execução autorizada fora dessa restrição passou integralmente. Não foi alterada regra de negócio para fazer testes passarem.

Browser Chrome: larguras CSS efetivamente medidas de 320px e 391px usam `intro → checkout → detalhes`, sem rolagem horizontal; campos 16px, input ~50px e botão 49px. Em 768px e 1707px, duas colunas e nenhum transbordamento. Evento individual e login também conferidos em 320px, sem transbordamento e login com campos 16px. Envio vazio no cadastro mostrou os três erros de validação sem criar pedido. O controle temporário de viewport foi removido ao final. Não foi usado iPhone físico; não se afirma homologação em Safari/iOS.

Revisão independente por leitura dos arquivos de publicação, home, guards, health e SQL concluída sem bloqueadores materiais. Limites: credenciais, Auth e estado do Supabase remoto ainda não verificados; publicação e migração remota não executadas. O guia `DEPLOYMENT.md` registra configuração e sequência para essa etapa.

## Publicação autorizada — 15/10/2026

Supabase exclusivo criado no plano Free, seis migrations aplicadas e três verificações de catálogo aprovadas. Auth com cadastro público/anonimato desativados e login por e-mail disponível para administradores provisionados pelo responsável. Evento fictício publicado com vendas pausadas; nenhuma conta administrativa de exemplo ou dado de comprador foi transferido.

Next.js e ESLint Next atualizados de16.3.4 para16.3.8 após o alerta do build. Repetidos com sucesso: lint, tipos, build,16 unitários,24 integrações PostgreSQL local,8 HTTP e5 testes de artefato publicado. `npm audit --omit=dev`: zero alertas. Cinco avisos de desenvolvimento na cadeia de glob do ESLint foram classificados pela revisão independente como não bloqueadores de runtime desta demonstração, sem aplicar downgrade forçado.

Deployment `dpl_4S51JZuqLcTZBeqqY9xRFUCbmpJr` Ready, build remoto aprovado e URL pública sem login https://k4-tickets.vercel.app. Health200/disabled; páginas públicas200; API administrativa401; compras503 `PAYMENT_UNAVAILABLE`; banco permaneceu com0 pedidos após o teste. Asset oficial da logo conferido por hash. Chrome publicado320/390/768/1280px sem overflow, com viewport restaurado. Evidências e recuperação em `RELEASE-2026-10-15.md`.
