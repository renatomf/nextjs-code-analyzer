# Roadmap v2 — do tutorial a uma plataforma de Code Intelligence

Consolida o roadmap original de 18 fases, o [brainstorm-v2.md](brainstorm-v2.md)
e as dívidas do [technical-debt.md](technical-debt.md) (TD-xx). Onde os três
divergem, vale este documento. **O escopo da v2.0 está fechado**: o que não
estiver aqui vai para a v2.x ou v3.

**Narrativa:** "peguei uma aplicação RAG full-stack funcional, medi,
identifiquei os limites e evoluí de forma incremental, com testes, medições e
ADRs".

---

## 0. Regras do jogo

1. **Nada muda sem rede de testes.** Nenhum refactoring entra com CI vermelho
   ou sem teste cobrindo o comportamento tocado.
2. **Um módulo por vez (strangler).** O código antigo em `src/lib` convive com
   `src/modules` até cada módulo migrar por completo. Nada de "big bang".
3. **Arquitetura onde há regra de negócio.** Clean Architecture e DDD tático em
   ingestion, analysis, chat, billing e projects. UI, CRUD simples e a
   integração com NextAuth ficam pragmáticos.
4. **Interface (porta) só quando existem 2+ implementações ou quando o teste
   precisa de um fake.** Sem interfaces artificiais.
5. **Medir antes de otimizar.** Evals e observabilidade vêm antes de mexer em
   prompt, RAG ou performance. Nenhum número vai para o README sem medição.
6. **Segurança continua sendo corrigida na hora**, em qualquer fase. As regras
   do CLAUDE.md (sessão no servidor, escopo por `userId`, zod, erros genéricos,
   rate limit) valem para todo código novo.
7. **Trunk-based:** branches curtas, PR pequeno, CI obrigatório. Uma tag por
   marco (`v1-tutorial`, `v2.0.0`, `v2.1.0`...). Nada de branch `v2` de longa
   duração.
8. **Escopo fechado.** Ideia nova durante a v2.0 vai para a seção
   [Backlog v2.x](#backlog-v2x--v3), não para a fase atual.

### Definition of Done (toda fase)

- [ ] Código + testes (unit e integração quando tocar DB ou provider externo)
- [ ] CI verde: lint, typecheck, unit, integração, build, regras de arquitetura
- [ ] Nenhuma regressão no E2E do fluxo principal
- [ ] Métrica antes × depois registrada, quando a fase promete ganho
- [ ] ADR quando houver decisão com alternativas reais, escrita com as
      próprias palavras
- [ ] `technical-debt.md` atualizado (TDs resolvidos marcados, novos registrados)
- [ ] Retro de 5 linhas em `docs/retros/`
- [ ] Consigo explicar o fluxo e as decisões da fase sem consultar nada

---

## 1. Escopo da v2.0

Cada fase tem itens **obrigatórios** (a v2.0 não sai sem eles) e itens
**se sobrar** (entram se houver tempo; senão vão para a v2.x sem culpa).

### Planejamento

| Fase | Estimativa (semanas) | Real | Status |
|---|---|---|---|
| Marco 0 — Congelar a v1 | | | |
| 1 — Baseline | | | |
| 2 — Rede de segurança | | | |
| 3 — Monólito modular + Clean Architecture | | | |
| 4 — Observabilidade e custo | | | |
| 5 — Ingestão assíncrona | | | |
| 6 — Segurança e dados | | | |
| 7 — Evals + qualidade da análise | | | |
| Encerramento v2.0 | | | |

### Critérios de saída da v2.0

- [ ] CI verde em todo PR, com testes de IDOR e o E2E do fluxo principal
- [ ] Zero import de `@/lib/db` / `@/db/schema` em `src/app`
- [ ] Regras de dependência entre camadas e módulos verificadas no CI
- [ ] Análise rodando em job, com retry e sem projetos travados
- [ ] Relatório sai (só determinístico) mesmo com o LLM fora
- [ ] Token de GitHub só com leitura (GitHub App)
- [ ] `npm run eval` com resultado versionado; nenhuma categoria do próprio
      repo zerada por ruído
- [ ] `baseline.md` × números atuais publicados no README

---

## Marco 0 — Congelar a v1

- [ ] Tag `v1-tutorial` no commit atual (é o "antes" de toda a história).
- [ ] README real no lugar do template do `create-next-app`: o que o app faz,
      stack, setup local, variáveis de ambiente (sem valores), diferenças em
      relação ao tutorial (Drizzle/Neon, camada de segurança).

## Fase 1 — Baseline

**Obrigatório**

- [ ] `docs/architecture.md` descrevendo **como está**, não como deveria ser:
  - C4 nível 1 e 2 (usuário, Next.js, Neon/pgvector, Groq, GitHub, Stripe,
    Hugging Face hub).
  - Fluxos: importação (GitHub/ZIP → `project_files`), análise
    (`POST /api/projects/[id]/analyze` → `runFullProjectAnalysis`, síncrono,
    `maxDuration = 300`), chat RAG, billing/webhook.
  - Mapa de acoplamento: 6 pages, as actions, as rotas e `lib/analysis`
    falam direto com Drizzle e Groq.
- [ ] `docs/baseline.md`, com data e método de cada medida:

| Métrica | Como medir |
|---|---|
| Duração da análise | 3 repositórios de referência (pequeno, médio, este repo) |
| Latência do chat | p50/p95 de 20 perguntas fixas |
| Tokens e custo por relatório | log das chamadas ao Groq |
| Score do próprio repo | 41/100; Code Quality 0 e Testing 0 (detalhamento abaixo) |
| Testes | 7 arquivos unitários, 1 E2E (landing), sem CI |

**Detalhamento do score do próprio repo** (só a parte determinística, antes
de qualquer achado do LLM):

- Code Quality: base 72 − 96 = 0. Um arquivo grande + 12 "funções
  complexas", a maioria componentes React com JSX longo, e um falso positivo
  (`const categoryScores = (...)` contado como função de 262 linhas, TD-31).
- Testing: base 40 − 108 = 0. Cobertura por nome de arquivo de 5% (−12) +
  8 "áreas críticas sem teste" (−12 cada), das quais parte é UI com `auth` no
  caminho e 2 são scripts de `.claude/skills/**`.
- Causa principal: penalidade linear e sem teto em `scoreFromIssues`.

## Fase 2 — Rede de segurança

**Obrigatório**

- [x] **CI no GitHub Actions:** `lint`, `typecheck`, `test`, `build`. Actions
      fixadas por SHA. Checks obrigatórios no ruleset da `main`.
- [ ] **Migrations só via `drizzle-kit migrate`** no CI e em produção
      (`db:push` apenas local). Mudanças incompatíveis no padrão
      expand/contract. *Parcial:* o CI aplica as migrations reais a cada
      execução; falta documentar e padronizar a aplicação em produção e no
      branch `preview`.
- [x] **Banco isolado para os testes de integração:** Postgres + pgvector
      (pg18) como service container do GitHub Actions, com as migrations
      reais do Drizzle a cada execução. Troca da ideia original ("branch do
      Neon por PR"): custo zero, sem dados de produção, sem segredos no CI, e
      sem esbarrar no limite de branches do plano gratuito.
- [x] **Previews sem dados nem segredos de produção (TD-36):** um único
      branch **schema-only** do Neon (`preview`) para todos os previews, e
      variáveis só de preview na Vercel (sem `AUTH_URL`, com `AUTH_SECRET`,
      `ENCRYPTION_KEY` e `GROQ_API_KEY` próprios; OAuth e Stripe só em
      produção).
- [ ] **Testes de caracterização**, por prioridade de risco:
  1. [x] Segurança (código puro): `extract` (zip-slip, zip bomb, symlink,
     limite de entradas, arquivo sensível), `encryption` (ida e volta,
     adulteração, AAD de outro usuário), estado OAuth do GitHub (expirado,
     nonce, usuário, HMAC), `validations/auth` (limites, senha > 72 bytes).
  2. [x] Núcleo da análise: `chunking` (tipos de nó, profundidade, tamanho),
     regressão do falso positivo `const x = (expr)` em `metrics` (TD-31),
     `scoreFromIssues` fixando o comportamento atual.
  3. [ ] Regras de billing do TD-25 (reset à meia-noite UTC, `past_due`
     mantendo premium).
- [ ] **Fronteira HTTP** (handler chamado direto, `auth()` mockado): sem
      sessão → 401, input inválido → 400 sem detalhes internos, rate limit →
      429.
- [ ] **Webhook do Stripe (TD-37):** rota com verificação de assinatura
      (`constructEvent`) que sincroniza cancelamento, falha de pagamento e
      expiração; teste de assinatura inválida → 400.
- [x] **Testes de integração de IDOR:** o usuário B nunca lê, altera ou apaga
      um projeto, arquivo, relatório ou chat do usuário A. Também cobrem o
      limite de projetos sob concorrência e a exclusão em cascata.
- [ ] **E2E do fluxo principal (Playwright):** registrar → upload de um ZIP
      fixture → analisar → relatório → chat. LLM e embeddings via fake
      (`MockLanguageModel` do AI SDK, só no ambiente de teste).
- [x] **Dependências:** Dependabot (npm + Actions) e `osv-scanner` no CI,
      com exceções com prazo em `osv-scanner.toml`; origem dos pacotes menos
      conhecidos verificada no npm (`cn`, `shadcn`, `@neon/*` são dos
      mantenedores oficiais); `@shadcn/react` e `@neon/env` removidos (sem
      uso), `@neon/config` movido para dev. `shadcn` fica em `dependencies`
      (o `globals.css` importa `shadcn/tailwind.css`).
- [x] **Migrar `@xenova/transformers` → `@huggingface/transformers`**
      (TD-35), com teste de equivalência dos embeddings e revisão do modelo
      fixada (TD-05).

**Se sobrar**

- [ ] Acessibilidade com `@axe-core/playwright` nos E2E.

## Fase 3 — Monólito modular + Clean Architecture

**Estrutura alvo**

```
src/
├── app/                  # entrega: pages, route handlers e server actions finos
├── components/           # UI por feature (mesmos nomes dos módulos), shared/, ui/
├── modules/
│   ├── identity/         # usuários, credenciais, conexão GitHub
│   ├── projects/         # ciclo de vida do projeto, fontes (GitHub, ZIP)
│   ├── ingestion/        # extração, filtros, chunking, embeddings, indexação
│   ├── analysis/         # métricas, relatório, issues, score
│   ├── chat/             # RAG conversacional
│   └── billing/          # planos, cota, Stripe, webhooks
│       ├── domain/          # entidades, value objects, regras (TS puro)
│       ├── application/     # commands, queries e as portas que usam
│       ├── infrastructure/  # Drizzle, Stripe, Groq, GitHub...
│       └── index.ts         # API pública do módulo + composition root
└── shared/               # erros, logger, db, crypto, rate-limit, env
```

**Regras de dependência** (no CI com `dependency-cruiser`):

- `domain` não importa `application`, `infrastructure`, `next`,
  `drizzle-orm`, `ai` nem `stripe`.
- `application` depende só de `domain` e das próprias portas.
- Um módulo só importa outro pelo `index.ts` dele.
- `src/app` e `src/components` nunca importam `db` ou `@/db/schema`.
- React nunca entra em `src/modules`.

**Ordem de migração**

1. **billing** — piloto: já tem testes, regras claras, pouco acoplamento.
   Define as convenções. Resolve TD-24.
2. **projects + ingestion** — aggregate `Project`, cota consumida no use case
   (TD-12, ADR), TD-14, TD-04.
3. **analysis** — relatório, métricas e score atrás das portas de LLM e
   embeddings.
4. **chat** — RAG atrás de `VectorStore` e `LlmProvider`.
5. **identity** — um único fluxo de conexão com o GitHub (TD-16), lista única
   de rotas protegidas (TD-20), `publicErrorMessage` em `shared` (TD-32).

**Obrigatório**

- [ ] Módulos billing, projects/ingestion e analysis migrados.
- [ ] Queries por módulo para todas as pages (sai o Drizzle de `src/app`).
- [ ] `dependency-cruiser` no CI.
- [ ] `docs/glossary.md` (linguagem ubíqua).
- [ ] Erro de domínio seguro para o usuário (TD-33).
- [ ] Env vars validadas por um schema zod único em `shared/env`, falhando no
      boot (hoje: 36 leituras de `process.env` espalhadas).
- [ ] **Front** (ver [Front e estado](#front-e-estado)): hook
      `useAnalysisProgress`, `report/page.tsx` dividido em seções server
      component, filtros do issues dashboard na URL, fetch do explorer com
      `AbortController`; Testing Library + jsdom para os componentes
      interativos.

**Se sobrar**

- [ ] Módulos chat e identity.
- [ ] Mutation testing (Stryker) só em `modules/*/domain`.
- [ ] Orçamento de bundle: garantir que `@xenova/transformers` e `tree-sitter`
      nunca entrem no bundle do cliente.

## Fase 4 — Observabilidade e custo

Vem antes da ingestão assíncrona: job em segundo plano sem log é caixa preta.

**Obrigatório**

- [ ] Logger estruturado no servidor: erro real, correlation id, segredos
      removidos. O cliente continua recebendo a mensagem genérica (TD-26).
- [ ] Sentry (erros + tracing) com PII e código-fonte fora dos eventos.
- [ ] Tokens, custo e latência por chamada de LLM, gravados por `userId` e
      `projectId`.
- [ ] Orçamento de tokens por usuário/dia e teto por análise (hoje o limite é
      por número de requisições, não por custo).
- [ ] Kill switch (flag) para desligar chat ou relatório por LLM sem deploy.

**Se sobrar**

- [ ] Health check e runbooks: "Groq fora", "projeto travado", "webhook do
      Stripe falhando".
- [ ] Alerta de gasto diário do LLM.

## Fase 5 — Ingestão assíncrona

**Obrigatório**

- [ ] ADR do job runner: Inngest × Vercel Workflow × fila no Postgres + cron.
      Critérios: retry com backoff, idempotência por step, timeout, custo,
      rodar local.
- [ ] Pipeline em steps idempotentes: `ImportRequested → Extract → Filter →
      Chunk → Embed → Index → ProjectIndexed`, com `content_hash` para não
      reprocessar (TD-03). Domain events gravados via outbox na mesma
      transação do estado.
- [ ] Progresso vindo do job; sai a lógica de claim/stale da rota `analyze`;
      reaper para projetos travados (TD-10, TD-11).
- [ ] Parsing fora da thread da request (TD-09); modelo de embeddings com
      retry e cache resolvidos (TD-01; TD-05 com ADR).
- [ ] **Degradação graciosa:** com o LLM fora ou sem cota, o relatório sai só
      determinístico, sinalizado como tal.
- [ ] Webhooks do Stripe deduplicados pelo `event.id`.

## Fase 6 — Segurança e dados

**Obrigatório**

- [ ] GitHub App com `contents: read`, instalação por repositório e tokens de
      curta duração (TD-15, ADR). Remove o escopo `repo` de escrita.
- [ ] CSP com nonce, começando em `Report-Only` (TD-34).
- [ ] Retenção: `project_files` e `code_chunks` apagados após N dias sem uso.
- [ ] Exclusão de conta de ponta a ponta: cascade + cancelamento no Stripe +
      teste provando que nada sobra (LGPD).
- [ ] Página de dados: o que vai para o Groq, por quanto tempo e onde fica
      guardado.

**Se sobrar**

- [ ] Sessões revogáveis (TD-18, ADR) e rotação de chave de criptografia
      (TD-19).
- [ ] RLS com role da aplicação que não é dona das tabelas + políticas por
      `userId` (TD-21).
- [ ] Rate limiter: contar só logins com falha, limpar linhas antigas por
      cron (TD-17).
- [ ] Treino de restore (PITR do Neon num branch, tempo medido e documentado).
- [ ] Modelo de ameaças STRIDE e `SECURITY.md`.

## Fase 7 — Evals + qualidade da análise

**Primeiro o harness, depois as melhorias**, sempre comparando com o baseline.

**Obrigatório**

- [ ] `evals/` com dataset versionado: este repo, OWASP Juice Shop e 2 ou 3
      repositórios pequenos com violações conhecidas e anotadas, mais casos
      de prompt injection (TD-28).
- [ ] `npm run eval` → `evals/results/<data>.json`: precisão/recall dos
      achados, falsos positivos, groundedness do chat, recall do retrieval,
      latência, tokens e custo.
- [ ] Prompts em arquivos versionados; PR que altera prompt ou retrieval roda
      o eval e falha se a qualidade cair.
- [ ] **Dogfooding:** o analisador roda no próprio repo a cada PR e publica
      score e achados; gráfico do score ao longo das fases no README.
- [ ] Melhorias, cada uma num PR com eval antes × depois:
  1. Excluir `.claude` e outras pastas de ferramenta/docs em
     `ALWAYS_EXCLUDE_DIR_NAMES` (`src/lib/limits.ts`).
  2. Amostrar chunks do projeto inteiro no relatório, em vez dos 80 primeiros
     em ordem alfabética (`report.ts`).
  3. Agrupar achados repetidos (uma linha "Critical area may lack tests" com a
     lista de arquivos).
  4. Score com penalidade limitada por regra ou decrescente
     (`scoreFromIssues`).
  5. Achados high/critical exigem arquivo + trecho como evidência; prompt mais
     restritivo; código tratado como dado, não como instrução (TD-28).
  6. Heurísticas determinísticas: corrigir a regex de funções (TD-31), não
     medir componentes React só por linhas, critério melhor para "área
     crítica".
  7. Timeout e limites aplicados no servidor (TD-29); migrar para
     `generateText` + `Output.object` (TD-30).

**Se sobrar**

- [ ] Chunk no tamanho real do tokenizer (TD-02), sem duplicar métodos de
      classe (TD-08), modelo de embedding gravado junto do vetor (TD-03).
- [ ] Índice HNSW no `embedding` (TD-22), latência medida antes e depois.
- [ ] Achados classificados com CWE / OWASP (ASVS, Top 10 for LLM).

## Encerramento da v2.0

- [ ] Remover as classes `ca-*` sem uso do `globals.css`.
- [ ] README como estudo de caso: problema, arquitetura (C4), antes × depois
      medido, gráfico do dogfooding, links para as ADRs.
- [ ] Conta ou projeto de demonstração já analisado (quem avalia não precisa
      conectar o GitHub nem esperar uma análise).
- [ ] Vídeo de 2 a 3 minutos do fluxo principal.
- [ ] Artigo técnico (ex.: "por que o meu analisador deu 0 para o próprio
      código").
- [ ] Decisões pendentes respondidas (ver abaixo).
- [ ] Tag `v2.0.0`.

### Renomear para `nextjs-codedriven` (pendente)

Já feito: repositório do GitHub, `package.json`, projeto no Neon e nome do
projeto na Vercel. Falta, nesta ordem:

1. [ ] **Domínio de produção** `nextjs-code-analyzer.vercel.app` →
       `nextjs-codedriven.vercel.app`, tudo na mesma sessão para não quebrar
       login e billing: adicionar o domínio novo na Vercel e redirecionar o
       antigo; `AUTH_URL` e `NEXT_PUBLIC_APP_URL` de Production; callbacks do
       GitHub OAuth App (`/api/auth/callback/github` e `/api/github/callback`)
       e do Google OAuth (`/api/auth/callback/google`); URL do webhook no
       Stripe (`/api/stripe/webhook`); redeploy de produção.
2. [ ] Comentários "Code Analyzer" em `globals.css`, `ui/button.tsx` e
       `ui/select.tsx` (o `CLAUDE.md` mantém a referência ao tutorial
       original `AI-Code-Analyzer`).
3. [ ] **Por último**, a pasta local `nextjs-code-analyzer` →
       `nextjs-codedriven` (fechar o VS Code antes). O histórico do Claude
       Code é por caminho de pasta: a pasta nova começa uma sessão nova.

---

## Arquitetura: o que entra e o que fica de fora

### Entra

| Conceito | Onde neste projeto | Fase |
|---|---|---|
| Monólito modular | `src/modules/*`, cada um com API pública no `index.ts` | 3 |
| DDD estratégico | Bounded contexts = módulos; `docs/glossary.md`; context map (billing só expõe "tem cota?" para projects) | 3 |
| DDD tático | Aggregates `Project` (máquina de estados `queued → processing → completed/failed`) e `Subscription`; value objects `SafeFilePath`, `RepoRef`, `Score`, `Plan`; repositórios por aggregate | 3 |
| Clean / Hexagonal | Portas `LlmProvider`, `Embedder`, `VectorStore`, `SourceProvider`; adaptadores Groq, xenova, pgvector, GitHub/ZIP (depois Ollama e pasta local) | 3, v2.2 |
| SOLID | Principalmente DIP (use case depende da porta) e SRP (rota fina, use case, adaptador) | 3 |
| CQRS leve | Commands = use cases que alteram estado; queries = leituras para as pages. Mesmo banco | 3 |
| Event-driven | Domain events (`ProjectImported`, `AnalysisCompleted`) em processo, depois gatilho de jobs duráveis | 3 → 5 |
| Outbox / idempotência | Evento gravado na mesma transação do estado; webhooks deduplicados | 5 |
| Resiliência | Timeout em toda chamada externa, retry com backoff, reaper, degradação graciosa | 5 |
| Observabilidade | Logs estruturados, correlation id, tracing, métricas de LLM (tokens, custo, latência), Sentry | 4 |
| Segurança como arquitetura | Defesa em profundidade, menor privilégio, código analisado tratado como dado não confiável | 6 |
| Fitness functions | Regras de camada e de módulo no CI (`dependency-cruiser`) | 3 |
| Arquitetura de testes | Domínio em unit puro; use cases com fakes das portas; adaptadores em integração; E2E do fluxo principal | 2, 3 |
| Arquitetura de IA | Pipeline RAG em estágios, evals versionados, eval no CI | 7 |
| Decisões documentadas | ADRs com opções rejeitadas; C4 nível 1 e 2 | Todas |

### Fica de fora

| Não usar | Motivo |
|---|---|
| Microsserviços | Um desenvolvedor, um deploy; módulos com fronteira limpa são fáceis de extrair se um dia precisar |
| Kafka / RabbitMQ | O job runner cobre o volume e é mais simples de operar |
| Event sourcing | Nenhum requisito de auditoria ou reconstrução de estado que justifique o custo |
| CQRS com banco de leitura separado | Um Postgres atende; o CQRS leve basta |
| Container de DI | Funções factory no `index.ts` resolvem sem mágica |
| Micro-frontends | Um app só |
| DDD tático em tudo | CRUD simples e a integração com NextAuth ficam diretos |

---

## Front e estado

### Componentização

- Dividir quando o componente tem mais de um motivo para mudar, mistura
  efeitos/fetch com markup, ou é reutilizado. **Não** dividir por número de
  linhas.
- Lógica em hooks, visual em componentes: `useAnalysisProgress` sai de
  `analysis-progress.tsx` (319 linhas, 3 `useEffect`, polling, retry).
- Pages longas viram seções server component que recebem dados prontos
  (`report/page.tsx`: `ScoreOverview`, `CategoryCards`, `RoadmapList`).
- A landing (`src/app/page.tsx`) só é dividida quando for alterada.
- Pastas: `ui/` (só shadcn), `shared/` (reuso entre telas), `<feature>/`
  (mesmos nomes dos módulos). Sem atomic design, sem abstrações headless
  genéricas.

### Estado

| Tipo | Onde mora | Mudança na v2 |
|---|---|---|
| Dados do servidor | Server Components chamando queries dos módulos | Sai o Drizzle das pages |
| Mutações | Server actions + `useActionState` (já usado) | Action vira adaptador fino do use case |
| Invalidação | `revalidatePath` | Centralizada por módulo; Cache Components só se o baseline pedir, com `userId` na tag |
| Filtros e seleção | `searchParams` | Filtros do issues dashboard saem do `useState` |
| Processo longo | Hook `useAnalysisProgress` | Na Fase 5, consome o progresso do job |
| Streaming de IA | `useChat` (já usado) | Mantém; histórico persistido no servidor |
| Fetch sob demanda | Hook por caso de uso | `AbortController` quando a seleção muda |
| Visual | `useState` local | Mantém |

**Fica de fora:** Zustand/Redux/Jotai (não há estado de cliente
compartilhado), React Query/SWR (seria um segundo cache concorrendo com o
RSC), Context global para usuário/plano (regras validadas no servidor).
Qualquer biblioteca nova de estado exige ADR.

---

## Backlog v2.x / v3

Fora do escopo da v2.0. A ordem pode mudar conforme as decisões pendentes e
os evals.

- **v2.1 — Code Intelligence:** AST do repositório inteiro (símbolos,
  imports/exports, grafo de dependências; TD-07), métricas pela AST (TD-31),
  ferramentas determinísticas com licença verificada (`dependency-cruiser`,
  `jscpd`, `knip`, `gitleaks`, `osv-scanner`; **não** usar regras do Semgrep
  Registry nem CodeQL num SaaS sem checar a licença), LLM explicando
  evidências (arquivo + linha), busca híbrida e citações se o eval mostrar
  ganho.
- **v2.2 — Primeiras análises + modo local:** violações de camada e ciclos,
  hotspots (churn × complexidade), autorização e multi-tenancy, segurança de
  IA, qualidade dos testes, cada uma com eval. CLI via `npx` com Ollama,
  pasta local e pgvector em Docker; zero telemetria com código.
- **v2.3 — Agents, tools e regras do time:** tools sobre a Code Intelligence
  (`search_code`, `get_file`, `find_symbol`, `find_dependencies`,
  `inspect_call_graph`), chat como agente, servidor MCP, gateway de LLM só
  com 2+ providers reais, regras de arquitetura do time verificadas por PR.
- **v3+ — Produção e produto:** teste de carga, pool de conexões, lote de
  embeddings, arquivos em object storage (TD-06, TD-13, TD-23), SLOs,
  postmortems, validação do nicho.

---

## Decisões pendentes (prazo: fim da v2.0)

Mudam o roadmap a partir da v2.2.

| Pergunta | Impacto |
|---|---|
| Portfólio, produto ou os dois? | Quanto investir em billing, onboarding e suporte |
| Open source (CLI) + SaaS, ou só SaaS? | Licença do repo e ferramentas que podem ser integradas |
| Due diligence técnica é o nicho? Com quem conversar primeiro? | Quais análises priorizar na v2.2 |
| Quantas horas por semana? | Estimativas de cada fase |

---

## ADRs previstas (`docs/decisions/`)

| # | Decisão | Fase |
|---|---|---|
| 001 | Monólito modular + Clean Architecture seletiva | 3 |
| 002 | Regras de arquitetura no CI (`dependency-cruiser`) | 3 |
| 003 | Cota consumida em falha do sistema × erro do usuário (TD-12) | 3 |
| 004 | Limites de custo do LLM e kill switch | 4 |
| 005 | Job runner da ingestão + outbox | 5 |
| 006 | Embeddings em runtime serverless (TD-05) | 5 |
| 007 | GitHub App no lugar do OAuth App (TD-15) | 6 |
| 008 | Retenção e exclusão de dados | 6 |
| 009 | Estratégia de evals e gate no CI | 7 |
| 010 | Fórmula do score (penalidade com teto) | 7 |

Formato: contexto, problema, opções (inclusive as rejeitadas), decisão,
trade-offs, consequências.

## TD → fase

| Fase | TDs |
|---|---|
| 2 — Rede de segurança | TD-25, TD-27 |
| 3 — Clean Architecture | TD-04, TD-12, TD-14, TD-16, TD-20, TD-24, TD-32, TD-33 |
| 4 — Observabilidade | TD-26 |
| 5 — Ingestão assíncrona | TD-01, TD-03 (hash), TD-05, TD-09, TD-10, TD-11 |
| 6 — Segurança | TD-15, TD-34 · se sobrar: TD-17, TD-18, TD-19, TD-21 |
| 7 — Evals + qualidade | TD-28, TD-29, TD-30, TD-31 · se sobrar: TD-02, TD-03, TD-08, TD-22 |
| v2.1 — Code Intelligence | TD-07, TD-31 (AST) |
| v3+ — Produção | TD-06, TD-13, TD-23 |

## Diferenças em relação ao roadmap original de 18 fases

- **Observabilidade sobe** para antes da ingestão assíncrona.
- **Evals vêm antes de qualquer mudança em prompt ou RAG**, não depois do
  gateway de LLM.
- **Gateway, MCP e performance esperam necessidade real** (YAGNI).
- **ADRs são escritas durante as fases**, não numa fase própria no fim.
- **`domain/application/infrastructure` só nos módulos com regra de negócio.**
- **Escopo com linha de corte** e critérios de saída mensuráveis.
