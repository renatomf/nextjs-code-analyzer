# ADR-005 — Job runner da ingestão e da análise

- **Status:** proposta
- **Data:** 2026-10-02
- **Fase do roadmap:** 5 — Ingestão assíncrona

## Contexto

Hoje tudo roda dentro de uma request:

- **Importação** (TD-10): a server action baixa o zip (até 100 MB),
  descompacta e grava `project_files`. Zip, arquivos e lotes ficam na
  memória ao mesmo tempo.
- **Análise:** `POST /api/projects/[id]/analyze` (`maxDuration` 300 s),
  chamada pela página de progresso, roda `runFullProjectAnalysis` inteira:
  arquivos → chunking (Tree-sitter, síncrono, TD-09) → embeddings → índice →
  métricas e regras → LLM → relatório.
- **Travamentos** (TD-11): análise parada em `processing` só volta a rodar
  quando alguém abre a página de progresso depois de 360 s
  (`STALE_AFTER_SECONDS`); importação parada só falha quando alguém abre a
  página. Sem retry: um erro transitório (Groq, Hugging Face, Neon) vira
  `failed`.

Restrições que decidem a escolha:

- **Custo zero, Vercel Hobby.** Cron no Hobby roda **uma vez por dia**, com
  precisão de ±59 min; expressão mais frequente quebra o deploy (docs da
  Vercel, lidas em 2026-10-02).
- **ONNX só em duas funções** (TD-05): o binário tem 46 MB e entra por
  `outputFileTracingIncludes` só em `analyze` e `chat`. Incluir em mais
  rotas impede a Vercel de agrupá-las e estoura o limite de 12 funções por
  deploy. Onde o embedding rodar, o binário precisa ir junto.
- **Código do usuário não sai do nosso controle** (mesma regra do Sentry,
  Fase 4): o que um runner externo grava (entradas e saídas de step) não
  pode ter código, tokens nem segredos.
- **Rodar local e no CI** (integração em Postgres descartável, E2E na build
  de produção).

## Problema

Onde e como rodar a importação e a análise fora da request do usuário, com
retry com backoff, idempotência por step, limite de tempo e progresso, sem
custo e dentro do limite de funções do Hobby?

## Opções consideradas

1. **Vercel Workflows** (Workflow SDK, `"use workflow"` / `"use step"`).
   - Prós: retry por step nativo (3 por padrão, `maxRetries`,
     `RetryableError` com `retryAfter` para backoff, `FatalError` para erro
     do usuário); estado durável e replay entre deploys; mesmo provedor do
     deploy (sem conta, chave ou webhook novos); World local para
     desenvolvimento; observabilidade de cada run no painel. Hobby inclui
     50 mil eventos e 1 GB gravado por mês: um step gera 3 eventos, então
     uma análise de ~8 steps fica em ~30 eventos, ~1.600 análises por mês.
   - Contras: os steps rodam na função gerada `/.well-known/workflow/v1/flow`
     (SDK v5) — ela passa a precisar do ONNX e conta no limite de 12;
     **precisa ser medido num preview antes de aceitar**. Cada step continua
     limitado pela duração da função (300 s), sem timeout próprio. Entradas
     e saídas de step ficam gravadas na Vercel (retenção de 1 dia no Hobby;
     donos do time leem decifrado): só ids podem passar entre steps. Prende
     o orquestrador à Vercel (o SDK é aberto, mas o World Postgres exige
     processo de longa duração, não serverless). SDK novo, ainda com versões
     beta.
2. **Inngest.**
   - Prós: maduro, retry/backoff/concorrência/throttle nativos, painel,
     dev server local; não depende do provedor do deploy.
   - Contras: fornecedor e segredos novos (signing key, event key);
     endpoint `/api/inngest` que também precisaria do ONNX (mesma questão do
     limite de funções); free com 50 mil execuções, 5 steps simultâneos e
     histórico de 24 h, e pausa ao atingir o teto; dados de step num terceiro
     fora do host atual.
3. **Fila no Postgres + cron.** Tabela de jobs com lease (`locked_until`),
   tentativas e `run_after`.
   - Prós: nenhum serviço novo; tudo testável em integração; ONNX continua
     só em `analyze`.
   - Contras: no Hobby **não há quem consuma a fila** com frequência — o
     cron é diário. O motor teria de ser a própria request (`after()` /
     auto-chamada autenticada da rota a cada step) mais o polling da página
     de progresso, ou seja, a mesma dependência de alguém com a aba aberta
     que existe hoje. Retry, backoff, lease e reaper seriam código nosso.
4. **Não fazer nada.** Mantém TD-09, TD-10 e TD-11; o critério de saída da
   v2.0 ("análise rodando em job, com retry e sem projetos travados") não é
   cumprido.

## Decisão (proposta)

**Opção 1, Vercel Workflows**, condicionada a um spike num preview que
prove:

1. O deploy fica dentro de 12 funções com o ONNX na função `flow`
   (e o `outputFileTracingIncludes` de `analyze` some, se a análise sair da
   rota).
2. O modelo de embeddings carrega e roda dentro de um step (cold start
   medido com o span `embeddings.model_load`).
3. `npm run dev`, a integração e o E2E rodam com o World local, sem rede.

Se o item 1 ou 2 falhar, a escolha passa a ser a **opção 3**, com a página
de progresso como motor e o cron diário só como reaper.

Motivo principal: é a única opção que dá retry com backoff e retomada
durável sem custo, sem fornecedor novo e sem depender do usuário estar com
a página aberta. Inngest resolve o mesmo, mas acrescenta um terceiro com
dados de step e segredos para gerir; a fila própria não tem motor no Hobby.

### Resultado do spike (2026-10-02)

Branch descartável `spike/vercel-workflow` (PR #88, fechado sem merge),
`workflow@5.0.1`, Next 16.3.6, deploy de preview no Hobby. Um workflow com
steps que só devolvem números; tamanhos lidos com `vercel inspect --json`.

| Pergunta | Resultado |
|---|---|
| Funções no deploy | **7 de 12** (produção: 6). Entra só a `flow`; o webhook do Workflow é agrupado com as rotas leves. |
| ONNX dentro de um step | Funciona: vetor de 384 dimensões; carga do modelo + 1 embedding em 1.273 ms (provável cold start, primeira chamada do deploy). |
| Postgres dentro de um step | `select 1` em 316 ms, com a conexão. |
| Retry com backoff | `RetryableError` com `retryAfter: "5s"`: falhou na 1ª tentativa e passou na 2ª. |
| `FatalError` | Run terminou `failed` em menos de 45 s; o número de tentativas não foi lido (a rota do spike não expõe os eventos). |
| Pipeline real na `flow` | Carrega, mas a função ficou com **262.166.566 bytes (250,02 MiB)**: no limite de 250 MiB, sem folga (TD-41). |
| Timeout da `flow` | 300 s, igual ao da `analyze`. |
| Dependências | `workflow@5.0.1` traz alertas altos (`devalue` ≤ 5.9.2, que serializa os dados dos steps, e `nanoid` fixado em `@workflow/core`); o OSV do CI bloqueia o merge como está. A CLI ainda se anuncia como beta. |
| World local (dev/CI) | Não testado: o `.env.local` pode apontar para produção. Fica para o primeiro PR da implementação, contra o Postgres local. |

Achado fora do spike: a `analyze` **de produção** já tem 247,8 MiB, a ~2 MiB
do limite (TD-41). O risco de tamanho existe com ou sem job runner.

Conclusão: as perguntas 1 e 2 passaram. A opção 1 continua a proposta, com
duas pré-condições antes de migrar o pipeline: (a) enxugar as funções com
ONNX e medir a folga (TD-41); (b) os alertas do `workflow` resolvidos por
versão nova ou `overrides`, ou aceitos com prazo no `osv-scanner.toml` se
não forem alcançáveis — nunca ignorados sem análise.

**Atualização (2026-10-02, PR #91): pré-condição (a) cumprida.** O peso
não era do pipeline: o `postinstall` do `onnxruntime-node` baixa, em Linux
x64, os providers de GPU (CUDA/TensorRT, ~258 MiB), e o `next.config.ts`
empacotava a pasta inteira. Só com o runtime de CPU, a `analyze` caiu de
247,8 para 34,1 MiB e o `chat` de 243,9 para 30,4 MiB (`vercel inspect`);
análise e chat validados no preview. A `flow` com o pipeline deve ficar na
mesma faixa da `analyze`. Resta a pré-condição (b).

**Outbox sem tabela nova.** O roadmap pede eventos de domínio gravados na
mesma transação do estado. Enquanto o único consumidor é o job, o próprio
projeto é a outbox: a transação que cria o projeto (ou pede a reanálise)
grava `status = queued`; depois do commit, `start()` dispara o workflow e
grava o `runId`. Projeto `queued` sem `runId` há mais de N minutos é
redisparado (pela página de progresso e pelo cron diário). Uma tabela de
outbox genérica só entra com um segundo consumidor (por exemplo, e-mail ou
webhook de saída), com ADR.

## Trade-offs e consequências

- **Regras obrigatórias dos steps:**
  - Só ids (`userId`, `projectId`, versão) entram e saem de um step; código,
    arquivos, chunks e tokens ficam no Postgres. Testado.
  - Todo step é idempotente (o SDK entrega pelo menos uma vez): substituir
    em vez de inserir, `content_hash` para não reprocessar (TD-03).
  - Todo step reconfere a posse (`userId`) e o cancelamento (projeto
    apagado → `FatalError`), como os checkpoints de hoje.
  - Erro do usuário (sem arquivos JS/TS, zip inválido) é `FatalError`;
    rede, Groq, Hugging Face e Neon usam retry com backoff.
  - Cada step cabe em 300 s; o embedding é dividido em lotes se a medição
    mostrar que não cabe.
- **Sai da rota `analyze`:** o claim/stale (`STALE_AFTER_SECONDS`), o
  `maxDuration` de 300 s e o ONNX. A rota passa a só validar, checar cota e
  rate limit, e enfileirar.
- **Progresso** continua no Postgres (`progress_step`, `progress_percent`),
  escrito pelos steps; a página só lê.
- **Cota:** reembolso (ADR-003, TD-12) só quando o workflow falha de vez
  por erro nosso, não a cada tentativa.
- **Fica pior:** o fluxo deixa de ser uma chamada que dá para depurar
  localmente de ponta a ponta sem o runtime do Workflow; mais um painel
  para olhar (Vercel Observability, além do Sentry); dependência da
  disponibilidade do Vercel Queues.
- **Revisar esta decisão se:** sair da Vercel; a `flow` voltar a se
  aproximar de 250 MiB; o deploy passar de 12 funções;
  o volume passar de ~1.500 análises por mês (fim da cota de eventos do
  Hobby); ou o embedding sair para uma API (ADR-006, TD-05), o que tira a
  restrição do ONNX e torna as opções 2 e 3 mais baratas de operar.
