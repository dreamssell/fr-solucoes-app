# Desenho aprovado — Contenção de Segurança da Fundação (FR Financeiro)

- Data: 2026-08-07
- Entrega: primeira entrega (fundação)
- Status: desenho aprovado, ainda não implementado
- Escopo desta data: apenas este documento. Nenhum código, migration, configuração, banco, dado ou interface foi alterado. Nada foi publicado.

## 1. Objetivo

Conter vulnerabilidades críticas já identificadas e tornar a fundação verificável antes de qualquer evolução financeira. A entrega é considerada bem-sucedida quando as políticas inseguras estiverem corrigidas por migration nova, os testes reais de RLS estiverem executáveis e verdes, e o drift entre migrations versionadas e o histórico real do banco estiver diagnosticado e reconciliado sem reescrever migrations já aplicadas.

## 2. Escopo

Incluído:

1. Corrigir exclusivamente as políticas inseguras do bucket privado `documents` e da tabela `employee_notifications`.
2. Criar testes reais de RLS cobrindo cinco perfis: proprietário, gerente, funcionário, usuário desativado e autenticado sem perfil.
3. Reconciliar migrations versionadas com o schema e o histórico real do banco, gerando diagnóstico de drift e, somente na futura implementação, uma migration corretiva nova e idempotente. Migrations já aplicadas nunca são reescritas, renomeadas ou removidas.
4. Preservar integralmente clientes, empréstimos, parcelas, pagamentos, funcionários e auditorias existentes.

Excluído (explicitamente fora desta entrega):

5. Rateio financeiro, motor de cálculo, acerto, caixa, telas e dados não são modificados.
6. Publicação não ocorre em nenhuma etapa desta entrega.

## 3. Decisões explícitas

- Nenhuma tela nova, nenhum ajuste visual, nenhuma rota nova.
- Nenhuma massa de dados demo, seed ou fixture persistente no banco do projeto.
- Nenhuma operação financeira executada (nenhum empréstimo, pagamento, renegociação ou acerto criado, alterado ou removido).
- Nenhuma publicação.
- Ausência de perfil nunca é tratada como proprietário: autenticado sem perfil é negado por padrão em toda política e RPC.
- IDs enviados pelo frontend nunca são confiados. Ator, papel e escopo derivam de `auth.uid()` e das funções de escopo no banco.
- `service_role` não aparece no frontend nem em nenhuma verificação de aceite; a chave de serviço é usada apenas pelo runner de teste de banco, fora do bundle da aplicação.

## 4. Arquitetura

### 4.1 Políticas e grants

Toda alteração de política e grant é feita por migration nova, versionada, idempotente e estruturalmente reversível. Ordem obrigatória para qualquer objeto tocado: grants explícitos para os papéis usados pelas políticas, RLS habilitada, políticas criadas. Nenhum `GRANT` é ampliado além do necessário e `anon` não recebe acesso a nenhum dos objetos deste escopo.

### 4.2 Bucket `documents`

- O bucket permanece privado. Nenhuma URL pública é gerada; o acesso a arquivos ocorre exclusivamente por URL assinada de curta duração.
- Nunca existe política `FOR ALL` condicionada apenas a `bucket_id`. Essa forma é a vulnerabilidade central a ser removida.
- As políticas em `storage.objects` são separadas por operação (leitura, criação, atualização, remoção) e condicionadas ao escopo derivado do caminho do objeto: o objeto pertence a um cliente, o cliente pertence a um funcionário, e o ator só alcança o objeto quando tem escopo sobre esse funcionário.
- Proprietário alcança todo o escopo; gerente alcança apenas a própria equipe; funcionário alcança apenas a própria carteira; usuário desativado e autenticado sem perfil não alcançam nada.
- O layout de caminho de objeto é fixado pela migration e validado nos testes, de modo que o vínculo entre arquivo e cliente não dependa de informação enviada pelo cliente HTTP além do próprio caminho verificado contra o banco.

### 4.3 `employee_notifications`

A visibilidade é restrita a quatro casos, avaliados sempre a partir de `auth.uid()`:

- o remetente do registro;
- o destinatário, ou seja, o funcionário correspondente ao registro;
- o gerente autorizado sobre o funcionário do registro;
- o proprietário.

Qualquer outro ator autenticado recebe zero linhas. Escrita segue a mesma regra de escopo do leitor autorizado a agir sobre aquele funcionário, e nunca aceita `employee_id` ou identidade de remetente vindos do frontend sem validação contra o escopo do ator.

### 4.4 Testes reais de RLS

- Teste de integração PostgreSQL executável de verdade: nenhum arquivo `.skip`, nenhum teste marcado como pendente.
- Cada caso roda dentro de uma transação e termina em `ROLLBACK`, de modo que nenhum dado do projeto é criado, alterado ou deixado para trás.
- Os casos exercitam acesso direto à API de dados e às RPCs assumindo a identidade de cada perfil, e não apenas o espelho lógico em TypeScript já existente.
- Matriz mínima por objeto (`documents` via `storage.objects`, `employee_notifications`, e as tabelas financeiras já cobertas por escopo): proprietário vê tudo do escopo previsto; gerente vê apenas a própria equipe; funcionário vê apenas a própria carteira; usuário desativado é bloqueado; autenticado sem perfil é bloqueado.
- Cada caso afirma tanto o acesso permitido quanto a negação explícita do acesso indevido; ausência de erro sem verificação de linhas não é aceita como prova.

### 4.5 Gate de drift de migrations

- Uma checagem compara os arquivos em `supabase/migrations` com as versões registradas em `supabase_migrations.schema_migrations`.
- A checagem falha quando existir arquivo sem versão aplicada, versão aplicada sem arquivo correspondente, ou divergência de ordem.
- O diagnóstico é registrado como saída da checagem. A correção resultante é sempre uma migration nova e idempotente; migrations aplicadas permanecem intactas.
- O gate roda junto da suíte de verificação e bloqueia o aceite quando falha.

### 4.6 Método

TDD estrito: RED (teste que falha demonstrando a política insegura ou o drift) → GREEN (migration nova e mínima que torna o teste verde) → REFACTOR (limpeza sem alterar comportamento observável). Nenhuma migration entra sem um teste RED correspondente registrado.

## 5. Critérios de aceite

A entrega só é aceita quando todos os itens abaixo forem verdadeiros e evidenciados:

1. `bunx vitest run` — suíte completa verde, sem arquivos filtrados, sem testes ignorados ou desativados.
2. `bunx tsc --noEmit` — sem erros.
3. `bunx eslint .` — zero erros e zero warnings.
4. `bun run build` — build de produção concluído.
5. Evidência dos testes de banco: saída do runner mostrando, por perfil e por objeto, os casos permitidos e os casos negados, com o `ROLLBACK` confirmado ao final de cada caso.
6. Gate de drift verde, com o diagnóstico anexado.
7. Nenhuma política `FOR ALL` por `bucket_id` isolado remanescente em `storage.objects`.
8. Contagens de linhas de `clients`, `loans`, `installments`, `payments`, `employees` e `audit_events` idênticas antes e depois da entrega.
9. Nenhuma ocorrência de `service_role` no código do frontend.
10. Nenhuma publicação realizada.

## 6. Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Política nova mais restritiva do que o uso real e quebra de acesso legítimo | Usuário legítimo perde acesso a documentos ou avisos | Matriz de testes cobre os cinco perfis nos dois sentidos (permitido e negado) antes do GREEN |
| Reconciliação de migrations corromper o histórico | Perda de rastreabilidade e falha de restauração | Proibição absoluta de editar migrations aplicadas; correção apenas por migration nova e idempotente |
| Teste de banco deixar resíduo | Contaminação de dados reais | Transação por caso com `ROLLBACK` obrigatório; conferência de contagens antes e depois |
| Caminho de objeto no bucket divergir do layout assumido | Arquivos existentes ficarem inacessíveis | Diagnóstico do layout atual antes da migration; política escrita sobre o layout observado, validada por teste |
| Escopo crescer para o motor financeiro | Regressão financeira | Escopo fechado nesta especificação; qualquer alteração financeira exige nova especificação |

## 7. Rollback

- Rollback é sempre uma migration nova que restaura o estado anterior de políticas e grants; nenhuma migration aplicada é revertida por edição.
- O conjunto exato de políticas removidas e criadas é registrado no corpo da migration corretiva, de modo que a migration de rollback possa ser derivada diretamente dela.
- Como a entrega não altera dados, o rollback não envolve restauração de linhas.

## 8. Política de não alteração de dados

Nenhuma linha de negócio é criada, alterada ou removida nesta entrega. As únicas escritas admitidas no banco são as de estrutura (políticas, grants, funções de escopo, se necessárias) executadas pela migration corretiva, e as escritas transitórias dos testes, sempre desfeitas por `ROLLBACK`. Clientes, empréstimos, parcelas, pagamentos, funcionários e auditorias existentes são preservados integralmente.