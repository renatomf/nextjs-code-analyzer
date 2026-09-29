# ADR-003 — Cota de uso do plano

- **Status:** proposta
- **Data:** 2026-09-29
- **Fase do roadmap:** 3 — Monólito modular + Clean Architecture (módulo billing)

## Contexto

Cada plano limita **análises por dia** e **projetos**; o Premium não tem
limite de projetos. Análise é a operação cara (LLM + embeddings), então a cota
é uma regra de custo, não só de produto. Até a v1 essas regras estavam
espalhadas: a checagem e o registro do uso eram chamados separadamente em cada
action, e o reset diário e a carência do `past_due` não estavam escritos em
lugar nenhum (TD-25). O TD-25 já fixou esse comportamento em testes; esta ADR
registra as decisões por trás dele.

## Problema

Como contar o uso, quando o dia recomeça, o que acontece quando o pagamento
falha e como impedir que requisições paralelas passem juntas pelo limite?

## Opções consideradas

1. **Contar o uso a partir das análises e projetos existentes.** Não precisa
   de tabela nova, mas apagar um projeto devolveria a cota, e reanalisar não
   deixaria rastro.
2. **Registrar um evento por análise consumida (`usage_events`).** A contagem
   não depende do que o usuário apaga, e o histórico fica disponível para
   métricas. Custa uma linha por análise.
3. **Contador em memória ou numa KV externa.** Não funciona em serverless com
   várias instâncias, e uma KV externa quebra a restrição de custo zero.

Para o reset diário: meia-noite UTC, meia-noite no fuso do usuário ou uma
janela móvel de 24 h.

## Decisão

- **Uso = eventos em `usage_events`** (opção 2). Um projeto novo consome uma
  análise; uma reanálise consome uma; tentativa recusada não consome.
- **O dia da cota começa às 00:00 UTC** (`quotaDayStart`). É igual para todos,
  fácil de explicar ("renova à meia-noite UTC") e não depende do fuso do
  usuário, que o servidor não conhece de forma confiável.
- **Checagem, trabalho e registro numa só transação** (`withQuota`): trava a
  linha do usuário (`FOR UPDATE`), confere o limite, executa o trabalho e só
  registra o uso se o trabalho informar que consumiu (`{ consumed }`). Se
  qualquer passo lançar erro, nada é gravado. Requisições paralelas do mesmo
  usuário esperam umas pelas outras, então só uma pega a última vaga (testado
  contra um Postgres real).
- **Carência do `past_due`:** quando uma renovação falha, o usuário mantém o
  Premium enquanto o Stripe tenta cobrar de novo. O Stripe `unpaid` também é
  tratado como `past_due`. **A duração da carência fica configurada no
  Stripe**, não no código: o app espelha o status que o Stripe informa.

## Trade-offs e consequências

- Dentro de `withQuota` só pode haver escrita rápida no banco: a linha do
  usuário fica travada até o fim. Download e extração ficam fora.
- O limite é por usuário, não por instância, e vale com qualquer número de
  instâncias; o custo é uma trava de linha por operação que consome cota.
- Um usuário perto da meia-noite UTC pode usar duas cotas em poucos minutos.
  Aceito: o custo máximo continua limitado a duas cotas diárias.
- **Ponto aberto (decisão de produto):** se o Stripe for configurado para
  deixar a assinatura em `unpaid` ou `past_due` depois de esgotar as novas
  tentativas, o usuário fica com Premium indefinidamente. O recomendado é
  configurar o Stripe (Billing → *Manage failed payments*) para **cancelar**
  a assinatura quando as tentativas acabarem; o webhook então rebaixa o
  plano para free.
- Revisar se: surgir cobrança por uso (metered), um plano com fuso próprio,
  ou se a trava de linha aparecer como gargalo nas medições.
