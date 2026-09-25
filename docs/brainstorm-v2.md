# Brainstorm — visão pós-tutorial (v2)

Notas das conversas sobre a evolução do projeto, para um brainstorming
futuro. Nada aqui é decisão final. Dívidas técnicas concretas ficam em
[technical-debt.md](technical-debt.md) (TD-xx).

---

## 1. Regras que já valem

- Terminar o tutorial antes de qualquer refactoring (tag `v1-tutorial`).
- Segurança é corrigida na hora; o resto vai para o `technical-debt.md`.
- Impactos são hipóteses até serem medidos. Nenhum número entra no README
  sem medição.

## 2. Ordem das versões

1. **v1 — tutorial.** Projeto do curso funcionando, com a camada de segurança
   e o `technical-debt.md` preenchido.
2. **v2.0 — fundação** (sem funcionalidade nova visível):
   - testes de caracterização e CI (TD-27);
   - logs com a causa do erro e observabilidade básica (TD-26);
   - arquitetura em módulos, Clean Architecture só onde há regra de negócio
     (ingestion, rag, analysis);
   - ingestão em segundo plano (TD-10, TD-11, TD-09);
   - GitHub App só com leitura (TD-15, TD-16) e itens de segurança pendentes;
   - evals iniciais: medir o "antes".
3. **v2.1 — Code Intelligence:** AST do repositório inteiro, grafo de
   dependências, símbolos; métricas pela AST no lugar das regex (TD-31).
4. **v2.2 — primeiras análises** (cada uma com eval) + **modo CLI local**.
5. **v2.3 — LLM e agents** explicando as evidências; regras de arquitetura
   do próprio time verificadas a cada PR.
6. **v3+ — resto do catálogo**, conforme os evals mostrarem o que funciona.

**Ajuste ao roadmap original de 18 fases:** o refactoring cobre só a fundação.
RAG 2.0, gateway de LLM, MCP e performance entram quando a funcionalidade nova
ou os números pedirem, e não antes (YAGNI). Evals e observabilidade vêm antes
das otimizações, senão não existe "antes" para comparar.

## 3. Funcionalidade nova: análise de arquitetura e boas práticas

**Princípio:** o LLM sozinho, vendo trechos isolados, não avalia arquitetura.

- **Camada 1, determinística** (repositório inteiro): calcula os fatos.
- **Camada 2, LLM:** explica as evidências e sugere refatorações, citando
  arquivo e linha.
- **Camada 3, regras do próprio time:** ADRs e regras de arquitetura
  verificadas a cada PR (*architecture fitness functions*). É o diferencial.

### Catálogo (o que é detectável)

| Área | Prática | Detectável? |
|---|---|---|
| Arquitetura | Clean Architecture / Hexagonal | Bem (direção das dependências) |
| | Modularidade, ciclos, acoplamento | Bem |
| | SOLID | Parcialmente (sinais + julgamento do LLM) |
| | Code smells (god class, feature envy) | Parcialmente |
| | DDD | Pouco (estrutura sim, modelo de domínio não) |
| | KISS / YAGNI | Pouco |
| | Multi-tenancy (query sem filtro de dono) | Parcialmente |
| Qualidade | DRY (código duplicado) | Bem |
| | Complexidade ciclomática/cognitiva | Bem |
| | Código morto | Bem |
| | Type safety (`any`, `@ts-ignore`) | Bem |
| Testes | TDD | Não pelo código (só aproximação pelo git) |
| | Qualidade dos testes, pirâmide | Parcialmente / Bem |
| | Mutation testing | Bem, mas caro |
| Resiliência | Tratamento de erros, timeouts, retry | Bem |
| | Observabilidade, 12-Factor | Parcialmente |
| Performance | N+1, `await` em série | Bem |
| | Índices | Parcialmente |
| Segurança | Padrões no código (estilo Semgrep) | Bem |
| | Dependências vulneráveis, segredos no git | Bem |
| | Privacidade / LGPD | Parcialmente |
| | Segurança de IA (prompt injection etc.) | Parcialmente |
| Next.js | Fronteira servidor/cliente | Bem |
| | Autorização em actions e rotas | Parcialmente |
| | Acessibilidade | Bem |
| Processo | Hotspots (churn × complexidade) | Bem |
| | Bus factor, CI/CD, documentação | Bem (presença, não qualidade) |

### As cinco primeiras (v2.2)

1. Violações de camada e ciclos
2. Hotspots (histórico do git × complexidade)
3. Autorização e multi-tenancy em actions e rotas
4. Segurança de IA
5. Qualidade dos testes

Cada análise nova entra com eval: repositórios com violações conhecidas,
medindo acertos e alarmes falsos.

## 4. Modo local (sem expor código)

A maior parte já roda local (embeddings, chunking, métricas, e toda a
análise determinística não precisa de IA).

| Porta | Nuvem | Local |
|---|---|---|
| LLM | Groq | Ollama/vLLM, ou nuvem do cliente com a chave dele |
| Busca vetorial | Neon | Postgres + pgvector em Docker |
| Origem do código | GitHub / ZIP | Pasta local |
| Arquivos | Postgres | Disco |

- **Distribuição:** CLI (`npx`), GitHub Action nos runners do cliente,
  Docker Compose, extensão do VS Code.
- **Trade-off:** modelo local é mais fraco, mas como as evidências são
  determinísticas, o relatório é útil até sem LLM.
- **É a justificativa real para Clean Architecture:** portas e adaptadores
  exatamente onde há mais de uma implementação.
- **Cuidados:** zero telemetria com código; nada baixado em tempo de
  execução (modelo e gramáticas no pacote).

## 5. Viabilidade como SaaS

- **Mercado genérico lotado:** CodeRabbit, Greptile, Qodo, Sourcery, Copilot
  code review, Bugbot, SonarQube, Snyk, Semgrep, CodeScene.
- **Nichos com espaço:**
  1. **Due diligence técnica** (investidores, compra de empresas, quem
     contrata software house). Palpite mais forte.
  2. Verificação das regras de arquitetura do próprio time.
  3. Nicho de stack (Next.js) ou de região (pt-BR, LGPD).
- **Barreiras:** confiança para acessar código privado (o modo local ajuda),
  custo do LLM, vender e dar suporte.
- **Validar antes de construir:** conversar com 10 a 20 potenciais clientes;
  fazer 3 ou 4 relatórios manuais; landing page de nicho.
- **Modelo possível:** nuvem como plano de entrada, local/self-hosted como
  plano enterprise.

## 6. Senioridade (avaliação de 0 a 10)

- **Hoje: ~5,5.** Segurança bem acima do tutorial, Drizzle justificado,
  technical-debt; mas ainda é estrutura de tutorial, sem testes nem CI.
- **v2 bem executada: 8 a 8,5.** ADRs com trade-offs, Clean Architecture
  justificada, medição, refactoring com rede de testes.
- **Riscos que baixam a nota:** não terminar; excesso de engenharia;
  afirmações sem números; **não saber explicar cada decisão sem consultar
  nada** (boa parte do código foi escrita com IA).

### Caminho para ~9 (10 é histórico de carreira, não um projeto)

1. **Usuários reais** (20 a 50 já mudam tudo): de "projetei" para "operei".
2. **Engenharia de produção:** SLOs, postmortems, runbooks, migrações sem
   downtime, feature flags, rollback.
3. **Números:** teste de carga, custo por análise, evals ao longo do tempo.
4. **Segurança em profundidade:** modelo de ameaças (STRIDE), OWASP ASVS,
   `SECURITY.md`, SBOM.
5. **Comunicação:** diagramas C4; ADRs com opções rejeitadas e com erros
   corrigidos.
6. **Equipe:** open source com contribuições externas, RFCs.
7. **Visibilidade:** artigos técnicos e palestra.

**Se só der para três:** usuários reais, SLOs + postmortems, artigos técnicos.

## 7. Perguntas para o brainstorming

- Qual o público-alvo: portfólio apenas, produto de nicho, ou os dois?
- Due diligence técnica é mesmo o melhor nicho? Com quem conversar primeiro?
- Open source (CLI) + SaaS pago, ou só SaaS?
- O modo CLI local entra já na v2.2 ou depois?
- Qual a primeira análise a construir para validar a ideia?
- Que temas viram os primeiros artigos técnicos?
- Qual o tempo disponível por semana, e o que cabe nele de forma realista?
