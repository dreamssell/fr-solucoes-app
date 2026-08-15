/**
 * Dados fictícios do protótipo FR Financeira.
 * Estrutura pensada para, no futuro, ser substituída por consultas ao banco
 * sem alterar os componentes: cada tela consome apenas as listas abaixo.
 */

export type Situacao = "ativo" | "inativo";
export type StatusCobranca = "recebido" | "pendente" | "atrasado";
export type StatusCliente = "em dia" | "atrasado" | "renegociado" | "quitado";

export interface Funcionario {
  id: string;
  nome: string;
  whatsapp: string;
  clientes: number;
  recebimentosSemana: number;
  atrasos: number;
  proximoAcerto: string;
  situacao: Situacao;
  dividaTotal?: number;
  dividaParcela?: number;
  dividaParcelas?: number;
}

export interface Parcela {
  numero: number;
  total: number;
  vencimento: string;
  valor: number;
  pago: number;
  status: StatusCobranca;
}

export interface Emprestimo {
  id: string;
  clienteId: string;
  funcionarioId: string;
  dataInicio: string;
  capital: number;
  lucroFr: number;
  lucroFuncionario: number;
  totalCliente: number;
  qtdParcelas: number;
  valorParcela: number;
  parcelas: Parcela[];
}

export interface Cliente {
  id: string;
  nome: string;
  telefone: string;
  funcionarioId: string;
  contratosAtivos: number;
  saldoDevedor: number;
  situacao: StatusCliente;
  observacoes: string;
}

export interface Cobranca {
  id: string;
  clienteId: string;
  funcionarioId: string;
  emprestimoId: string;
  parcela: string;
  vencimento: string;
  diasAtraso: number;
  encargos: number;
  valor: number;
  total: number;
  status: StatusCobranca;
}

export interface Recebimento {
  id: string;
  clienteId: string;
  funcionarioId: string;
  parcela: string;
  data: string;
  valor: number;
  multa: number;
  tipo: "integral" | "parcial";
  forma: "Dinheiro" | "PIX" | "Transferência";
}

export const funcionarios: Funcionario[] = [
  {
    id: "f1",
    nome: "Marcos Aurélio Lima",
    whatsapp: "(11) 98812-4471",
    clientes: 18,
    recebimentosSemana: 12480.0,
    atrasos: 3,
    proximoAcerto: "07/08/2026",
    situacao: "ativo",
    dividaTotal: 3000,
    dividaParcela: 300,
    dividaParcelas: 10,
  },
  {
    id: "f2",
    nome: "Juliana Ferreira Souza",
    whatsapp: "(11) 99164-3320",
    clientes: 14,
    recebimentosSemana: 9310.5,
    atrasos: 1,
    proximoAcerto: "07/08/2026",
    situacao: "ativo",
  },
  {
    id: "f3",
    nome: "Rogério Nascimento",
    whatsapp: "(11) 98450-2098",
    clientes: 11,
    recebimentosSemana: 6720.0,
    atrasos: 4,
    proximoAcerto: "07/08/2026",
    situacao: "ativo",
  },
  {
    id: "f4",
    nome: "Patrícia Gomes Alves",
    whatsapp: "(11) 97733-1185",
    clientes: 6,
    recebimentosSemana: 0,
    atrasos: 0,
    proximoAcerto: "—",
    situacao: "inativo",
  },
];

export const clientes: Cliente[] = [
  {
    id: "c1",
    nome: "Antônio Carlos Ribeiro",
    telefone: "(11) 98123-4455",
    funcionarioId: "f1",
    contratosAtivos: 1,
    saldoDevedor: 2100,
    situacao: "em dia",
    observacoes: "Paga sempre pela manhã, na banca do centro.",
  },
  {
    id: "c2",
    nome: "Maria de Fátima Souza",
    telefone: "(11) 99321-7788",
    funcionarioId: "f1",
    contratosAtivos: 1,
    saldoDevedor: 1560,
    situacao: "atrasado",
    observacoes: "Prometeu quitar o atraso no dia do pagamento.",
  },
  {
    id: "c3",
    nome: "José Renato Barbosa",
    telefone: "(11) 98800-1122",
    funcionarioId: "f2",
    contratosAtivos: 2,
    saldoDevedor: 4380,
    situacao: "em dia",
    observacoes: "Cliente antigo, bom pagador.",
  },
  {
    id: "c4",
    nome: "Cláudia Regina Martins",
    telefone: "(11) 97455-6633",
    funcionarioId: "f2",
    contratosAtivos: 1,
    saldoDevedor: 980,
    situacao: "renegociado",
    observacoes: "Renegociado em 15/07/2026.",
  },
  {
    id: "c5",
    nome: "Sebastião Oliveira",
    telefone: "(11) 99012-8890",
    funcionarioId: "f3",
    contratosAtivos: 1,
    saldoDevedor: 3240,
    situacao: "atrasado",
    observacoes: "Difícil contato à tarde.",
  },
  {
    id: "c6",
    nome: "Luciana Prado Dias",
    telefone: "(11) 98567-4412",
    funcionarioId: "f3",
    contratosAtivos: 1,
    saldoDevedor: 1200,
    situacao: "em dia",
    observacoes: "Prefere PIX.",
  },
  {
    id: "c7",
    nome: "Everton Silva Nunes",
    telefone: "(11) 99777-2031",
    funcionarioId: "f1",
    contratosAtivos: 1,
    saldoDevedor: 0,
    situacao: "quitado",
    observacoes: "Quitou o contrato em 21/07/2026.",
  },
  {
    id: "c8",
    nome: "Rosângela Teixeira",
    telefone: "(11) 98219-6604",
    funcionarioId: "f2",
    contratosAtivos: 1,
    saldoDevedor: 2760,
    situacao: "em dia",
    observacoes: "Comércio no bairro, atende após 14h.",
  },
];

const mkParcelas = (
  qtd: number,
  valor: number,
  pagas: number,
  inicio: string,
  atrasadas = 0,
): Parcela[] => {
  const base = new Date(inicio + "T12:00:00");
  return Array.from({ length: qtd }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i * 7);
    const iso = d.toISOString().slice(0, 10);
    const status: StatusCobranca =
      i < pagas ? "recebido" : i < pagas + atrasadas ? "atrasado" : "pendente";
    return {
      numero: i + 1,
      total: qtd,
      vencimento: iso,
      valor,
      pago: status === "recebido" ? valor : 0,
      status,
    };
  });
};

export const emprestimos: Emprestimo[] = [
  {
    id: "e1",
    clienteId: "c1",
    funcionarioId: "f1",
    dataInicio: "2026-05-12",
    capital: 2000,
    lucroFr: 700,
    lucroFuncionario: 300,
    totalCliente: 3000,
    qtdParcelas: 10,
    valorParcela: 300,
    parcelas: mkParcelas(10, 300, 3, "2026-05-19"),
  },
  {
    id: "e2",
    clienteId: "c2",
    funcionarioId: "f1",
    dataInicio: "2026-04-20",
    capital: 1500,
    lucroFr: 525,
    lucroFuncionario: 225,
    totalCliente: 2250,
    qtdParcelas: 10,
    valorParcela: 225,
    parcelas: mkParcelas(10, 225, 3, "2026-04-27", 1),
  },
  {
    id: "e3",
    clienteId: "c3",
    funcionarioId: "f2",
    dataInicio: "2026-06-02",
    capital: 3000,
    lucroFr: 1050,
    lucroFuncionario: 450,
    totalCliente: 4500,
    qtdParcelas: 10,
    valorParcela: 450,
    parcelas: mkParcelas(10, 450, 2, "2026-06-09"),
  },
  {
    id: "e4",
    clienteId: "c4",
    funcionarioId: "f2",
    dataInicio: "2026-03-10",
    capital: 1000,
    lucroFr: 350,
    lucroFuncionario: 150,
    totalCliente: 1500,
    qtdParcelas: 10,
    valorParcela: 150,
    parcelas: mkParcelas(10, 150, 5, "2026-03-17"),
  },
  {
    id: "e5",
    clienteId: "c5",
    funcionarioId: "f3",
    dataInicio: "2026-05-05",
    capital: 2500,
    lucroFr: 875,
    lucroFuncionario: 375,
    totalCliente: 3750,
    qtdParcelas: 10,
    valorParcela: 375,
    parcelas: mkParcelas(10, 375, 1, "2026-05-12", 2),
  },
  {
    id: "e6",
    clienteId: "c6",
    funcionarioId: "f3",
    dataInicio: "2026-06-16",
    capital: 1000,
    lucroFr: 350,
    lucroFuncionario: 150,
    totalCliente: 1500,
    qtdParcelas: 10,
    valorParcela: 150,
    parcelas: mkParcelas(10, 150, 2, "2026-06-23"),
  },
  {
    id: "e7",
    clienteId: "c8",
    funcionarioId: "f2",
    dataInicio: "2026-06-23",
    capital: 2400,
    lucroFr: 840,
    lucroFuncionario: 360,
    totalCliente: 3600,
    qtdParcelas: 10,
    valorParcela: 360,
    parcelas: mkParcelas(10, 360, 2, "2026-06-30"),
  },
];

export const cobrancasHoje: Cobranca[] = [
  {
    id: "cb1",
    clienteId: "c1",
    funcionarioId: "f1",
    emprestimoId: "e1",
    parcela: "4/10",
    vencimento: "2026-08-04",
    diasAtraso: 0,
    encargos: 0,
    valor: 300,
    total: 300,
    status: "pendente",
  },
  {
    id: "cb2",
    clienteId: "c2",
    funcionarioId: "f1",
    emprestimoId: "e2",
    parcela: "4/10",
    vencimento: "2026-07-28",
    diasAtraso: 7,
    encargos: 33.75,
    valor: 225,
    total: 258.75,
    status: "atrasado",
  },
  {
    id: "cb3",
    clienteId: "c7",
    funcionarioId: "f1",
    emprestimoId: "e1",
    parcela: "10/10",
    vencimento: "2026-08-04",
    diasAtraso: 0,
    encargos: 0,
    valor: 280,
    total: 280,
    status: "recebido",
  },
  {
    id: "cb4",
    clienteId: "c3",
    funcionarioId: "f2",
    emprestimoId: "e3",
    parcela: "3/10",
    vencimento: "2026-08-04",
    diasAtraso: 0,
    encargos: 0,
    valor: 450,
    total: 450,
    status: "pendente",
  },
  {
    id: "cb5",
    clienteId: "c4",
    funcionarioId: "f2",
    emprestimoId: "e4",
    parcela: "6/10",
    vencimento: "2026-08-04",
    diasAtraso: 0,
    encargos: 0,
    valor: 150,
    total: 150,
    status: "recebido",
  },
  {
    id: "cb6",
    clienteId: "c8",
    funcionarioId: "f2",
    emprestimoId: "e7",
    parcela: "3/10",
    vencimento: "2026-08-01",
    diasAtraso: 3,
    encargos: 21.6,
    valor: 360,
    total: 381.6,
    status: "atrasado",
  },
  {
    id: "cb7",
    clienteId: "c5",
    funcionarioId: "f3",
    emprestimoId: "e5",
    parcela: "2/10",
    vencimento: "2026-07-21",
    diasAtraso: 14,
    encargos: 78.75,
    valor: 375,
    total: 453.75,
    status: "atrasado",
  },
  {
    id: "cb8",
    clienteId: "c6",
    funcionarioId: "f3",
    emprestimoId: "e6",
    parcela: "3/10",
    vencimento: "2026-08-04",
    diasAtraso: 0,
    encargos: 0,
    valor: 150,
    total: 150,
    status: "pendente",
  },
];

export const recebimentos: Recebimento[] = [
  {
    id: "r1",
    clienteId: "c7",
    funcionarioId: "f1",
    parcela: "10/10",
    data: "2026-08-04",
    valor: 280,
    multa: 0,
    tipo: "integral",
    forma: "PIX",
  },
  {
    id: "r2",
    clienteId: "c4",
    funcionarioId: "f2",
    parcela: "6/10",
    data: "2026-08-04",
    valor: 150,
    multa: 0,
    tipo: "integral",
    forma: "Dinheiro",
  },
  {
    id: "r3",
    clienteId: "c3",
    funcionarioId: "f2",
    parcela: "2/10",
    data: "2026-08-03",
    valor: 450,
    multa: 0,
    tipo: "integral",
    forma: "PIX",
  },
  {
    id: "r4",
    clienteId: "c1",
    funcionarioId: "f1",
    parcela: "3/10",
    data: "2026-08-02",
    valor: 300,
    multa: 0,
    tipo: "integral",
    forma: "Dinheiro",
  },
  {
    id: "r5",
    clienteId: "c5",
    funcionarioId: "f3",
    parcela: "1/10",
    data: "2026-08-01",
    valor: 200,
    multa: 18.75,
    tipo: "parcial",
    forma: "Dinheiro",
  },
  {
    id: "r6",
    clienteId: "c6",
    funcionarioId: "f3",
    parcela: "2/10",
    data: "2026-07-31",
    valor: 150,
    multa: 0,
    tipo: "integral",
    forma: "Transferência",
  },
  {
    id: "r7",
    clienteId: "c8",
    funcionarioId: "f2",
    parcela: "2/10",
    data: "2026-07-30",
    valor: 360,
    multa: 0,
    tipo: "integral",
    forma: "PIX",
  },
  {
    id: "r8",
    clienteId: "c2",
    funcionarioId: "f1",
    parcela: "3/10",
    data: "2026-07-29",
    valor: 225,
    multa: 11.25,
    tipo: "integral",
    forma: "Dinheiro",
  },
];

export const graficoRecebimentos = [
  { dia: "29/07", valor: 1840 },
  { dia: "30/07", valor: 2260 },
  { dia: "31/07", valor: 1520 },
  { dia: "01/08", valor: 2980 },
  { dia: "02/08", valor: 2410 },
  { dia: "03/08", valor: 3120 },
  { dia: "04/08", valor: 2680 },
];

export const indicadores = {
  capitalEmprestado: 128400,
  capitalAberto: 74920.5,
  valorRecebido: 53480.25,
  lucroRealizado: 18742.8,
  parcelasVencidas: 12,
  cobrancasHoje: cobrancasHoje.length,
  acertosPendentes: 3,
};

/* ---------- Acerto semanal ---------- */

export interface LinhaAcerto {
  clienteId: string;
  parcela: string;
  previsto: number;
  recebido: number;
  multa: number;
  tipo: "confirmado" | "parcial" | "nao_pago" | "renegociado";
  data?: string;
}

export interface Desconto {
  id: string;
  descricao: string;
  valor: number;
}

export interface Acerto {
  funcionarioId: string;
  periodo: string;
  linhas: LinhaAcerto[];
  descontos: Desconto[];
  fechado: boolean;
}

export const acertos: Acerto[] = [
  {
    funcionarioId: "f1",
    periodo: "29/07/2026 a 04/08/2026",
    fechado: false,
    linhas: [
      {
        clienteId: "c1",
        parcela: "3/10",
        previsto: 300,
        recebido: 300,
        multa: 0,
        tipo: "confirmado",
        data: "2026-08-02",
      },
      {
        clienteId: "c7",
        parcela: "10/10",
        previsto: 280,
        recebido: 280,
        multa: 0,
        tipo: "confirmado",
        data: "2026-08-04",
      },
      {
        clienteId: "c2",
        parcela: "3/10",
        previsto: 225,
        recebido: 225,
        multa: 11.25,
        tipo: "confirmado",
        data: "2026-07-29",
      },
      {
        clienteId: "c3",
        parcela: "2/10",
        previsto: 450,
        recebido: 450,
        multa: 0,
        tipo: "confirmado",
        data: "2026-08-03",
      },
      {
        clienteId: "c8",
        parcela: "2/10",
        previsto: 360,
        recebido: 360,
        multa: 0,
        tipo: "confirmado",
        data: "2026-07-30",
      },
      {
        clienteId: "c6",
        parcela: "2/10",
        previsto: 150,
        recebido: 150,
        multa: 0,
        tipo: "confirmado",
        data: "2026-07-31",
      },
      {
        clienteId: "c4",
        parcela: "6/10",
        previsto: 150,
        recebido: 150,
        multa: 0,
        tipo: "confirmado",
        data: "2026-08-04",
      },
      {
        clienteId: "c5",
        parcela: "1/10",
        previsto: 375,
        recebido: 200,
        multa: 18.75,
        tipo: "parcial",
        data: "2026-08-01",
      },
      {
        clienteId: "c3",
        parcela: "3/10",
        previsto: 450,
        recebido: 450,
        multa: 0,
        tipo: "confirmado",
        data: "2026-08-03",
      },
      {
        clienteId: "c1",
        parcela: "4/10",
        previsto: 300,
        recebido: 300,
        multa: 0,
        tipo: "confirmado",
        data: "2026-08-04",
      },
      {
        clienteId: "c8",
        parcela: "3/10",
        previsto: 360,
        recebido: 360,
        multa: 0,
        tipo: "confirmado",
        data: "2026-08-04",
      },
      {
        clienteId: "c6",
        parcela: "3/10",
        previsto: 150,
        recebido: 150,
        multa: 0,
        tipo: "confirmado",
        data: "2026-08-04",
      },
      { clienteId: "c2", parcela: "4/10", previsto: 225, recebido: 0, multa: 0, tipo: "nao_pago" },
      { clienteId: "c5", parcela: "2/10", previsto: 375, recebido: 0, multa: 0, tipo: "nao_pago" },
      {
        clienteId: "c4",
        parcela: "7/10",
        previsto: 150,
        recebido: 0,
        multa: 0,
        tipo: "renegociado",
      },
      {
        clienteId: "c3",
        parcela: "4/10",
        previsto: 450,
        recebido: 437.5,
        multa: 0,
        tipo: "parcial",
        data: "2026-08-04",
      },
    ],
    descontos: [
      { id: "d1", descricao: "Parcela da dívida do funcionário (1/10)", valor: 300 },
      { id: "d2", descricao: "Adiantamento em dinheiro", valor: 360 },
    ],
  },
  {
    funcionarioId: "f2",
    periodo: "29/07/2026 a 04/08/2026",
    fechado: true,
    linhas: [
      {
        clienteId: "c3",
        parcela: "2/10",
        previsto: 450,
        recebido: 450,
        multa: 0,
        tipo: "confirmado",
        data: "2026-08-03",
      },
      {
        clienteId: "c4",
        parcela: "6/10",
        previsto: 150,
        recebido: 150,
        multa: 0,
        tipo: "confirmado",
        data: "2026-08-04",
      },
      {
        clienteId: "c8",
        parcela: "2/10",
        previsto: 360,
        recebido: 360,
        multa: 0,
        tipo: "confirmado",
        data: "2026-07-30",
      },
      {
        clienteId: "c8",
        parcela: "3/10",
        previsto: 360,
        recebido: 180,
        multa: 0,
        tipo: "parcial",
        data: "2026-08-04",
      },
      { clienteId: "c3", parcela: "3/10", previsto: 450, recebido: 0, multa: 0, tipo: "nao_pago" },
    ],
    descontos: [{ id: "d3", descricao: "Combustível da rota", valor: 120 }],
  },
  {
    funcionarioId: "f3",
    periodo: "29/07/2026 a 04/08/2026",
    fechado: false,
    linhas: [
      {
        clienteId: "c6",
        parcela: "2/10",
        previsto: 150,
        recebido: 150,
        multa: 0,
        tipo: "confirmado",
        data: "2026-07-31",
      },
      {
        clienteId: "c6",
        parcela: "3/10",
        previsto: 150,
        recebido: 150,
        multa: 0,
        tipo: "confirmado",
        data: "2026-08-04",
      },
      {
        clienteId: "c5",
        parcela: "1/10",
        previsto: 375,
        recebido: 200,
        multa: 18.75,
        tipo: "parcial",
        data: "2026-08-01",
      },
      { clienteId: "c5", parcela: "2/10", previsto: 375, recebido: 0, multa: 0, tipo: "nao_pago" },
    ],
    descontos: [],
  },
];

/* ---------- helpers ---------- */

export const clienteById = (id: string) => clientes.find((c) => c.id === id)!;
export const funcionarioById = (id: string) => funcionarios.find((f) => f.id === id)!;
export const emprestimosDoCliente = (id: string) => emprestimos.filter((e) => e.clienteId === id);
export const recebimentosDoCliente = (id: string) => recebimentos.filter((r) => r.clienteId === id);
