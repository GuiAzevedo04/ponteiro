// Testes de feriados.js e do calendário nas contas. Rodar com: node --test
process.env.TZ = "America/Sao_Paulo";

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../feriados.js";
import * as C from "../calculo.js";

const d = C.deChave;
const datas = (ano, pais) => [...F.feriadosDoAno(ano, pais).feriados.keys()].sort();

// ------------------------------------------------------------------ referência

// testes/feriados-referencia.json vem do pacote holidays (Python), gerado por
// ferramentas/tabelas_feriados.py --referencia. As diferenças conhecidas:
// - Rússia, depois dos anos com decreto: a regra da lei (feriado no fim de
//   semana vai para o próximo dia útil) põe folgas que o pacote não tem.
// - China, depois dos anos com calendário oficial: o pacote inventa folgas
//   observadas; aqui ficam só os feriados da lei, até sair o calendário.
// - Egito, datas islâmicas: as duas são estimativas da lua e diferem em alguns anos.
const REF = JSON.parse(readFileSync(new URL("./feriados-referencia.json", import.meta.url)));
const OFICIAIS = { CN: [2025, 2026], RU: [2025, 2026, 2027] };
const ISLAMICOS_EG = new Set(["anoNovoIslamico", "mawlid", "eidFitr", "arafah", "eidAdha"]);

for (const [pais, anos] of Object.entries(REF.paises)) {
  test(`feriados de ${pais} batem com a referência`, () => {
    for (const [ano, ref] of Object.entries(anos)) {
      const a = Number(ano);
      if (OFICIAIS[pais] && !OFICIAIS[pais].includes(a)) continue;
      const { feriados, uteis } = F.feriadosDoAno(a, pais);
      let meus = [...feriados.keys()].sort();
      let deles = ref.feriados;
      if (pais === "EG") {
        // Fora as islâmicas, tem que bater. Data da referência que não está
        // aqui e fica a até 4 dias de uma islâmica é a mesma festa estimada
        // de outro jeito.
        const islamicas = meus.filter(k => ISLAMICOS_EG.has(feriados.get(k).id));
        meus = meus.filter(k => !islamicas.includes(k));
        const perto = k => islamicas.some(i => Math.abs(d(i) - d(k)) <= 4 * 864e5);
        deles = deles.filter(k => meus.includes(k) || !perto(k));
      }
      assert.deepEqual(meus, deles, `${pais} ${ano}`);
      assert.deepEqual([...uteis].sort(), ref.uteis, `${pais} ${ano}, dias úteis trocados`);
    }
  });
}

// ------------------------------------------------------------------ casos

test("Brasil igual ao de antes, com o 13/10 no calendário padrão", () => {
  assert.deepEqual(datas(2026, "BR"), ["2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-05-01",
    "2026-06-04", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25"]);
  assert.equal(C.CAL_PADRAO.feriado(d("2026-10-13")), "Aniversário da cidade");
  assert.equal(F.calendario({ pais: "BR" }).feriado(d("2026-10-13")), undefined);
});

test("Japão: dia entre dois feriados e feriado substituto", () => {
  const jp = F.feriadosDoAno(2026, "JP").feriados;
  assert.equal(jp.get("2026-09-22").id, "feriadoNacionalJP");
  assert.equal(jp.get("2026-05-06").id, "substituto");
});

test("EUA: feriado no sábado vai para sexta, até no ano anterior", () => {
  const us = F.feriadosDoAno(2027, "US").feriados;
  assert.deepEqual(us.get("2027-12-31"), { id: "anoNovo", observado: true });
  assert.equal(F.nomeDoFeriado(us.get("2027-12-31")), "Ano Novo (observado)");
  assert.equal(F.nomeDoFeriado(us.get("2027-12-31"), "en"), "New Year's Day (observed)");
});

test("Egito: dois feriados no mesmo dia, um muda e o outro fica", () => {
  const eg = F.feriadosDoAno(2033, "EG").feriados;
  assert.equal(eg.get("2033-04-25").id, "shamElNessim");
  assert.deepEqual(eg.get("2033-04-28"), { id: "sinai", observado: true });
});

test("China: o sábado trocado é dia de trabalho", () => {
  const cn = F.calendario({ pais: "CN" });
  assert.equal(cn.fimDeSemana(d("2026-02-14")), false);
  assert.equal(C.util(d("2026-02-14"), {}, cn), true);
  assert.equal(C.util(d("2026-02-21"), {}, cn), false);
  assert.ok(cn.feriado(d("2026-02-20")));
});

test("Egito e Bangladesh: semana de domingo a quinta", () => {
  for (const pais of ["EG", "BD"]) {
    const cal = F.calendario({ pais });
    assert.equal(C.chaveDia(C.inicioDaSemana(d("2026-10-23"), cal)), "2026-10-18"); // sexta → domingo
    assert.equal(cal.diasPorSemana, 5);
    assert.equal(C.util(d("2026-10-23"), {}, cal), false);
    assert.equal(C.util(d("2026-10-25"), {}, cal), true);
  }
});

test("a folga do país fica sempre no fim da semana", () => {
  for (const pais of [...Object.keys(F.PAISES), ""]) {
    const cal = F.calendario({ pais });
    for (let x = d("2026-01-01"); x.getFullYear() === 2026; x = C.somaDias(x, 1)) {
      const inicio = C.inicioDaSemana(x, cal);
      const fixos = Array.from({ length: 7 }, (_, i) => cal.fimDeSemanaFixo(C.somaDias(inicio, i).getDay()));
      assert.deepEqual(fixos, [...Array(7 - fixos.filter(Boolean).length).fill(false), ...fixos.filter(Boolean)], `${pais} ${C.chaveDia(x)}`);
    }
  }
});

test("feriados extras: todo ano, uma vez, dia de trabalho e sem nome", () => {
  const cal = F.calendario({
    pais: "BR",
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

test("todo feriado de um ano cai naquele ano", () => {
  for (const pais of Object.keys(F.PAISES)) {
    for (let ano = 2000; ano <= 2100; ano += 7) {
      for (const k of datas(ano, pais)) assert.ok(k.startsWith(`${ano}-`), `${pais} ${ano}: ${k}`);
    }
  }
});

test("todo feriado tem nome em português e inglês", () => {
  for (const pais of Object.keys(F.PAISES)) {
    for (let ano = 2025; ano <= 2035; ano++) {
      for (const f of F.feriadosDoAno(ano, pais).feriados.values()) {
        for (const id of [f.id, ...(f.outros ?? [])]) assert.ok(F.NOMES[id]?.pt && F.NOMES[id]?.en, `${pais} ${ano}: ${id}`);
      }
    }
  }
});

test("Páscoa ortodoxa", () => {
  assert.deepEqual([2025, 2026, 2027, 2033].map(a => C.chaveDia(F.pascoaOrtodoxa(a))),
    ["2025-04-20", "2026-04-12", "2027-05-02", "2033-04-24"]);
});

// ------------------------------------------------------------------ contas por país

test("as contas fecham em todo país", () => {
  let semente = 3;
  const sorte = n => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente % n; };
  for (const pais of [...Object.keys(F.PAISES), ""]) {
    const cal = F.calendario({ pais });
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
    assert.deepEqual([porMes, porSemana], [resumo.saldo, resumo.saldo], pais);
    // Bolsa do ano: 12 bolsas, todo mês tem dia útil
    let bolsa = 0;
    for (let x = d("2026-01-01"); x.getFullYear() === 2026; x = C.somaDias(x, 1)) {
      if (C.util(x, reg, cal)) bolsa += C.valorDia(x, 1500, reg, cal);
    }
    assert.ok(Math.abs(bolsa - 12 * 1500) < 1e-6, `${pais}: ${bolsa}`);
  }
});

test("dinheiro em outras moedas", () => {
  // O Intl separa símbolo e número com espaço que não quebra
  assert.equal(C.dinheiro(1500), "R$\u00a01.500,00");
  assert.equal(C.dinheiro(1500, "JPY", "ja-JP"), "￥1,500");
  assert.equal(C.dinheiro(1500.5, "USD", "en-US"), "$1,500.50");
  assert.equal(C.simboloMoeda("BRL"), "R$");
  assert.equal(C.simboloMoeda("EUR", "fr-FR"), "€");
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
