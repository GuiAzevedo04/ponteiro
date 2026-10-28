// Testes de feriados.js e do calendário nas contas. Rodar com: node --test
process.env.TZ = "America/Sao_Paulo";

import { test } from "node:test";
import assert from "node:assert/strict";
import * as F from "../pagina/feriados.js";
import * as C from "../pagina/calculo.js";

const d = C.deChave;
const datas = ano => [...F.feriadosDoAno(ano).keys()].sort();

test("Brasil igual ao de antes, com o 13/10 no calendário padrão", () => {
  assert.deepEqual(datas(2026), ["2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-05-01",
    "2026-06-04", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25"]);
  assert.equal(C.CAL_PADRAO.feriado(d("2026-10-13")), "Aniversário da cidade");
  assert.equal(F.calendario().feriado(d("2026-10-13")), undefined);
});

test("dois feriados no mesmo dia saem os dois", () => {
  // Páscoa em 23/04/2000: a Sexta-feira Santa caiu no Tiradentes
  assert.deepEqual(F.feriadosDoAno(2000).get("2000-04-21"), ["tiradentes", "sextaSanta"]);
  assert.equal(F.calendario().feriado(d("2000-04-21")), "Tiradentes · Sexta-feira Santa");
  assert.equal(F.calendario({ idioma: "en" }).feriado(d("2000-04-21")), "Tiradentes' Day · Good Friday");
});

test("feriados extras: todo ano, uma vez, dia de trabalho e sem nome", () => {
  const cal = F.calendario({
    extras: [{ data: "03-19", nome: "São José", tipo: "feriado" }, { data: "2026-03-20", nome: "", tipo: "feriado" },
      { data: "2026-04-21", nome: "", tipo: "util" }, { data: "2026-10-24", nome: "Reposição", tipo: "util" }],
  });
  assert.equal(cal.feriado(d("2027-03-19")), "São José");
  assert.equal(cal.feriado(d("2026-03-20")), "Feriado");
  assert.equal(cal.feriado(d("2027-03-20")), undefined);
  assert.equal(C.util(d("2026-04-21"), {}, cal), true); // Tiradentes vira dia de trabalho
  assert.equal(C.util(d("2026-10-24"), {}, cal), true); // sábado de reposição
  assert.equal(C.diasUteisMes(2026, 3, {}, cal), 21);
});

test("todo feriado de um ano cai naquele ano e tem nome em português e inglês", () => {
  for (let ano = 2000; ano <= 2100; ano++) {
    for (const [k, ids] of F.feriadosDoAno(ano)) {
      assert.ok(k.startsWith(`${ano}-`), `${ano}: ${k}`);
      for (const id of ids) assert.ok(F.NOMES[id]?.pt && F.NOMES[id]?.en, `${ano}: ${id}`);
    }
  }
});

test("as contas fecham no ano todo", () => {
  let semente = 3;
  const sorte = n => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente % n; };
  const cal = F.calendario();
  const meta = 30 / cal.diasPorSemana;
  const reg = {};
  for (let x = d("2026-01-01"); x.getFullYear() === 2026; x = C.somaDias(x, 1)) {
    if (sorte(3) === 0) continue;
    const e = 420 + sorte(240);
    reg[C.chaveDia(x)] = { entrada: C.msParaHhmm(e * C.MINUTO), almoco: "", almocoHoras: 0,
      saida: sorte(8) ? C.msParaHhmm((e + sorte(500)) * C.MINUTO) : "", meta, ...(sorte(9) ? {} : { tipo: "folga" }) };
  }
  const agora = new Date(2026, 11, 31, 23);
  let porMes = 0;
  for (let m = 0; m < 12; m++) porMes += C.totaisDoMes(C.linhasDoMes(2026, m, reg, meta, agora, cal)).saldo;
  let porSemana = 0;
  for (let s = C.inicioDaSemana(d(C.inicio(reg, agora)), cal); s <= agora; s = C.somaDias(s, 7)) {
    porSemana += C.semana(s, reg, meta, "2027-01-01").saldo;
  }
  const resumo = C.resumoPeriodo(reg, "2026-01-01", agora, 1500, meta, cal);
  assert.deepEqual([porMes, porSemana], [resumo.saldo, resumo.saldo]);
  // Bolsa do ano: 12 bolsas, todo mês tem dia útil
  let bolsa = 0;
  for (let x = d("2026-01-01"); x.getFullYear() === 2026; x = C.somaDias(x, 1)) {
    if (C.util(x, reg, cal)) bolsa += C.valorDia(x, 1500, reg, cal);
  }
  assert.ok(Math.abs(bolsa - 12 * 1500) < 1e-6, String(bolsa));
});

test("dinheiro em reais e dólares", () => {
  // O Intl separa símbolo e número com espaço que não quebra
  assert.equal(C.dinheiro(1500), "R$\u00a01.500,00");
  assert.equal(C.dinheiro(1500.5, "USD", "en-US"), "$1,500.50");
  assert.equal(C.dinheiroOculto("BRL", "pt-BR"), "R$\u00a0•••••");
  assert.equal(C.simboloMoeda("BRL"), "R$");
  assert.equal(C.simboloMoeda("USD", "en-US"), "$");
});

test("câmbio: mesma moeda não mexe em nada; sem cotação não converte", () => {
  const cambio = { base: "USD", taxas: { USD: 1, BRL: 5, EUR: 0.9 } };
  assert.equal(C.taxaCambio(null, "BRL", "BRL"), 1);
  assert.equal(C.taxaCambio(cambio, "BRL", "USD"), 0.2);
  assert.equal(C.taxaCambio(cambio, "USD", "BRL"), 5);
  assert.ok(Math.abs(C.taxaCambio(cambio, "BRL", "EUR") - 0.18) < 1e-12);
  assert.equal(C.taxaCambio(cambio, "BRL", "JPY"), null);
  assert.equal(C.taxaCambio(null, "BRL", "USD"), null);
  assert.equal(C.taxaCambio({ taxas: { USD: 1, BRL: 0 } }, "BRL", "USD"), null);
});
