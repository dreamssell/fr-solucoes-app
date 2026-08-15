# AUDITORIA DE ACEITE — ETAPA 4 DO FR FINANCEIRO

Não avance para a Etapa 5. Não altere código ou banco ainda. Não publique.

O relatório apresentado não comprova a conclusão da Etapa 4. Faça uma auditoria objetiva, comparando a implementação com todos os requisitos originais.

## PONTOS CRÍTICOS

1. **Upload de documentos:** O relatório menciona “upload simulado”. Isso não é aceito. Verifique se foto, documentos e comprovantes:
   - São realmente enviados ao bucket privado;
   - Têm metadados persistidos no Supabase;
   - Podem ser recuperados por URL assinada;
   - Respeitam RLS;
   - Não usam URL pública;
   - Funcionam após atualizar a página.

2. **Cadastro de Clientes:** Comprove se “Novo Cliente”:
   - Salva dados reais no Supabase;
   - Vincula o funcionário correto;
   - Valida CPF e telefone;
   - Impede duplicidade;
   - Permite anexos reais;
   - Funciona no celular;
   - Continua salvo após refresh.

3. **Novo Empréstimo:** Comprove se “Novo Empréstimo”:
   - Não é somente simulador;
   - Confirma e persiste o contrato;
   - Cria todas as parcelas;
   - Salva snapshots financeiros;
   - Permite diário, semanal, quinzenal e mensal;
   - Ajusta corretamente datas mensais;
   - Registra auditoria.

4. **Funcionários Oficiais:** Comprove se foram cadastrados exatamente os 14 funcionários com nome e WhatsApp:
   - Átila — +5537999043833
   - Alef — +5537999488474
   - Paulista — +5537991030442
   - Barriga — +5537991220071
   - Coruja Gustavo — +5537999926654
   - Fagner — +5537999110042
   - Josevan — +5537984087031
   - Gustavo Escritório — +5537998334819
   - Henrique — +5537999142326
   - Rayane — +5537991243017
   - Rotinho — +5537999194606
   - Larissa — +5537999933981
   - Raisley — +5537998710683
   - FR Financeira — +5537984157771

   *A FR Financeira deve possuir carteira, lucro, comissão e acerto como funcionário operacional.*

5. **Funcionalidades Necessárias:** Localize e demonstre:
   - Aba de atrasos;
   - Cálculo automático de multa;
   - Carência configurável;
   - Juros diários, únicos e personalizados;
   - Pagamento parcial;
   - Proteção contra cobrança duplicada;
   - Memória de cálculo;
   - Filtros completos;
   - Prévia editável de WhatsApp;
   - Abertura do WhatsApp individual;
   - Relatório semanal;
   - Relatório mensal;
   - PDF detalhado de cliente;
   - PDF detalhado de funcionário;
   - Isolamento de informações por destinatário.

6. **Testes e Regressões:** Explique a regressão aparente nos testes:
   - Anteriormente foram informados 19 testes financeiros;
   - Agora o relatório menciona apenas 11;
   - Liste cada arquivo de teste e quantos testes existem em cada um;
   - Execute a suíte completa, sem filtrar arquivos;
   - Informe testes ignorados, desativados ou removidos.

7. **Qualidade Técnica:** Não afirmar que build valida tipagem. Executar separadamente:
   - Suíte completa de testes;
   - TypeScript sem emissão;
   - Lint completo;
   - Build de produção;
   - Verificação de segredos;
   - Teste real de RLS;
   - Validação mobile e desktop.

## ENTREGA DA AUDITORIA

Apresente uma tabela com:
- Requisito;
- Status: REAL, PARCIAL, SIMULADO, QUEBRADO ou AUSENTE;
- Arquivo/componente;
- Tabela/RPC/política utilizada;
- Teste correspondente;
- Evidência objetiva.

No final, informar:
- Percentual real concluído;
- Funcionalidades ausentes;
- Regressões encontradas;
- Testes faltantes;
- Menor plano necessário para concluir a Etapa 4.

**Restrições:**
- Não implementar correções nesta resposta.
- Não iniciar Cobrança Diária.
- Não iniciar a Etapa 5.
- Não publicar.
