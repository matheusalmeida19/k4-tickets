# Publicação do K4 Ingressos

Projeto independente: `D:/Projects/K4/k4-tickets`. Destino: Vercel com endereço `.vercel.app` e um Supabase exclusivo. O institucional continua separado.

## Arquitetura e limite desta versão

Frontend e rotas de servidor Next.js ficam no mesmo projeto Vercel, com Node.js 22.x. Não é necessário um servidor separado nem Docker na hospedagem. PostgreSQL e Auth ficam no Supabase; a aplicação acessa sua API HTTPS. `DATABASE_URL` serve às ferramentas locais e não é usada pelo runtime.

**Pagamentos reais ainda não estão implementados.** O padrão `PAYMENT_PROVIDER=unconfigured` apresenta o site sem criar pedidos. Para a apresentação autorizada, `PAYMENT_PROVIDER=demo` permite pedidos fictícios salvos e confirmação automática interna, com ingresso marcado “TESTE — SEM VALIDADE”. Esse modo exige `DEMO_EVENT_SLUG` igual a `FEATURED_EVENT_SLUG`, evento fictício (`is_demo=true`) e `DEMO_SECRET` privado de pelo menos 32 caracteres. Não gera Pix pagável nem aceita confirmação externa. Use somente dados fictícios. O provedor `simulated` continua exclusivo do computador.

O cadastro parte de uma coluna no celular e usa duas colunas a partir de 761px. Campos usam fonte de 16px; os controles principais têm pelo menos 44px de altura. O painel de compra só fica fixo em telas maiores. Não bloqueie o zoom do navegador.

## 1. Banco independente

Crie um projeto Supabase exclusivo, escolhendo região e plano no painel. Guarde a senha no gerenciador privado do responsável. Não copie volumes, dados de compradores ou credenciais locais.

As sete migrations estão em `supabase/migrations`: `202610140001` a `202610140006` e `202610150001`. A última impede tentativas `demo` sem a marca de teste. Com acesso autorizado ao projeto escolhido, confira o destino e as alterações pendentes:

```powershell
cd D:\Projects\K4\k4-tickets
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase migration list
npx supabase db push --dry-run
```

O dry-run deve mostrar somente as migrations pendentes deste repositório. Em banco existente, faça backup antes. Após conferir o projeto e a lista, a aplicação efetiva é `npx supabase db push`. Não execute `db reset` remoto. O build da Vercel não aplica migrations.

Depois execute `supabase/checks/deployment.sql` no SQL Editor, como operador confiável. As três linhas devem retornar `ok=true`: histórico de migrations, nove tabelas com RLS/permissões restritas e dez RPCs exclusivas do serviço. São consultas aos catálogos em transação somente de leitura, sem compradores ou operações financeiras.

## 2. Auth e primeiro administrador

Configure pelo painel remoto, separadamente das migrations:

- Desative cadastro público e login anônimo. A compra de ingresso não exige uma conta Auth do comprador.
- Defina o Site URL como a origem HTTPS final e restrinja redirecionamentos aos endereços exatos necessários. Previews usam banco de teste próprio.
- Preserve proteção de login e senha com no mínimo 8 caracteres, tanto no Auth quanto no formulário/API. Configure envio de e-mail próprio antes de depender de recuperação de senha; a caixa Docker é local.

**Não execute `supabase config push` com o TOML atual:** ele contém portas e URLs de desenvolvimento.

O responsável deve criar o primeiro usuário no painel Auth, usando seu e-mail verificado e senha própria. Como operador confiável, associe o UUID no SQL Editor:

```sql
insert into public.admin_users (user_id)
values ('UUID-DO-USUARIO-CRIADO-NO-AUTH')
on conflict (user_id) do nothing;
```

Não use senha de exemplo nem conceda acesso por metadados do cliente. O script `admin:provision` permanece exclusivo do banco local.

## 3. Variáveis

Use `.env.production.example` como lista sem credenciais e configure os valores no painel privado da Vercel. Não envie `.env.local`.

| Variável                               | Configuração                                                     |
| -------------------------------------- | ---------------------------------------------------------------- |
| `APP_BASE_URL`                         | Origem HTTPS final `.vercel.app`, sem caminho ou parâmetros      |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL HTTPS do projeto Supabase remoto                             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key pública ou anon legada do mesmo projeto          |
| `SUPABASE_SECRET_KEY`                  | Secret key privada ou service_role legada, somente servidor      |
| `TRACKING_SECRET`                      | Segredo privado aleatório e estável para acompanhamento          |
| `RATE_LIMIT_SECRET`                    | Outro segredo privado aleatório para limites de requisição       |
| `PAYMENT_PROVIDER`                     | `unconfigured` ou `demo` restrito ao evento fictício                                      |
| `CHARGE_TTL_SECONDS`                   | `900`, inteiro entre 30 e 86400                                  |
| `FEATURED_EVENT_SLUG`                  | Opcional: slug exato de um evento publicado para mostrar na home |
| `DEMO_EVENT_SLUG` | Obrigatório no modo demo; igual ao evento em destaque |
| `DEMO_SECRET` | Segredo aleatório privado de pelo menos 32 caracteres no modo demo |

`npm run deploy:secrets` gera os dois segredos independentes sem imprimi-los, em `work/production-secrets.env`. O arquivo é excluído do Git e do upload; o comando recusa sobrescrevê-lo. Transfira pelo painel privado e mantenha uma cópia segura para novos deployments. Trocar `TRACKING_SECRET` impede recriar a mesma credencial em retries antigos; links já emitidos continuam validados pelo hash salvo no banco. No Windows, mantenha a pasta protegida pela ACL do seu usuário.

Não configure `DATABASE_URL`, `SIMULATION_SECRET` nem segredos com prefixo `NEXT_PUBLIC_` na Vercel. Variáveis públicas entram no bundle do navegador. Não reutilize segredos de produção em previews.

`npm run deploy:check` verifica somente os valores presentes no processo. Não carrega `.env.local`, não faz conexões e não imprime valores. Para conferir um arquivo privado preparado pelo operador:

```powershell
node --env-file=work/deployment.env node_modules/tsx/dist/cli.mjs scripts/check-deployment.ts
```

Esse arquivo deve conter toda a configuração publicada, sem variáveis locais. Aprovação estrutural não autentica chaves nem comprova a configuração do banco/Auth.

## 4. Vercel

Crie um projeto novo para os ingressos, sem reutilizar o vínculo `.vercel` do institucional. Se importar uma pasta que contém os dois sites, selecione `k4-tickets` como Root Directory; se importar apenas este repositório, a raiz já está correta.

- Framework Next.js; Node 22.x, fixado no `package.json`.
- Instalação `npm ci`; build `npm run deploy:check && npm run build`, definidos em `vercel.json`.
- Não use exportação estática: a aplicação precisa das rotas de servidor.
- Configure as variáveis de Production antes do build. Confirme a origem final em `APP_BASE_URL` e no Supabase Auth.
- Mantenha o endereço `.vercel.app`, sem domínio próprio. Os links do institucional só devem mudar quando os ingressos estiverem publicados e conferidos.

Mudanças de variáveis exigem novo deployment. Para a primeira apresentação, use somente o ambiente configurado. Previews precisam de Supabase isolado, segredos próprios e `APP_BASE_URL` correspondente à origem HTTPS exata do preview.

Para mostrar um evento na home, crie e revise o evento no administrador e configure `FEATURED_EVENT_SLUG`. Apenas eventos publicados são carregados; rascunhos continuam ocultos. Não há catálogo automático. O cadastro só abre em evento fictício explicitamente autorizado no modo `demo`, dentro dos prazos e com vendas abertas. Pausa, rascunho e encerramento continuam bloqueando novos pedidos. Não use `simulated` no ambiente publicado.

## 5. Verificação e recuperação

Execute as verificações do README antes de publicar. `test:published` usa o build real e somente o banco local, nas portas 3009, 3010 e 3011; encerre `npm run dev` antes dessa suíte.

Depois de publicar, confira:

1. `/api/health`: HTTP 200, `{"status":"ok","payments":"disabled"}` e `no-store`. HTTP 503 indica configuração ou banco indisponível, sem detalhes na resposta pública. Esse endpoint verifica uma RPC de leitura; não certifica Auth, todas as migrations ou pagamentos.
2. Home, evento, termos, privacidade e login do responsável, sem compartilhar credenciais.
3. Larguras de 320px, 390px, 768px e desktop: sem rolagem horizontal, campos/botões acessíveis, teclado numérico no CPF e textos sem cortes. Confira também em iPhone real antes de afirmar validação nesse aparelho.
4. Rascunhos ocultos e pedidos privados protegidos. No modo demo, confira cadastro, pedido salvo, confirmação interna e ingresso de teste sem Pix; fora desse modo, confira compra desabilitada. Teste somente com dados fictícios.

Em falha, retorne ao deployment anterior pela Vercel e confira suas variáveis. Rollback da aplicação não desfaz o banco: preserve backup e compatibilidade; corrija o esquema com nova migration revisada, sem resetar pedidos. Registre deployment e migrations, sem credenciais.

## Antes de vendas reais

Ainda faltam provedor financeiro e credenciais, integração autenticada, homologação de criação/consulta/notificações, conciliação e tratamento das exceções, além de revisão do conteúdo pelo responsável. Preserve a confirmação transacional e idempotente. Não existe endpoint público de aprovação manual. O simulador local não é um gateway de produção.

## Referências oficiais

- [Vercel: versão do Node](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel: variáveis por ambiente](https://vercel.com/docs/environment-variables)
- [Supabase: ambientes e migrations](https://supabase.com/docs/guides/deployment/managing-environments)
- [Supabase: db push e dry-run](https://supabase.com/docs/reference/cli/supabase-db-push)
- [Supabase: Auth](https://supabase.com/docs/guides/auth/general-configuration) e [redirecionamentos](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase: chaves públicas e privadas](https://supabase.com/docs/guides/getting-started/api-keys)
