# Verificação — 14/10/2026

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
