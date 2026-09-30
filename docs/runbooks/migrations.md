# Migrations do banco (Drizzle + Neon)

Toda mudança de schema passa por uma migration versionada em `drizzle/`.
Nada de `drizzle-kit push`: ele altera o banco direto, sem histórico, e o
`.env.local` aponta para **produção** — por isso o script `db:push` foi
removido do `package.json`.

## Onde cada banco é usado

| Banco | Branch no Neon | Quem usa |
|---|---|---|
| Produção | `main` | deploys de Production na Vercel e o `.env.local` |
| Preview | `preview` (schema-only, sem dados) | deploys de Preview na Vercel |
| Testes | Postgres descartável no CI | job **Integration tests (Postgres)** |

O CI aplica todas as migrations do zero a cada PR (job de integração) e
falha se o `src/db/schema.ts` mudar sem a migration correspondente (passo
**Migrations match the schema**).

## Fluxo de uma mudança de schema

1. **Alterar** `src/db/schema.ts`.
2. **Gerar** a migration: `npm run db:generate`.
3. **Revisar o SQL** gerado em `drizzle/NNNN_*.sql` antes de commitar,
   procurando `DROP`, `ALTER ... TYPE`, `NOT NULL` sem `DEFAULT` e renomeações
   (o Drizzle pode gerar DROP + ADD no lugar de RENAME, perdendo dados).
4. **Commitar** o schema e toda a pasta `drizzle/` (SQL, snapshot e
   `_journal.json`) no mesmo PR. O CI valida os dois juntos.
5. **Depois do merge**, aplicar primeiro no `preview`, depois em produção
   (abaixo).

## Aplicar a migration

O `drizzle.config.ts` usa `DATABASE_URL_UNPOOLED` (conexão **direta**, sem
pooler). Uma variável definida no terminal tem prioridade sobre o
`.env.local`, então o alvo é escolhido explicitamente em cada comando.

Pegue a connection string no Neon Console → projeto `nextjs-codedriven` →
**Connect** → escolha o **branch** → **Connection pooling desligado**. Nunca
a cole em arquivos versionados nem no chat.

```bash
# 1) Preview primeiro (se falhar, produção não foi tocada)
DATABASE_URL_UNPOOLED="<connection string direta do branch preview>" npm run db:migrate

# 2) Produção (branch main)
DATABASE_URL_UNPOOLED="<connection string direta do branch main>" npm run db:migrate
```

**No Windows (PowerShell do VS Code)** o exemplo acima não funciona, e colar
a string na linha de comando é perigoso: o `&` dela vira operador e a string
(com a senha) vai para o histórico. O jeito seguro é ler a área de
transferência, rodando **uma linha por vez**:

1. Copie o comando abaixo, **cole no terminal e não dê Enter**:
   ```powershell
   $env:DATABASE_URL_UNPOOLED = [regex]::Match(((Get-Clipboard) -join ""), "postgres(ql)?://[^'`"\s]+").Value
   ```
2. No Neon, copie a connection string do branch (pooling **desligado**).
3. Volte ao terminal e dê **Enter** (o `Get-Clipboard` lê a string agora).
4. Confira (deve mostrar `True` e o host **sem** `-pooler`):
   ```powershell
   $env:DATABASE_URL_UNPOOLED -match "^postgres(ql)?://"
   ([uri]$env:DATABASE_URL_UNPOOLED).Host
   ```
5. Aplique e limpe:
   ```powershell
   npm run db:migrate
   Remove-Item Env:\DATABASE_URL_UNPOOLED
   Set-Clipboard -Value " "
   ```

Confira no Neon Console (branch → **Tables**) que a mudança chegou ao
branch certo.

O `migrate` só aplica o que ainda não está registrado em
`drizzle.__drizzle_migrations`; rodar de novo não repete nada.

## Mudanças que quebram compatibilidade: expand/contract

O deploy da aplicação e a migration não acontecem no mesmo instante. Uma
migration que remove ou renomeia algo que o código em produção ainda usa
derruba o app nesse intervalo. Divida em etapas, cada uma num PR:

| Etapa | Migration | Código |
|---|---|---|
| 1. Expand | adiciona a coluna/tabela nova (nullable ou com default) | continua usando a antiga |
| 2. Migrar | copia os dados (script ou migration de dados) | passa a escrever nas duas e ler da nova |
| 3. Contract | remove a coluna/tabela antiga | já não usa a antiga |

Renomear coluna = expand (nova) + migrar + contract (antiga), nunca um
`RENAME` direto com o app no ar.

## Antes de uma migration arriscada

Crie um branch de teste a partir de `main` (com dados reais) e aplique nele
primeiro; o Neon também permite restaurar o `main` para um ponto no tempo
(instant restore) se algo der errado.
