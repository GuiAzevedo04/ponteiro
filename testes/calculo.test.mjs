// Testes de calculo.js. Rodar com: node --test (na pasta horas)
// As datas são locais: o fuso fica fixo para o resultado não depender da máquina.
process.env.TZ = "America/Sao_Paulo";

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as C from "../pagina/calculo.js";
import { pascoa } from "../pagina/feriados.js";

// Compara como JSON, como a versão que rodava no Chrome: -0 e 0 são iguais
const json = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const igual = (nome, obtido, esperado) => test(nome, () => assert.deepEqual(json(obtido), json(esperado)));

// Sorteio com semente: uma falha se repete igual na próxima rodada
function sorteador(semente) {
  return n => {
    semente = (semente + 0x6d2b79f5) | 0;
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

const d = C.deChave;
const h = C.emMs;

// Feriados: Páscoa de 2026 é 05/04
igual("páscoa 2026", C.chaveDia(pascoa(2026)), "2026-04-05");
igual("páscoa 2025", C.chaveDia(pascoa(2025)), "2025-04-20");
igual("páscoa 2027", C.chaveDia(pascoa(2027)), "2027-03-28");
igual("carnaval 2026", ["2026-02-16", "2026-02-17"].map(k => C.feriadoNacional(d(k))), ["Carnaval", "Carnaval"]);
igual("sexta santa 2026", C.feriadoNacional(d("2026-04-03")), "Sexta-feira Santa");
igual("corpus christi 2026", C.feriadoNacional(d("2026-06-04")), "Corpus Christi");
igual("aparecida não é útil", C.util(d("2026-10-12")), false);
igual("aniversário da cidade", C.util(d("2026-10-13")), false);
igual("quarta comum é útil", C.util(d("2026-10-14")), true);
igual("sábado", C.util(d("2026-10-17")), false);
igual("consciência negra", C.util(d("2026-11-20")), false);

// Dias úteis e valor do dia: outubro/2026 tem 22 dias de semana, 2 feriados
igual("dias úteis out/2026", C.diasUteisMes(2026, 9), 20);
igual("feriado marcado sai da conta", C.diasUteisMes(2026, 9, { "2026-10-30": { tipo: "feriado" } }), 19);
igual("férias continuam úteis", C.diasUteisMes(2026, 9, { "2026-10-30": { tipo: "ferias" } }), 20);
igual("lápide não conta como feriado", C.diasUteisMes(2026, 9, { "2026-10-30": { tipo: "feriado", apagado: true } }), 20);
igual("valor do dia", C.valorDia(d("2026-10-19"), 1500), 75);

// Trabalhado, com o almoço descontado só onde cai no expediente
igual("dia com almoço de 2h", C.trabalhadoMs({ entrada: "09:00", almoco: "12:00", almocoHoras: 2 }, h("17:00")), 6 * C.HORA);
igual("sem almoço", C.trabalhadoMs({ entrada: "13:00", almoco: "", almocoHoras: 0 }, h("17:00")), 4 * C.HORA);
igual("chegou no meio do almoço", C.trabalhadoMs({ entrada: "12:30", almoco: "12:00", almocoHoras: 1 }, h("17:00")), 4 * C.HORA);
igual("no meio do almoço", C.trabalhadoMs({ entrada: "08:00", almoco: "12:00", almocoHoras: 1 }, h("12:30")), 4 * C.HORA);
igual("antes de chegar", C.trabalhadoMs({ entrada: "08:00", almoco: "", almocoHoras: 0 }, h("07:00")), 0);

// Posso sair às
igual("saída com almoço", C.saidaPara({ entrada: "08:00", almoco: "12:00", almocoHoras: 1 }, 6), h("15:00"));
igual("almoço antes da chegada", C.saidaPara({ entrada: "13:00", almoco: "12:00", almocoHoras: 1 }, 6), h("19:00"));
igual("sai antes do almoço", C.saidaPara({ entrada: "07:00", almoco: "12:00", almocoHoras: 1 }, 4), h("11:00"));
igual("chegou no meio do almoço (saída)", C.saidaPara({ entrada: "12:30", almoco: "12:00", almocoHoras: 1 }, 4), h("17:00"));
igual("saída arredonda para cima", C.msParaHhmm(h("16:59") + 40000, Math.ceil), "17:00");
igual("relógio arredonda para baixo", C.msParaHhmm(h("16:59") + 40000), "16:59");

// Saldo da semana com tipos de dia
const semana = {
  "2026-10-05": { entrada: "13:00", almoco: "", almocoHoras: 0, saida: "17:00", meta: 6 },
  "2026-10-06": { entrada: "09:00", almoco: "12:00", almocoHoras: 2, saida: "17:00", meta: 6 },
  "2026-10-07": { tipo: "ferias", meta: 6 },
  "2026-10-08": { tipo: "folga", meta: 6 },
  "2026-10-09": { entrada: "09:00", almoco: "", almocoHoras: 0, meta: 6 },
};
const seg = d("2026-10-05");
igual("semana com férias e folga", C.semana(seg, semana, 6), { ms: 10 * C.HORA, meta: 18 * C.HORA, saldo: -8 * C.HORA });
igual("semana até terça", C.semana(seg, semana, 6, "2026-10-06").saldo, -2 * C.HORA);
igual("dia apagado sai do saldo",
  C.semana(seg, { ...semana, "2026-10-05": { apagado: true, atualizado: 1 } }, 6).saldo, -6 * C.HORA);
igual("segunda da semana", C.chaveDia(C.inicioDaSemana(d("2026-10-11"))), "2026-10-05");

// Sincronização
const { dados, localGanhou } = C.mesclar(
  { campos: { h: "1" }, camposAtualizado: 2, registro: {
    a: { x: 1, atualizado: 5 }, b: { x: 1, atualizado: 1 }, c: { apagado: true, atualizado: 9 } } },
  { campos: { h: "2" }, camposAtualizado: 3, registro: {
    a: { x: 2, atualizado: 3 }, b: { x: 2, atualizado: 1 }, c: { x: 2, atualizado: 4 }, d: { x: 2 } } });
igual("mesclar: dia mais novo ganha", dados.registro.a.x, 1);
igual("mesclar: empate fica com o arquivo", dados.registro.b.x, 2);
igual("mesclar: apagar mais novo ganha", dados.registro.c.apagado, true);
igual("mesclar: dia só do arquivo fica", dados.registro.d.x, 2);
igual("mesclar: campos mais novos", dados.campos.h, "2");
igual("mesclar: avisa que o local tinha novidade", localGanhou, true);
igual("mesclar: formato antigo, arquivo ganha", C.mesclar({ registro: { a: { x: 1 } } }, { registro: { a: { x: 2 } } }).dados.registro.a.x, 2);
igual("mesclar: nada novo no local", C.mesclar({ registro: { a: { x: 1, atualizado: 1 } } }, { registro: { a: { x: 2, atualizado: 2 } } }).localGanhou, false);
// Mesmo dia editado em dois lugares: cada campo fica com a edição mais nova
const mesmoDia = C.mesclar(
  { registro: { d: { entrada: "09:00", almocoHoras: 1.5, t: { almocoHoras: 10 }, atualizado: 10 } } },
  { registro: { d: { entrada: "08:00", almocoHoras: 2, t: { entrada: 5 }, atualizado: 5 } } });
igual("mesclar: campos do mesmo dia se juntam", [mesmoDia.dados.registro.d.entrada, mesmoDia.dados.registro.d.almocoHoras], ["08:00", 1.5]);
igual("mesclar: hora de cada campo fica guardada", mesmoDia.dados.registro.d.t, { entrada: 5, almocoHoras: 10 });
igual("mesclar: voltar a trabalho tira o tipo",
  "tipo" in C.mesclar({ registro: { d: { entrada: "08:00", t: { tipo: 10 }, atualizado: 10 } } },
    { registro: { d: { entrada: "08:00", tipo: "ferias", t: { tipo: 5 }, atualizado: 5 } } }).dados.registro.d, false);
igual("mesclar: editar depois de apagar traz de volta",
  C.mesclar({ registro: { d: { apagado: true, atualizado: 5 } } }, { registro: { d: { entrada: "08:00", t: { entrada: 9 }, atualizado: 9 } } }).dados.registro.d.entrada, "08:00");
const camposJuntos = C.mesclar({ campos: { salario: "2000", entrada: "08:00" }, camposT: { salario: 10 }, registro: {} },
  { campos: { salario: "1500", entrada: "09:00" }, camposT: { entrada: 7 }, registro: {} }).dados.campos;
igual("mesclar: ajustes campo a campo", camposJuntos, { salario: "2000", entrada: "09:00" });
igual("mesclar: navegador vazio não apaga o arquivo", Object.keys(C.mesclar({ registro: {} }, { registro: semana }).dados.registro).length, 5);

// Dias do histórico: de 05/10 em diante, com os feriados
const dias = C.diasDoMes(2026, 9, { "2026-10-05": semana["2026-10-05"] }, d("2026-10-19"));
igual("histórico começa no primeiro registro", dias[0].k, "2026-10-05");
igual("histórico vai até o fim do mês", dias.at(-1).k, "2026-10-30");
igual("histórico tem 18 dias úteis e 2 feriados", [dias.length, dias.filter(x => x.feriado).length], [20, 2]);
igual("nome do feriado", dias.find(x => x.k === "2026-10-12").feriado, "Nossa Senhora Aparecida");

// Relatório e CSV
const linhas = C.linhasDoMes(2026, 9, semana, 6, d("2026-10-19"));
const tot = C.totaisDoMes(linhas);
igual("totais do mês", [tot.trabalhado, tot.meta, tot.diasTrabalhados, tot.porTipo], [10 * C.HORA, 18 * C.HORA, 2, { ferias: 1, folga: 1 }]);
const csv = C.csvDoMes(linhas).split("\r\n");
igual("csv tem BOM e cabeçalho", csv[0].startsWith("﻿data;dia_semana;tipo"), true);
igual("csv usa vírgula decimal", csv[1], "2026-10-05;seg;Trabalho;13:00;;;17:00;4,00;6,00");
igual("csv do feriado", csv.find(l => l.startsWith("2026-10-12")), "2026-10-12;seg;Nossa Senhora Aparecida;;;;;;");

// Estatísticas
const sem = C.semanasAte(d("2026-10-09"), 2, semana, 6);
igual("semanas: mais antiga primeiro", sem.map(s => C.chaveDia(s.segunda)), ["2026-09-28", "2026-10-05"]);
const r = C.resumoPeriodo(semana, "2026-09-28", d("2026-10-09"), 1500, 6);
igual("resumo: dias e médias", [r.dias, r.mediaDia, C.msParaHhmm(r.chegada), C.msParaHhmm(r.saida)], [2, 5 * C.HORA, "11:00", "17:00"]);
igual("resumo: saldo", r.saldo, -8 * C.HORA);
igual("resumo: folga de hoje já entra no saldo", C.resumoPeriodo({ ...semana, "2026-10-09": { tipo: "folga", meta: 6 } },
  "2026-09-28", d("2026-10-09"), 1500, 6).saldo, -14 * C.HORA);
// Bolsa de 05 a 08/10 (09 ainda aberto, é "hoje"): 4 dias × R$ 75, em 10h
igual("resumo: valor da hora", r.porHora, 30);

// Saída antes da chegada: fica fora do saldo em vez de contar 0h
const invertido = { entrada: "09:00", almoco: "", almocoHoras: 0, saida: "07:00", meta: 6 };
igual("saída antes da chegada", [C.saidaAntes(invertido), C.fechado(invertido)], [true, false]);
igual("saída igual à chegada", C.saidaAntes({ ...invertido, saida: "09:00" }), true);
igual("saída normal", [C.saidaAntes(semana["2026-10-05"]), C.fechado(semana["2026-10-05"])], [false, true]);
igual("sem saída não é erro", C.saidaAntes(semana["2026-10-09"]), false);
igual("dia invertido fora do saldo", C.semana(seg, { ...semana, "2026-10-09": invertido }, 6).saldo, -8 * C.HORA);

// Duração do almoço digitada
const duracoes = { "1:10h": 1 + 10 / 60, "1:10": 1 + 10 / 60, "1:1h": null, "1,5h": 1.5, "1.5h": 1.5, "0,5 h": 0.5, "1,5hh": null, "35": 35 / 60, "35min": 35 / 60, "35 min": 35 / 60, "35m": 35 / 60, "1": 1, "1h": 1, "1h30": 1.5,
  "1h 30min": 1.5, "1:30": 1.5, "1,5": 1.5, "1.5": 1.5, "90": 1.5, "0": 0, "": 0, " 2H ": 2, "1h3x": null, "abc": null, "-1": null };
for (const [txt, horas] of Object.entries(duracoes)) igual(`duração "${txt}"`, C.lerDuracao(txt), horas);
igual("duração formatada", [0, 35 / 60, 1, 1.5, 1 + 5 / 60, 2.25].map(h => C.fmtDuracao(h)), ["0", "35min", "1h", "1h30", "1h05", "2h15"]);
// Duração em minutos não pode adiantar nem atrasar o "posso sair" (arredonda para cima)
const desvios = [];
for (let min = 1; min <= 240; min++) {
  const s = C.msParaHhmm(C.saidaPara({ entrada: "08:00", almoco: "12:00", almocoHoras: C.lerDuracao(`${min}min`) }, 6), Math.ceil);
  if (s !== C.msParaHhmm(h("14:00") + min * C.MINUTO)) desvios.push(min);
}
igual("posso sair com almoço em minutos", desvios, []);


// ------------------------------------------------------------------ ritmo da semana

// Semana de 05/10/2026 (seg) a 11/10; metas de 6h
const semanaRitmo = {
  "2026-10-05": { entrada: "08:00", almoco: "", almocoHoras: 0, saida: "15:00", meta: 6 }, // 7h
  "2026-10-06": { entrada: "08:00", almoco: "", almocoHoras: 0, saida: "13:00", meta: 6 }, // 5h
  "2026-10-07": { entrada: "08:00", almoco: "", almocoHoras: 0, saida: "", meta: 6 },
};
igual("ritmo: quarta em andamento, quinta e sexta pela frente",
  C.ritmoSemana(semanaRitmo, new Date(2026, 9, 7, 10), 6, 2 * C.HORA),
  { feito: 14 * C.HORA, meta: 30 * C.HORA, dias: 3, comHoje: true, falta: 16 * C.HORA, porDia: 6 * C.HORA });
igual("ritmo: hoje fechado sai dos dias que faltam",
  C.ritmoSemana({ ...semanaRitmo, "2026-10-07": { ...semanaRitmo["2026-10-07"], saida: "16:00" } }, new Date(2026, 9, 7, 17), 6, 0),
  { feito: 20 * C.HORA, meta: 30 * C.HORA, dias: 2, comHoje: false, falta: 10 * C.HORA, porDia: 5 * C.HORA });
igual("ritmo: férias à frente saem da meta, folga fica",
  C.ritmoSemana({ ...semanaRitmo, "2026-10-08": { tipo: "ferias" }, "2026-10-09": { tipo: "folga", meta: 6 } },
    new Date(2026, 9, 7, 10), 6, 0),
  { feito: 12 * C.HORA, meta: 24 * C.HORA, dias: 1, comHoje: true, falta: 12 * C.HORA, porDia: 12 * C.HORA });
igual("ritmo: semana com feriado (12 e 13/10)", C.ritmoSemana({}, new Date(2026, 9, 12, 9), 6, 0).meta, 18 * C.HORA);
igual("ritmo: meta cumprida não pede hora negativa",
  C.ritmoSemana({ "2026-10-05": { entrada: "06:00", almoco: "", almocoHoras: 0, saida: "23:59", meta: 6 },
    "2026-10-06": { entrada: "06:00", almoco: "", almocoHoras: 0, saida: "23:59", meta: 6 } }, new Date(2026, 9, 7, 9), 6, 0).porDia, 0);
igual("ritmo: sábado sem registro", C.ritmoSemana(semanaRitmo, new Date(2026, 9, 10, 12), 6, 0).dias, 0);

test("ritmo: com a semana toda no passado, bate com o saldo da semana", () => {
  const sorte = sorteador(7);
  for (let i = 0; i < 300; i++) {
    const reg = registroAleatorio(sorte, new Date(2026, 9, 5), 7);
    const r = C.ritmoSemana(reg, new Date(2026, 9, 11, 23), 6, 0);
    const s = C.semana(new Date(2026, 9, 5), reg, 6);
    // Domingo (hoje) de trabalho sem saída: o ritmo já conta a meta dele, o saldo não
    const dom = C.vivo(reg["2026-10-11"]);
    const aberto = dom && C.tipoDe(dom) === "trabalho" && !C.fechado(dom) ? dom.meta * C.HORA : 0;
    assert.equal(r.feito - r.meta, s.saldo - aberto, JSON.stringify(reg));
  }
});

// ------------------------------------------------------------------ projeção do mês

const outubro = {
  "2026-10-01": { entrada: "08:00", almoco: "", almocoHoras: 0, saida: "15:00", meta: 6 }, // +1h
  "2026-10-02": { entrada: "08:00", almoco: "", almocoHoras: 0, saida: "15:00", meta: 6 }, // +1h
  "2026-10-05": { entrada: "08:00", almoco: "", almocoHoras: 0, saida: "13:00", meta: 6 }, // −1h
  "2026-10-06": { tipo: "folga", meta: 6 }, // −6h
  "2026-10-07": { entrada: "08:00", almoco: "", almocoHoras: 0, saida: "", meta: 6 },
  "2026-10-30": { tipo: "folga", meta: 6 },
};
test("projeção: média dos dias fechados nos dias que faltam, folga à frente gasta a meta", () => {
  const p = C.projecaoMes(outubro, new Date(2026, 9, 7, 10), 6);
  // Faltam 07 a 29/10 em dia útil, sem 12 e 13: 15 dias
  assert.deepEqual([p.saldo, p.base, p.restantes, p.media], [-5 * C.HORA, 3, 15, C.HORA / 3]);
  assert.equal(p.fim, -5 * C.HORA + 15 * (C.HORA / 3) - 6 * C.HORA);
});
igual("projeção: sem dia fechado não projeta", C.projecaoMes({}, new Date(2026, 9, 7), 6).fim, null);
igual("projeção: último dia fechado", C.projecaoMes(outubro, new Date(2026, 9, 31, 12), 6).restantes, 0);

test("projeção: o saldo é o mesmo do histórico", () => {
  const sorte = sorteador(11);
  for (let i = 0; i < 300; i++) {
    const reg = registroAleatorio(sorte, new Date(2026, 9, 1), 20);
    const agora = new Date(2026, 9, 21, 23, 59);
    const t = C.totaisDoMes(C.linhasDoMes(2026, 9, reg, 6, agora));
    // O histórico conta folga marcada à frente; a projeção a põe no fim
    assert.equal(C.projecaoMes(reg, agora, 6).saldo, t.saldo);
  }
});

// ------------------------------------------------------------------ restaurar backup

const atual = {
  campos: { salario: "2000" },
  registro: {
    "2026-10-05": { entrada: "08:00", saida: "14:00", meta: 6, t: { entrada: 5 }, atualizado: 5 },
    "2026-10-06": { entrada: "09:00", saida: "15:00", meta: 6, tipo: "folga", t: { tipo: 6 }, atualizado: 6 },
    "2026-10-07": { entrada: "08:00", saida: "", meta: 6, t: {}, atualizado: 7 },
    "2026-10-08": { apagado: true, atualizado: 8 },
  },
};
const backup = {
  campos: { salario: "1500" },
  registro: {
    "2026-10-05": { entrada: "08:00", saida: "14:00", meta: 6, t: {}, atualizado: 1 },
    "2026-10-06": { entrada: "09:00", saida: "16:00", meta: 6 },
    "2026-10-08": { entrada: "10:00", saida: "16:00", meta: 6 },
  },
};
test("restaurar: só os dias diferentes mudam, e ganham a hora de agora", () => {
  const { dados, mudados } = C.restaurar(atual, backup, 100);
  assert.deepEqual(mudados, ["2026-10-06", "2026-10-07", "2026-10-08"]);
  assert.equal(dados.registro["2026-10-05"], atual.registro["2026-10-05"]);
  assert.deepEqual(dados.registro["2026-10-06"], { entrada: "09:00", saida: "16:00", meta: 6,
    t: { entrada: 100, saida: 100, meta: 100, tipo: 100 }, atualizado: 100 });
  assert.deepEqual(dados.registro["2026-10-07"], { apagado: true, atualizado: 100 });
  assert.equal(dados.registro["2026-10-08"].entrada, "10:00");
  assert.deepEqual(dados.campos, atual.campos);
});
igual("restaurar: o mesmo estado não muda nada", C.restaurar(atual, atual, 100).mudados, []);

test("restaurar: a cópia antiga de outra aba não desfaz a volta", () => {
  const sorte = sorteador(3);
  const conteudo = r => Object.fromEntries(Object.entries(r).filter(([, d]) => C.vivo(d)).sort()
    .map(([k, d]) => [k, Object.fromEntries(Object.entries(d).filter(([c]) => c !== "t" && c !== "atualizado").sort())]));
  for (let i = 0; i < 500; i++) {
    const antes = { registro: registroAleatorio(sorte, new Date(2026, 9, 1), 10, true) };
    const velho = { registro: registroAleatorio(sorte, new Date(2026, 9, 1), 10, true) };
    const { dados } = C.restaurar(antes, velho, 10 ** 13);
    assert.deepEqual(conteudo(dados.registro), conteudo(velho.registro));
    for (const [a, b] of [[antes, dados], [dados, antes]]) {
      assert.deepEqual(conteudo(C.mesclar(a, b).dados.registro), conteudo(velho.registro));
    }
  }
});

// ------------------------------------------------------------------ sorteios

// Dias sorteados a partir de `de`, com horários, tipos e lápides variados;
// `comHoras` põe horas de edição como as do app
function registroAleatorio(sorte, de, n, comHoras = false) {
  const reg = {};
  for (let i = 0; i < n; i++) {
    const k = C.chaveDia(C.somaDias(de, i));
    if (sorte(4) === 0) continue;
    if (sorte(10) === 0) {
      reg[k] = { apagado: true, atualizado: sorte(1000) };
      continue;
    }
    const e = 360 + sorte(360);
    const dia = { entrada: C.msParaHhmm(e * C.MINUTO), almoco: sorte(2) ? C.msParaHhmm((e + sorte(300)) * C.MINUTO) : "",
      almocoHoras: [0.5, 1, 1.5][sorte(3)], saida: sorte(6) ? C.msParaHhmm((e + sorte(700)) * C.MINUTO) : "", meta: [6, 8][sorte(2)] };
    const tipo = ["trabalho", "trabalho", "trabalho", "folga", "ferias", "atestado", "feriado"][sorte(7)];
    if (tipo !== "trabalho") dia.tipo = tipo;
    if (comHoras) {
      dia.t = Object.fromEntries(Object.keys(dia).map(c => [c, sorte(1000)]));
      dia.atualizado = Math.max(...Object.values(dia.t));
    }
    reg[k] = dia;
  }
  return reg;
}

test("posso sair às dá exatamente a meta, com qualquer almoço", () => {
  const sorte = sorteador(1);
  for (let i = 0; i < 20000; i++) {
    const reg = { entrada: C.msParaHhmm(sorte(1440) * C.MINUTO), almoco: sorte(3) ? C.msParaHhmm(sorte(1440) * C.MINUTO) : "",
      almocoHoras: [0, 0.5, 1, 1.5, 2, 35 / 60][sorte(6)] };
    const horas = sorte(13);
    const s = C.saidaPara(reg, horas);
    if (s < 24 * C.HORA) assert.ok(Math.abs(C.trabalhadoMs(reg, s) - horas * C.HORA) <= 1, JSON.stringify({ reg, horas }));
    // Ficar mais tempo nunca diminui o trabalhado
    const a = sorte(1440) * C.MINUTO, b = a + sorte(120) * C.MINUTO;
    assert.ok(C.trabalhadoMs(reg, b) >= C.trabalhadoMs(reg, a), JSON.stringify({ reg, a, b }));
  }
});

test("a duração mostrada é lida de volta igual", () => {
  for (let min = 0; min < 600; min++) assert.ok(Math.abs(C.lerDuracao(C.fmtDuracao(min / 60)) - min / 60) < 1e-9, String(min));
});

test("duas abas mexendo nos mesmos dias chegam ao mesmo resultado", () => {
  const sorte = sorteador(5);
  const CAMPOS = ["entrada", "saida", "almoco", "tipo"];
  let relogio = 1;
  const editar = (dados, k) => {
    const agora = (relogio += 1 + sorte(3));
    if (sorte(8) === 0) return void (dados.registro[k] = { apagado: true, atualizado: agora });
    const reg = C.vivo(dados.registro[k]);
    const novo = reg ? { ...reg, t: { ...reg.t } } : { t: {} };
    const c = CAMPOS[sorte(4)];
    if (c === "tipo" && sorte(2)) delete novo.tipo;
    else novo[c] = String(sorte(5));
    novo.t[c] = agora;
    novo.atualizado = agora;
    dados.registro[k] = novo;
  };
  const conteudo = d => JSON.stringify(Object.entries(d.registro).sort()
    .map(([k, r]) => [k, r.apagado ? "lápide" : CAMPOS.filter(c => c in r).map(c => [c, r[c]])]));
  for (let i = 0; i < 20000; i++) {
    const base = { campos: {}, registro: {} };
    for (let j = 0; j < 3; j++) editar(base, `d${sorte(2)}`);
    const a = structuredClone(base), b = structuredClone(base);
    for (let j = 0; j <= sorte(4); j++) editar(sorte(2) ? a : b, `d${sorte(2)}`);
    const ab = C.mesclar(a, b).dados;
    assert.equal(conteudo(ab), conteudo(C.mesclar(b, a).dados));
    assert.equal(conteudo(C.mesclar(ab, ab).dados), conteudo(ab));
  }
});

test("histórico, semanas e estatísticas dão o mesmo saldo", () => {
  const sorte = sorteador(9);
  for (let i = 0; i < 100; i++) {
    const reg = registroAleatorio(sorte, new Date(2026, 0, 1), 365);
    const agora = new Date(2026, 11, 31, 23);
    let porMes = 0;
    for (let m = 0; m < 12; m++) porMes += C.totaisDoMes(C.linhasDoMes(2026, m, reg, 6, agora)).saldo;
    let porSemana = 0;
    for (let s = C.inicioDaSemana(C.deChave(C.inicio(reg, agora))); s <= agora; s = C.somaDias(s, 7)) {
      porSemana += C.semana(s, reg, 6, "2027-01-01").saldo;
    }
    const resumo = C.resumoPeriodo(reg, "2026-01-01", agora, 1500, 6).saldo;
    assert.deepEqual([porMes, porSemana], [resumo, resumo]);
  }
});

// ------------------------------------------------------------------ sintaxe

// O app.js só roda no navegador, mas um erro de sintaxe dá para pegar aqui
for (const arquivo of ["app.js", "graficos.js", "sw.js"]) {
  test(`${arquivo} não tem erro de sintaxe`, () => {
    const caminho = fileURLToPath(new URL(`../pagina/${arquivo}`, import.meta.url));
    const r = spawnSync(process.execPath, ["--check", caminho], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  });
}
