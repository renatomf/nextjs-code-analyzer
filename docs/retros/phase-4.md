# Retro — Fase 4 (observabilidade e custo)

- **Período:** 2026-10-01 (PR #77) a 2026-10-01 (PR #84)
- **Estimado × real:** … (a tabela de planejamento do roadmap não tinha estimativa)
- **Números:** a fase não prometia ganho; ela instrumenta o que o
  [baseline §5](../baseline.md) deixou sem medir. Falta ler os números em
  produção (`llm_calls` e os spans no Sentry).

<!--
Fatos para ajudar a lembrar (apague depois de escrever):
- Ordem: custo antes de erro — `llm_calls` (#77) → orçamento diário por
  plano e teto por chamada (#78) → kill switch (#79) → Sentry (#80) →
  correções vistas em produção (#82, #84) → spans por etapa (#83).
- Tudo de custo ficou no módulo billing (é regra de plano), sem porta nova:
  uma implementação só.
- O Sentry 11 coleta tudo por padrão; o trabalho foi desligar
  (`dataCollection`, scrubbers) e provar com um token falso.
- Tropeços vistos em produção, não nos testes: os traces vão como spans em
  streaming e `beforeSendTransaction` nunca roda (token de `/r/<token>` no
  `url.full`, #82); o Next empacota `instrumentation.ts` e as rotas com
  cópias separadas do logger, então nenhum erro tratado chegava ao Sentry
  desde o #80 (#84).
- Decisões que não estavam no plano: kill switch em tabela e não em
  variável de ambiente (TD-36: mudar env exige deploy); 100% de trace nas
  rotas medidas, porque com 10% quase nenhuma análise deixaria trace;
  source maps do navegador adiados (TD-40).
-->

1. **O que funcionou:**
2. **O que não funcionou:**
3. **O que me surpreendeu:**
4. **O que muda na próxima fase:**
5. **O que eu ainda não sei explicar sem consultar** (próximo ponto de estudo):
