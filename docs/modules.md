# Convenção dos módulos

Como os módulos de `src/modules/` são organizados, segundo a
[ADR-001](decisions/001-modular-monolith.md). Nasceu provisória no piloto
(billing) e virou definitiva na
[ADR-002](decisions/002-module-convention.md), depois dos seis módulos da
Fase 3. Abaixo, o detalhe e as decisões de cada módulo.

## Estrutura

```
src/modules/<módulo>/
├── domain/          # regras em TypeScript puro (sem banco, sem framework, sem process.env)
├── application/     # use cases e as portas (interfaces) que eles usam
├── infrastructure/  # implementações das portas: Drizzle, Stripe, GitHub, ONNX...
├── index.ts         # API pública PURA: tipos, regras, nada de banco
└── server.ts        # API pública de SERVIDOR: use cases ligados ao banco ("server-only")
```

## Regras (verificadas no CI por `npm run lint:arch`)

| Regra | Por quê |
|---|---|
| `domain/` não importa application, infrastructure, `src/lib`, `src/db` nem frameworks | Regras testáveis sem banco e sem mocks |
| `application/` não importa infrastructure nem Drizzle/Stripe/Next | Use cases dependem de portas, não de implementações |
| Fora do módulo, só `index.ts` e `server.ts` | O interior pode mudar sem quebrar quem usa |
| `index.ts` não importa banco nem `server-only` | Importável em qualquer lugar (inclusive componentes e testes puros) |
| Sem React dentro de módulos; sem ciclos | UI fica em `src/app` e `src/components` |

## Decisões do piloto (billing)

- **Duas entradas públicas.** `index.ts` (puro) e `server.ts` (banco). Surgiu
  porque `@/lib/db` cria a conexão no import: um `index.ts` com banco
  obrigaria qualquer código que só quer ler um limite de plano a carregar o
  banco.
- **Configuração fora do domínio.** O domínio recebe um `PlanConfig`; quem lê
  `process.env` é `infrastructure/plan-config.ts`.
- **Transações sem vazar o Drizzle.** Os use cases recebem as portas; o
  `server.ts` monta as portas com o executor certo (`billingFor(tx)`).
- **Operações que exigem lock expõem a transação pronta** (`withQuota`): lock
  → checagem → trabalho → registro do uso, tudo ou nada. Quem chama declara
  se consumiu a cota (`{ consumed, value }`), porque a reanálise pode
  terminar sem consumir. O trabalho dentro dela deve ser só escrita rápida no
  banco — downloads e extração ficam fora.
- **Strangler.** O código antigo (`src/lib/billing/*`) vira fachada que delega
  ao módulo, com as mesmas assinaturas; os testes existentes provam que nada
  mudou. Depois os chamadores migram e a fachada é apagada.
- **Stripe atrás de uma camada anticorrupção, sem porta.** Os tipos do Stripe
  param em `infrastructure/stripe/`: `translate.ts` converte status e preço
  para os termos do billing, e a regra de negócio (`entitlementFor`: preço
  desconhecido nunca dá premium; `past_due` mantém o plano) é domínio puro.
  Não há interface `PaymentGateway`: só existe uma implementação, e a ADR-001
  cria porta só com duas ou mais.
- **Código movido leva os testes junto.** Ao mover arquivos (`git mv`), os
  testes existentes mudam só o caminho dos mocks, nunca as asserções; o diff
  prova que o comportamento é o mesmo.
- **Dependência pesada carregada sob demanda.** O `server.ts` importa o
  Stripe com `import()` dentro das funções, para quem só usa a cota (análise,
  chat) não carregar o SDK na cold start.

## Decisões do módulo chat

- **Domínio = política do prompt:** `buildChatSystemPrompt` e
  `extractLastUserText` são puros e têm tipo próprio para o chunk
  recuperado (`RetrievedChunk`), sem depender do ingestion.
- **Sem porta de LLM ainda:** a troca de provedor (Groq ou o fake do E2E)
  já acontece em `getLanguageModel`; a porta nasce com o Ollama (v2.2).
- **A rota continua dona do HTTP e do streaming** (validação, rate limit,
  `streamText`); o projeto e a checagem de knowledge vêm do projects
  (`getChatProject`), com o mesmo formato de consulta de antes.

## Decisões do módulo analysis

- **Domínio puro e sem APIs do Node:** o `index.ts` é importado por
  componentes de cliente (tipos e cores das issues), então nada de `path`
  (o `basename` é uma operação de string; os caminhos guardados usam `/`).
- **`Rule` transforma medidas em achados:** a detecção (tamanho, funções
  longas, testes, segredos) roda uma vez e alimenta as regras, a nota e os
  resumos. Cada regra tem seu limite de achados.
- **`ScoringPolicy` é uma função trocável** (`linearPenaltyPolicy` é a de
  hoje); a Fase 7 cria outra e compara as duas com o eval.
- **`Finding.evidence` existe mas ainda não é preenchido:** preencher muda
  as issues salvas, então entra com a Fase 7.
- **Ficam para depois:** `LlmReviewer` (a troca de provedor já acontece no
  nível do modelo, com o fake do E2E) e `AnalysisRunner` (Fase 5).

## Decisões do módulo ingestion

- **Primeiras portas do projeto:** `Embedder` e `VectorStore`, porque um
  teste precisa de fake (ADR-001): o caso de uso `storeKnowledge` é testado
  sem banco e sem baixar o modelo. O adaptador real é verificado pelo teste
  do modelo (vetores de referência) e pela integração em Postgres.
- **`SourceProvider` adiado:** GitHub e ZIP já convergem no `importArchive`
  (projects); a porta nasce com a pasta local da v2.2, a implementação que a
  justifica.
- **Chunking ainda em `src/lib`:** usa Tree-sitter (binário nativo); entra no
  módulo quando o pipeline de análise migrar.

## Decisões do módulo projects

O esboço em papel previa uma classe `Project` com `claimForAnalysis()` e um
repositório com `save()` por concorrência otimista (update condicional pelo
status lido). Ao implementar, ficou assim:

- **Regra pura + UPDATE condicional com a mesma regra.** `analysisStart`
  (domínio) decide se a análise pode começar; `claimAnalysis`
  (infraestrutura) faz um único `UPDATE ... WHERE` com a mesma regra, que é o
  que garante a atomicidade. O `save` otimista foi descartado: mudaria a
  condição do claim atual (de "estado que permite começar" para "estado que
  eu li") sem ganho, e o claim atual já é provado por teste.
- **A regra existe em dois lugares, e os testes amarram os dois:** testes
  unitários da regra pura e testes de integração em Postgres real, inclusive
  um que força duas requisições a lerem "queued" antes de qualquer claim.
  Esse teste foi verificado com mutação: sem a condição de status no
  `UPDATE`, ele falha.
- **Funções em vez de classe.** O estado vem do banco a cada request e a
  regra é uma função pequena; uma classe só embrulharia os mesmos dados.
- **Sem interface de repositório:** uma implementação só (ADR-001). Todas as
  escritas de status ficam em `infrastructure/drizzle-project-lifecycle.ts`,
  sempre com o escopo por dono (`userId` da sessão).
- **Integração com o billing pela API pública:** a reanálise chama
  `startReanalysis(tx, …)` dentro do `withQuota` do billing, então claim e
  registro de uso entram na mesma transação.
