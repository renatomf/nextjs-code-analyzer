# Kill switch do LLM (desligar chat, explicação ou relatório)

Desliga uma função que chama o LLM **sem deploy**: o Groq está fora, um
modelo está respondendo errado ou o gasto disparou. Variável de ambiente não
serve: a Vercel congela as variáveis por deploy (ver TD-36).

## Como funciona

- Tabela `llm_switches`, uma linha por função: `report`, `chat`, `explain`.
- **Sem linha = ligado.** Só uma linha com `enabled = false` desliga.
- Lida a cada chamada (sem cache): a mudança vale na próxima requisição.
- Desligado:
  - **chat** e **explicação** respondem 503 com "temporarily unavailable",
    antes do rate limit (o usuário não perde mensagens da cota por hora);
  - **relatório**: a análise ainda monta a base de conhecimento (o chat
    continua funcionando), e o passo do relatório falha com "The AI review
    is temporarily unavailable". Depois de religar, o usuário gera o
    relatório de novo pela página do projeto. A análise conta na cota do
    dia, como qualquer outra falha do LLM.

## Desligar / religar

No Neon Console → projeto `nextjs-codedriven` → branch `main` (produção) →
**SQL Editor**:

```sql
-- Desligar (troque 'chat' por 'report' ou 'explain')
INSERT INTO llm_switches (feature, enabled) VALUES ('chat', false)
ON CONFLICT (feature) DO UPDATE SET enabled = excluded.enabled, updated_at = now();

-- Religar
UPDATE llm_switches SET enabled = true, updated_at = now() WHERE feature = 'chat';

-- Ver o estado
SELECT feature, enabled, updated_at FROM llm_switches;
```

Para desligar tudo, rode o `INSERT` para as três funções.

## Conferir

- Chat desligado: uma pergunta no chat de um projeto mostra a mensagem de
  indisponível.
- Nos logs da Vercel não aparece `chat.failed`: o 503 é esperado e não é
  logado como erro.
- Religado: a próxima pergunta é respondida.
