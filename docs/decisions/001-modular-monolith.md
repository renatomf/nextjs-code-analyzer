# ADR-001 — Monólito modular com Clean Architecture seletiva

- **Status:** aceita
- **Data:** 2026-09-29
- **Fase do roadmap:** 3 — Monólito modular + Clean Architecture

## Contexto

O codedriven é um único app Next.js 16 (App Router) na Vercel, com Neon
Postgres + pgvector, Groq como LLM, embeddings locais (ONNX) e Stripe.
Fatos medidos no fim da Fase 2 ([architecture.md](../architecture.md),
[baseline.md](../baseline.md)):

- **Não há camada entre a entrega e o banco:** 12 arquivos de `src/app`
  (6 pages, 6 route handlers) consultam o Drizzle diretamente; 27 arquivos
  no total usam o cliente do banco.
- **Regras repetidas ou espalhadas:** o escopo "projeto do usuário"
  (`eq(projects.userId, …)`) se repete em dezenas de consultas; o estado do
  projeto (`queued → processing → completed/failed`) muda em pelo menos três
  lugares (rota `analyze`, server actions, pipeline).
- **Integrações sem interface:** LLM (3 arquivos chamam o Groq), embeddings e
  origem do código (GitHub/ZIP) são usados diretamente por quem precisa deles.
- **Gargalo medido:** ~0,11 s por chunk de embeddings em CPU, **dentro da
  request** (`maxDuration` 300 s) — teto de ~2.700 chunks por análise.
- **Restrições:** um desenvolvedor; custo zero; plano Hobby da Vercel (no
  máximo 12 funções por deploy; o runtime ONNX de 46 MB só cabe em duas
  rotas).
- **Rede de segurança já existe:** 169 testes unitários, 10 de integração em
  Postgres real, E2E do fluxo completo e CI obrigatório para merge.
- **Necessidade futura real:** o modo local da v2.2 exige **outra
  implementação** de LLM (Ollama), de origem do código (pasta local) e de
  armazenamento, sem mudar as regras de negócio.

## Problema

As regras de negócio (dono do projeto, ciclo de vida da análise, cota do
plano, pontuação do relatório) estão misturadas com Next, Drizzle, Groq e
Stripe. Trocar o Groq pelo Ollama, ou tirar a análise de dentro da request,
exigiria mexer em rotas, actions e no pipeline ao mesmo tempo, sem uma
fronteira que diga onde cada coisa pode ser alterada. Como organizar o código
para que essas mudanças fiquem localizadas, sem criar mais estrutura do que o
projeto precisa?

## Opções consideradas

Critérios: esforço e risco da migração, custo de operar, se habilita o modo
local, testabilidade e risco de excesso de engenharia.

1. **Manter como está.**
   - Prós: zero esforço agora.
   - Contras: a duplicação cresce a cada feature; o modo local exigiria `if`
     de ambiente espalhados; o status do projeto continua sem dono; testar
     regras exige banco ou mocks do Drizzle.

2. **Monólito modular com Clean Architecture seletiva** (escolhida).
   - Prós: um deploy e um banco (cabe no Hobby e no custo zero); fronteiras
     explícitas por domínio; portas só onde já existem duas implementações;
     regras testáveis sem banco; migração incremental.
   - Contras: mais arquivos e indireção nos módulos com camadas; custo de
     mapear entre linhas do banco e objetos de domínio; período de convivência
     entre código antigo e novo.

3. **Clean Architecture em todo o projeto.**
   - Prós: uniformidade.
   - Contras: entidades, use cases e repositórios para telas sem regra
     (settings, perfil, dashboard) só adicionam arquivos e indireção; aumenta o
     esforço sem reduzir risco; é o excesso de engenharia que este projeto
     evita.

4. **Microsserviços** (por exemplo, ingestão como serviço separado).
   - Prós: escalar a ingestão de forma independente.
   - Contras: mais deploys, redes, autenticação entre serviços e bancos para
     uma pessoa operar; não cabe no custo zero nem no limite do Hobby; o
     problema de escala medido (análise dentro da request) se resolve com uma
     fila (Fase 5), sem separar o sistema.

## Decisão

Adotar um **monólito modular**, com **Clean Architecture apenas nos módulos
com regra de negócio**.

- **Módulos** em `src/modules/`: `billing`, `projects`, `ingestion`,
  `analysis`, `chat` e `identity`, cada um com uma API pública (`index.ts`).
  `src/shared/` concentra o que é transversal (logger, env, erros, cliente do
  banco, criptografia, rate limit).
- **Camadas** `domain/ application/ infrastructure/` em billing, projects,
  ingestion, analysis e chat. `identity` é integração (NextAuth, OAuth) e
  CRUD: fica só com `application` e `infrastructure`.
- **Regra de dependência:** `domain` não importa Next, Drizzle, AI SDK nem
  Stripe; `application` depende só de `domain` e das próprias portas;
  `src/app` chama use cases e queries, nunca o banco; um módulo só importa
  outro pelo `index.ts`.
- **Portas apenas com duas ou mais implementações reais** (o fake de teste
  conta): `LlmProvider` (Groq · fake do E2E · Ollama), `Embedder`,
  `VectorStore`, `SourceProvider` (GitHub · ZIP · pasta local), repositórios
  (Drizzle · em memória), `PaymentGateway` e `AnalysisRunner` (síncrono hoje ·
  fila na Fase 5).
- **DDD tático onde paga:** aggregate `Project` como único dono da máquina de
  estados; value objects `RepoRef` e `SafeFilePath`; `Finding`, `Rule` e
  `ScoringPolicy` na análise; eventos de domínio só em processo.
- **Injeção de dependência por funções factory** no `index.ts` de cada módulo,
  sem container: a composição fica explícita e legível em um só arquivo.
- **Garantia por máquina:** as regras de dependência são verificadas pelo
  `dependency-cruiser` no CI e bloqueiam o merge.
- **Migração incremental (strangler):** um módulo por PR, com teste de
  caracterização no nível do use case antes de mover e remoção do código
  antigo no mesmo PR. **Billing é o piloto:** tem testes (unitários e de
  integração), regras claras (cota em UTC, carência do `past_due`, webhook
  idempotente) e poucos dependentes, então define as convenções com o menor
  risco.

## Trade-offs e consequências

**O que melhora**

- Cada regra passa a ter um dono: o escopo por usuário fica no repositório,
  o ciclo de vida no aggregate, a pontuação na `ScoringPolicy`.
- Trocar um provedor (LLM, embeddings, origem do código) vira uma nova
  implementação de porta, sem tocar nas regras — o que viabiliza o modo local.
- Regras testáveis sem banco; use cases testáveis com fakes em milissegundos.
- A análise pode sair da request (Fase 5) trocando a implementação de
  `AnalysisRunner`, sem reescrever o fluxo.
- Metas verificáveis: arquivos de `src/app` com acesso ao banco de 12 para 0;
  lugares que mudam o status do projeto de 3+ para 1.

**O que piora**

- Mais arquivos e mais saltos para seguir um fluxo nos módulos com camadas.
- Mapeamento entre linhas do banco e objetos de domínio nos repositórios.
- Durante a migração, código antigo e novo convivem; mitigado com um módulo
  por PR e remoção imediata do caminho antigo.
- Custo de aprendizado e de disciplina: a regra vale para todo código novo.

**O que passa a ser obrigatório**

- Código novo com regra de negócio entra no módulo correspondente, nunca em
  `src/app`.
- Nova porta ou nova camada só com justificativa no roadmap ou numa ADR.
- Toda porta tem uma implementação fake usada nos testes de use case.

**O que faria rever esta decisão**

- Uma parte do sistema precisar de escala ou ciclo de deploy independentes
  que uma fila não resolva — a fronteira de módulo permite extrair essa parte
  (por exemplo, a ingestão como worker) sem reescrever as regras.
- Mudança nas restrições da plataforma (plano da Vercel, custo).
- As fronteiras gerarem mais atrito do que benefício, medido em PRs que
  precisam atravessar vários módulos para mudanças simples.
