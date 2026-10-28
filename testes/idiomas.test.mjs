// Testes dos idiomas (idiomas/*.js) e da leitura de durações nos dois.
// Rodar com: node --test
process.env.TZ = "America/Sao_Paulo";

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../pagina/calculo.js";
import pt from "../pagina/idiomas/pt.js";

const CODIGOS = ["pt", "en"];
const IDIOMAS = Object.fromEntries(await Promise.all(CODIGOS.map(async c => [c, (await import(`../pagina/idiomas/${c}.js`)).default])));

// Argumentos de exemplo para os textos que são função
const EXEMPLOS = [[], ["X"], ["X", "Y"], ["X", "Y", "Z"], ["X", "Y", "Z", 3]];
const amostras = f => [1, 2, 3, 4, 5, 11, 12, 21, 26, 100].map(n => f(...(f.length === 1 ? [n] : ["8h00", n, true, n].slice(0, f.length))));

for (const [codigo, I] of Object.entries(IDIOMAS)) {
  test(`${codigo}: mesmas chaves e tipos do português`, () => {
    assert.equal(I.codigo, codigo);
    assert.deepEqual(Object.keys(I.t).sort(), Object.keys(pt.t).sort());
    for (const k of Object.keys(pt.t)) assert.equal(typeof I.t[k], typeof pt.t[k], k);
    assert.deepEqual(Object.keys(I.tipos).sort(), Object.keys(pt.tipos).sort());
    assert.equal(I.csv.cab.length, pt.csv.cab.length);
    assert.equal(I.t.relColunas.length, pt.t.relColunas.length);
    assert.ok(new Intl.Locale(I.locale).language === codigo);
  });

  test(`${codigo}: todo texto sai sem undefined nem NaN`, () => {
    for (const [k, v] of Object.entries(I.t)) {
      const saidas = typeof v === "function"
        ? [...EXEMPLOS.filter(a => a.length >= v.length).map(a => v(...a)), ...amostras(v)]
        : [].concat(v);
      for (const s of saidas) {
        assert.equal(typeof s, "string", k);
        assert.ok(!/undefined|NaN|\[object/.test(s), `${k}: ${s}`);
      }
    }
    for (const h of [0, 6, 12, 18, 23]) assert.ok(I.eixoHoraDoDia(h), "eixoHoraDoDia");
    assert.ok(I.eixoHoras("2,5"));
  });

  test(`${codigo}: a duração mostrada é lida de volta igual`, () => {
    for (let min = 0; min < 600; min++) {
      const texto = C.fmtDuracao(min / 60, I.duracao);
      assert.ok(Math.abs(C.lerDuracao(texto) - min / 60) < 1e-9, `${min} min → "${texto}" → ${C.lerDuracao(texto)}`);
    }
    for (const min of [0, 5, 59, 60, 61, 125, 600, 3000]) {
      const texto = C.fmtH(min * C.MINUTO, I.duracao);
      assert.ok(Math.abs(C.lerDuracao(texto) - min / 60) < 1e-9 || min >= 600, `fmtH ${min} → "${texto}"`);
    }
  });

  test(`${codigo}: CSV abre com o separador certo`, () => {
    const linhas = C.linhasDoMes(2026, 9, { "2026-10-05": { entrada: "08:00", almoco: "12:00", almocoHoras: 1.5, saida: "15:30", meta: 6 } },
      6, new Date(2026, 9, 20));
    const csv = C.csvDoMes(linhas, { ...I.csv, diaSemana: k => k, tipo: t => I.tipos[t] });
    const sep = I.csv.decimal === "," ? ";" : ",";
    const [cab, primeira] = csv.slice(1).split("\r\n");
    assert.equal(cab.split(sep).length, 9);
    assert.equal(primeira.split(sep).length, 9);
    assert.ok(primeira.includes(`6${I.csv.decimal}00`), primeira);
  });
}

test("o CSV em português pelo app é o mesmo de antes", () => {
  const linhas = C.linhasDoMes(2026, 9, { "2026-10-05": { entrada: "13:00", almoco: "", almocoHoras: 0, saida: "17:00", meta: 6 } },
    6, new Date(2026, 9, 19));
  const pelo = C.csvDoMes(linhas, { ...pt.csv, diaSemana: k => pt.dias[C.deChave(k).getDay()], tipo: t => pt.tipos[t] });
  assert.equal(pelo, C.csvDoMes(linhas));
});

test("durações digitadas em português ou inglês", () => {
  const casos = {
    "1 h 30 min": 1.5, "1h 30m": 1.5, "1 hour 30 minutes": 1.5, "1.5 hours": 1.5, "90 min": 1.5, "35 minutos": 35 / 60,
    "2 horas": 2, "1 min.": 1 / 60, "1,5": 1.5, "1:30": 1.5, "1 h 30": 1.5, "45 min": 0.75,
  };
  for (const [texto, horas] of Object.entries(casos)) {
    assert.ok(Math.abs(C.lerDuracao(texto) - horas) < 1e-9, `"${texto}" → ${C.lerDuracao(texto)}`);
  }
  for (const ruim of ["1h3x", "abc", "-1", "h", "1 h 30 km"]) assert.equal(C.lerDuracao(ruim), null, ruim);
});

test("horário e data no jeito de cada idioma", () => {
  assert.equal(C.fmtHora(9 * C.HORA + 5 * C.MINUTO), "09:05");
  assert.equal(C.fmtHora(17 * C.HORA, "en-US"), "5:00 PM");
  assert.equal(C.fmtHora(17 * C.HORA + 30 * C.MINUTO - 1, "pt-BR", Math.ceil), "17:30");
  assert.equal(C.fmtDiaMes(new Date(2026, 9, 22)), "22/10");
  for (const I of Object.values(IDIOMAS)) {
    assert.match(C.fmtHora(9 * C.HORA, I.locale), /9/);
    assert.match(C.fmtDiaMes(new Date(2026, 9, 22), I.locale), /22/);
  }
});

test("todo texto do index.html tem chave", () => {
  const html = readFileSync(new URL("../pagina/index.html", import.meta.url), "utf8");
  const corpo = html.slice(html.indexOf("<body>"));
  for (const [, chave] of corpo.matchAll(/data-t(?:-aria|-title|-placeholder)?="([^"]+)"/g)) {
    assert.ok(chave in pt.t, `chave ${chave} não existe em pt.js`);
  }
  // Elemento com texto (letras) que não vem de data-t: só os que o app preenche ou os símbolos
  const PREENCHIDOS = ["tempo", "dinheiro", "mes", "saida", "pct", "colPorHora", "btnSaida"];
  for (const [, abre, texto] of corpo.matchAll(/(<[a-z0-9]+[^>]*>)([^<]*\p{L}[^<]*)</gu)) {
    if (/data-t=|data-tabela/.test(abre) || PREENCHIDOS.some(id => abre.includes(`id="${id}"`))) continue;
    assert.fail(`texto sem chave: ${abre}${texto.trim()}`);
  }
});
