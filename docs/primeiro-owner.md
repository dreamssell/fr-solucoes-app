# Autorizações de acesso (owner_access)

O acesso ao FR Financeiro é controlado exclusivamente pela tabela
`public.owner_access`. O frontend **não pode** inserir, alterar ou apagar
autorizações (só existe policy de SELECT da própria linha).

## Estrutura
- `email` (obrigatório, normalizado em minúsculas/sem espaços, único, validado)
- `access_type`: `proprietario_definitivo` | `acesso_tecnico`
- `is_temporary`, `is_active`, `expires_at`
- `auth_user_id` (vínculo com `auth.users`, único, preenchido só pelo banco)
- `linked_at`, `deactivated_at`, `deactivated_reason`, `notes`, timestamps

## Autorizações cadastradas
| e-mail | tipo | temporário | ativo |
|---|---|---|---|
| feliperodrigues5521@gmail.com | proprietário definitivo | não | sim |
| cttestepedro@gmail.com | acesso técnico | sim | sim |

## Vínculo com a conta Google
Feito no banco pela função `public.claim_owner_access()` (SECURITY DEFINER,
`search_path` fixo, EXECUTE revogado de PUBLIC/anon). Ela usa `auth.uid()` —
o usuário não escolhe e-mail nem `auth_user_id` — e só vincula quando:
e-mail confirmado, identidade Google, conta não banida/excluída, autorização
existente, ativa e dentro da validade, e `auth_user_id` vazio ou igual ao
próprio usuário. Nunca cria autorização nova.

## Antes de publicar (bloqueio obrigatório)
Desativar o acesso técnico (sem apagar o registro, preservando histórico):

```sql
update public.owner_access
   set is_active = false,
       deactivated_reason = 'Encerramento do acesso técnico antes da publicação'
 where email = 'cttestepedro@gmail.com';
```

O trigger de auditoria grava o evento em `audit_events` automaticamente.
Depois, testar novamente com essa conta e confirmar que ela não acessa rotas
nem dados.
