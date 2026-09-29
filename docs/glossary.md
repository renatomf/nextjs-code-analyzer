# Glossário (linguagem ubíqua)

Os termos abaixo têm **um único significado** no código, nos docs e na UI
(ver [ADR-001](decisions/001-modular-monolith.md)). Ao nomear algo novo, use
estes termos; ao precisar de um conceito novo, acrescente-o aqui no mesmo PR.

## projects

| Termo | Significado | No código |
|---|---|---|
| **Project** | Um repositório importado por um usuário para ser analisado. Pertence a exatamente um usuário. | `projects`, aggregate `Project` (Fase 3) |
| **Source** | De onde vêm os arquivos: `github` (repositório conectado) ou `upload` (ZIP). | `projects.source`, `SourceProvider` |
| **Import** | Baixar/ler a origem, extrair e guardar os arquivos seguros do projeto. Não inclui a análise. | `importFromGitHub`, `importFromZip` |
| **Project status** | Ciclo de vida: `queued` (arquivos prontos) → `processing` (análise em curso) → `completed` ou `failed`. | `projects.status` |
| **Claim** | Tomar o projeto para uma análise, garantindo que só uma rode por vez. | rota `analyze` → `Project.claimForAnalysis` |
| **Stale** | Projeto em `processing` sem atualização por mais tempo que uma análise completa: pode ser retomado. | `STALE_AFTER_SECONDS` |
| **Public report link** | URL somente leitura, com token e expiração, que expõe só o relatório. | Fase 3 |

## ingestion

| Termo | Significado | No código |
|---|---|---|
| **Project file** | Arquivo extraído e aceito pelos filtros (sem segredos, sem binários, dentro dos limites). | `project_files` |
| **Chunk** | Trecho de código delimitado pela AST (função, classe, declaração), com linhas de início e fim. | `code_chunks`, `chunkSourceFile` |
| **Embedding** | Vetor de 384 dimensões que representa um chunk para busca semântica. | `embedTexts`, `Embedder` |
| **Knowledge (base)** | O conjunto de chunks com embeddings de um projeto. Pré-requisito do relatório e do chat. | `buildProjectKnowledge` |

## analysis

| Termo | Significado | No código |
|---|---|---|
| **Analysis** | Execução completa sobre um projeto: knowledge + métricas + revisão do LLM + relatório. | `runFullProjectAnalysis` |
| **Finding** (na UI: *issue*) | Um problema encontrado, com severidade, categoria e, quando possível, evidência (arquivo, linhas, trecho). | `ReportIssue` → `Finding` (Fase 3) |
| **Severity** | `critical`, `high`, `medium`, `low`. | `IssueSeverity` |
| **Category** | `architecture`, `security`, `performance`, `codeQuality`, `testing`. | `IssueCategory` |
| **Rule** | Uma heurística determinística que produz findings a partir dos arquivos. | `computeDeterministicMetrics` → `Rule` (Fase 3) |
| **Score** | Nota de 0 a 100 por categoria; o **health score** é a média das categorias. | `scoreFromIssues` → `ScoringPolicy` (Fase 3) |
| **Report** | Resultado de uma análise: scores, resumos por categoria e findings. Um por projeto. | `reports` |
| **Roadmap** (na UI) | Os findings mais prioritários do relatório, em ordem. | `report.roadmap` |

## chat

| Termo | Significado | No código |
|---|---|---|
| **Question** | Pergunta do usuário sobre o código de um projeto. | `extractLastUserText` |
| **Context** | Os chunks mais próximos da pergunta, recuperados por busca vetorial. | `retrieveChatContext` |
| **Source** (no chat) | Chunk citado na resposta, com arquivo e linhas. | `ChatSource` |

## billing

| Termo | Significado | No código |
|---|---|---|
| **Plan** | `free` ou `premium`. Define os limites. | `users.plan`, `getPlanLimits` |
| **Plan status** | `none`, `active`, `past_due`, `canceled` — modelo próprio, traduzido dos status do Stripe. | `statusFromStripe` |
| **Quota** | Análises por dia e projetos simultâneos permitidos pelo plano. | `assertCanRunAnalysis`, `assertCanCreateProject` |
| **Quota day** | O dia da cota começa às **00:00 UTC**. | `startOfUtcDay` |
| **Grace period** | Enquanto `past_due` (renovação falhou), o usuário mantém os limites do premium. | `isPaidPlan` |
| **Usage event** | Registro de uma análise consumida, usado para contar a cota. | `usage_events` |

## identity

| Termo | Significado | No código |
|---|---|---|
| **User** | Conta autenticada (e-mail/senha, GitHub ou Google). Dono dos projetos. | `users` |
| **GitHub connection** | Token OAuth do GitHub guardado cifrado, usado para listar e baixar repositórios. | `users.githubAccessToken` |

## Transversais

| Termo | Significado | No código |
|---|---|---|
| **Domain error** | Erro cuja mensagem é escrita para o usuário e pode ser exibida. Qualquer outro erro vira mensagem genérica. | `DomainError` |
| **Request id** | Identificador que liga as linhas de log a uma requisição. | `requestIdFrom` (`x-vercel-id`) |
