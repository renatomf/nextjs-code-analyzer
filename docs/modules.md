# Convenção dos módulos (provisória)

Como os módulos de `src/modules/` são organizados, segundo a
[ADR-001](decisions/001-modular-monolith.md). **Provisória:** nasceu no piloto
(billing) e só vira definitiva — numa ADR-002 — depois do segundo módulo
(projects), que tem um aggregate de verdade.

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

## Esboço em papel: `projects` na mesma convenção

Teste da convenção antes de ela se espalhar (nada implementado ainda).
Baseado no código atual: `api/projects/[id]/analyze/route.ts`,
`lib/actions/github.ts`, `lib/actions/analysis.ts`, `lib/analysis/progress.ts`.

```ts
// domain/project.ts — aggregate: único dono da máquina de estados
type ProjectStatus = "queued" | "processing" | "completed" | "failed";

class Project {
  // Hoje espalhado na rota analyze (claim com SQL condicional) e nas actions.
  claimForAnalysis(now: Date): void;       // DomainError: already-analyzed | already-running | import-failed
  markProgress(step: string, percent: number): void;
  complete(): void;
  fail(publicMessage: string): void;
  isStale(now: Date): boolean;             // STALE_AFTER_SECONDS
}

// application/ports.ts
interface ProjectRepository {
  getOwned(userId: string, projectId: string): Promise<Project | null>;  // escopo por dono num só lugar
  save(project: Project): Promise<boolean>; // update condicional pelo status lido (concorrência otimista)
}

// application/start-analysis.ts
startAnalysis({ projects, runner })(userId, projectId)
  → getOwned → project.claimForAnalysis(now) → save → runner.run(...)

// server.ts — importar um projeto usa a cota do billing, pela API pública dele:
import { withQuota } from "@/modules/billing/server";
withQuota(userId, "project", async (tx) => {
  const project = await projectsFor(tx).create(...);
  return { consumed: true, value: project.id };
});
```

**O que o esboço confirma:** a estrutura comporta um aggregate com máquina de
estados; o repositório por aggregate funciona com o mesmo padrão de executor
do billing; a integração entre módulos passa pela API pública (`server.ts`
do billing). **O que ainda precisa ser decidido no módulo projects:** como o
`save` preserva a atomicidade do claim atual (hoje um `UPDATE ... WHERE
status IN (...)` único) — a opção esboçada é o update condicional pelo status
lido, a validar com o teste de concorrência existente antes de trocar.
