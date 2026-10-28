// Cálculos da página de horas, sem DOM: o app.js desenha, os testes conferem.
// Horários de um dia são "HH:MM"; trechos do dia viram ms desde a meia-noite.
// Feriados e fim de semana vêm num calendário `cal` (feriados.js); sem ele,
// vale CAL_PADRAO: Brasil + 13/10.
import { calendario } from "./feriados.js";

export const HORA = 3600000;
export const MINUTO = 60000;

export const pad = n => String(n).padStart(2, "0");
// Texto que entra em HTML montado com innerHTML
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const chaveDia = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const deChave = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
export const somaDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const desdeMeiaNoite = d => d - new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Criar o Intl.NumberFormat custa mais que formatar: um por moeda e idioma
const formatos = new Map();
function formatoMoeda(moeda, idioma) {
  const k = `${moeda}:${idioma}`;
  if (!formatos.has(k)) formatos.set(k, new Intl.NumberFormat(idioma, { style: "currency", currency: moeda }));
  return formatos.get(k);
}

export const dinheiro = (v, moeda = "BRL", idioma = "pt-BR") => formatoMoeda(moeda, idioma).format(v);
// Quanto vale 1 `de` em `para`, pelas cotações do servidor (todas contra a
// mesma base). null quando falta uma das duas: aí não se converte nada
export function taxaCambio(cambio, de, para) {
  if (de === para) return 1;
  const taxas = cambio?.taxas;
  if (!(taxas?.[de] > 0) || !(taxas?.[para] > 0)) return null;
  return taxas[para] / taxas[de];
}

// O símbolo da moeda sozinho ("R$", "US$")
export const simboloMoeda = (moeda = "BRL", idioma = "pt-BR") =>
  new Intl.NumberFormat(idioma, { style: "currency", currency: moeda }).formatToParts(0).find(p => p.type === "currency").value;

// Valor oculto ("R$ •••••") montado pelo próprio Intl: o símbolo fica do lado
// e com o espaço que o idioma usa
export const dinheiroOculto = (moeda = "BRL", idioma = "pt-BR") => formatoMoeda(moeda, idioma).formatToParts(0)
  .map(p => (p.type === "integer" ? "•••••" : ["decimal", "fraction", "group"].includes(p.type) ? "" : p.value)).join("");

// Como um idioma escreve durações: `total` é a soma de horas ("6h00") e
// `almoco` a duração curta que se digita ("35min", "1h", "1h30"). O padrão é
// o português; idiomas/en.js tem o seu, e lerDuracao entende os dois.
export const DURACAO_PT = {
  total: (h, mm) => `${h}h${mm}`,
  almoco: (h, m) => (h ? `${h}h${m ? pad(m) : ""}` : `${m}min`),
};

export function fmtH(ms, d = DURACAO_PT) {
  const min = Math.round(Math.abs(ms) / MINUTO);
  return d.total(Math.floor(min / 60), pad(min % 60));
}
export const fmtSaldo = (ms, d = DURACAO_PT) => (ms < 0 ? "−" : "+") + fmtH(ms, d);

// Palavras de hora e de minuto em português e inglês, por extenso e abreviadas.
// Valem nos dois idiomas: quem digita "1 hour" com o app em português também é entendido.
const HORAS = ["horas", "hora", "hours", "hour", "hrs", "hr"];
const MINUTOS = ["minutos", "minuto", "minutes", "minute", "mins", "min"];
const UNIDADE = new Map([...HORAS.map(p => [p, "h"]), ...MINUTOS.map(p => [p, "m"])]);
// A mais longa primeiro ("horas" antes de "hora"), e o ponto de abreviação ("min.") vai junto
const PALAVRAS = new RegExp(`(${[...UNIDADE.keys()].sort((a, b) => b.length - a.length).join("|")})\\.?`, "g");

// Duração do almoço como a pessoa digita: "35", "35min", "1h30", "1:30", "1,5",
// "1.5", "1,5h", "1:10h" ou "1 hour 30 minutes". Número solto abaixo de 10 é
// hora, de 10 em diante é minuto (ninguém almoça 35 horas). Devolve horas, ou
// null se não der para entender.
export function lerDuracao(texto) {
  const s = String(texto ?? "").trim().toLowerCase()
    .replace(PALAVRAS, (_, p) => UNIDADE.get(p))
    .replace(/\s+/g, "");
  if (!s) return 0;
  let m;
  if ((m = s.match(/^(\d+)h(?:(\d+)(?:m|min)?)?$/))) return Number(m[1]) + Number(m[2] ?? 0) / 60;
  if ((m = s.match(/^(\d+[.,]\d+)h$/))) return Number(m[1].replace(",", "."));
  if ((m = s.match(/^(\d+)(?:m|min)$/))) return Number(m[1]) / 60;
  if ((m = s.match(/^(\d+):(\d\d)h?$/))) return Number(m[1]) + Number(m[2]) / 60;
  if (/^\d+([.,]\d+)?$/.test(s)) {
    const n = Number(s.replace(",", "."));
    return n < 10 ? n : n / 60;
  }
  return null;
}

export function fmtDuracao(horas, d = DURACAO_PT) {
  const min = Math.round(horas * 60);
  if (!min) return "0";
  return d.almoco(Math.floor(min / 60), min % 60);
}

export const emMs = t => { const [h, m] = t.split(":").map(Number); return (h * 60 + m) * MINUTO; };

// Arredonda para cima: "posso sair às" nunca pode adiantar o horário
export function msParaHhmm(ms, arredonda = Math.floor) {
  const min = arredonda(ms / MINUTO);
  return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
}

// Horário e data para mostrar, no jeito do idioma ("17:00", "5:00 PM";
// "22/10", "10/22"). O que se guarda continua "HH:MM".
const intl = new Map();
function formato(chave, criar) {
  if (!intl.has(chave)) intl.set(chave, criar());
  return intl.get(chave);
}
export function fmtHora(ms, locale = "pt-BR", arredonda = Math.floor) {
  const f = formato(`hora:${locale}`, () => {
    const doze = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hour12;
    // No relógio de 12 horas, "5:00 PM" em vez de "05:00 PM"
    return new Intl.DateTimeFormat(locale, { hour: doze ? "numeric" : "2-digit", minute: "2-digit", timeZone: "UTC" });
  });
  const min = ((arredonda(ms / MINUTO) % 1440) + 1440) % 1440;
  return f.format(Date.UTC(2000, 0, 1, 0, min));
}
export const fmtDiaMes = (d, locale = "pt-BR") =>
  formato(`dm:${locale}`, () => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" })).format(d);
export const fmtData = (d, locale, opcoes) =>
  formato(`d:${locale}:${JSON.stringify(opcoes)}`, () => new Intl.DateTimeFormat(locale, opcoes)).format(d);
export const fmtNumero = (n, locale = "pt-BR", casas = 2) =>
  formato(`n:${locale}:${casas}`, () => new Intl.NumberFormat(locale, { maximumFractionDigits: casas, useGrouping: false })).format(n);

// ------------------------------------------------------------------ calendário

// Brasil mais o aniversário da cidade (13/10): o padrão de toda função que
// recebe `cal`, usado nos testes
export const CAL_PADRAO = calendario({ extras: [{ data: "10-13", nome: "Aniversário da cidade", tipo: "feriado" }] });

export const feriadoNacional = (d, cal = CAL_PADRAO) => cal.feriado(d);
export const inicioDaSemana = (d, cal = CAL_PADRAO) => somaDias(d, -((d.getDay() - cal.inicioSemana + 7) % 7));

// ------------------------------------------------------------------ dias

// Como cada tipo de dia entra nas contas. `meta`: conta na meta da semana
// (folga conta e não tem horas, então gasta saldo). `util`: divide a bolsa
// do mês (férias e atestado são pagos; feriado/recesso sai da divisão).
export const TIPOS = {
  trabalho: { nome: "Trabalho", meta: true, util: true },
  folga: { nome: "Folga", meta: true, util: true },
  ferias: { nome: "Férias", meta: false, util: true },
  atestado: { nome: "Atestado", meta: false, util: true },
  feriado: { nome: "Feriado/recesso", meta: false, util: false },
};

// Apagar um dia deixa uma lápide ({ apagado, atualizado }) para a sincronização
// saber que ele saiu; para as contas, é como se não existisse
export const vivo = reg => (reg && !reg.apagado ? reg : undefined);
export const tipoDe = reg => vivo(reg)?.tipo || "trabalho";

export function util(d, registro = {}, cal = CAL_PADRAO) {
  if (cal.folga(d)) return false;
  return TIPOS[tipoDe(registro[chaveDia(d)])].util;
}

export function diasUteisMes(ano, mes, registro = {}, cal = CAL_PADRAO) {
  let n = 0;
  for (let d = new Date(ano, mes, 1); d.getMonth() === mes; d = somaDias(d, 1)) {
    if (util(d, registro, cal)) n++;
  }
  return n;
}

// A bolsa é fixa no mês, então cada dia útil vale a mesma fração dela:
// meses com menos dias úteis pagam mais por dia
export const valorDia = (d, salario, registro = {}, cal = CAL_PADRAO) =>
  salario / (diasUteisMes(d.getFullYear(), d.getMonth(), registro, cal) || 1);

// Tempo entre a chegada e `ate`, menos a parte do almoço que já passou
export function trabalhadoMs(reg, ate) {
  const entrada = emMs(reg.entrada);
  let ms = Math.max(0, ate - entrada);
  if (reg.almoco) {
    const ini = emMs(reg.almoco);
    const fim = ini + reg.almocoHoras * HORA;
    ms -= Math.max(0, Math.min(ate, fim) - Math.max(ini, entrada));
  }
  return Math.max(0, ms);
}

// Saída antes da chegada é erro de digitação (07:00 por 17:00): contar como
// 0h tiraria a meta inteira do saldo sem ninguém perceber
export const saidaAntes = reg => Boolean(vivo(reg)?.entrada && reg.saida && emMs(reg.saida) <= emMs(reg.entrada));

// Dia fechado = tem chegada e saída, nessa ordem
export const fechado = reg => Boolean(vivo(reg)?.entrada && reg.saida) && !saidaAntes(reg);
export const trabalhadoDia = reg => trabalhadoMs(reg, emMs(reg.saida));

// Quanto um dia entra no saldo: trabalho fechado conta horas e meta; folga só
// a meta; férias, atestado e feriado ficam de fora
export function noSaldo(reg, metaPadrao) {
  if (!vivo(reg)) return null;
  const tipo = tipoDe(reg);
  const meta = (reg.meta ?? metaPadrao) * HORA;
  if (tipo === "folga") return { ms: 0, meta };
  if (tipo !== "trabalho" || !fechado(reg)) return null;
  return { ms: trabalhadoDia(reg), meta };
}

// Saldo da semana (segunda a domingo), parando antes do dia `ate` se houver
export function semana(segunda, registro, metaPadrao, ate = null) {
  let ms = 0, meta = 0;
  for (let i = 0; i < 7; i++) {
    const k = chaveDia(somaDias(segunda, i));
    if (ate && k >= ate) break;
    const c = noSaldo(registro[k], metaPadrao);
    if (c) {
      ms += c.ms;
      meta += c.meta;
    }
  }
  return { ms, meta, saldo: ms - meta };
}

// Como fechar a meta da semana: `porDia` é o que cada dia de trabalho que
// sobra precisa ter, contando hoje como dia inteiro enquanto não tiver saída.
// `msHoje` é o trabalhado de hoje até agora, que só a tela sabe.
export function ritmoSemana(registro, agora, metaPadrao, msHoje, cal = CAL_PADRAO) {
  const hoje = chaveDia(agora);
  let antes = 0, meta = 0, dias = 0, comHoje = false;
  for (let i = 0; i < 7; i++) {
    const d = somaDias(inicioDaSemana(agora, cal), i);
    const k = chaveDia(d);
    const reg = vivo(registro[k]);
    if (k < hoje) {
      const c = noSaldo(reg, metaPadrao);
      if (c) {
        antes += c.ms;
        meta += c.meta;
      }
      continue;
    }
    // Daqui em diante, fim de semana e feriado só entram se tiverem registro
    const tipo = tipoDe(reg);
    if ((!reg && !util(d, registro, cal)) || !TIPOS[tipo].meta) continue;
    meta += (reg?.meta ?? metaPadrao) * HORA;
    if (tipo !== "trabalho") continue;
    if (k === hoje && fechado(reg)) antes += trabalhadoDia(reg);
    else {
      dias++;
      comHoje ||= k === hoje;
    }
  }
  const feito = antes + (comHoje ? msHoje : 0);
  return {
    feito, meta, dias, comHoje,
    falta: Math.max(0, meta - feito),
    porDia: dias ? Math.max(0, meta - antes) / dias : null,
  };
}

// Saldo do mês até agora e onde ele chega no fim do mês se os dias de trabalho
// que faltam seguirem a média dos já fechados. Folga marcada à frente entra
// na conta, porque gasta a meta. `base`: quantos dias fechados fazem a média.
export function projecaoMes(registro, agora, metaPadrao, cal = CAL_PADRAO) {
  const hoje = chaveDia(agora);
  let saldo = 0, sobra = 0, base = 0, restantes = 0, folgas = 0;
  for (let d = new Date(agora.getFullYear(), agora.getMonth(), 1); d.getMonth() === agora.getMonth(); d = somaDias(d, 1)) {
    const k = chaveDia(d);
    const reg = vivo(registro[k]);
    const tipo = tipoDe(reg);
    if (k < hoje || (k === hoje && (tipo !== "trabalho" || fechado(reg)))) {
      const c = noSaldo(reg, metaPadrao);
      if (!c) continue;
      saldo += c.ms - c.meta;
      if (tipo === "trabalho") {
        sobra += c.ms - c.meta;
        base++;
      }
    } else if (reg || util(d, registro, cal)) {
      if (tipo === "trabalho") restantes++;
      else if (tipo === "folga") folgas += (reg.meta ?? metaPadrao) * HORA;
    }
  }
  const media = base ? sobra / base : null;
  return { saldo, base, restantes, media, fim: base ? saldo + media * restantes - folgas : null };
}

// Horário (ms desde a meia-noite) em que se completam `horas` de trabalho,
// empurrado pelo trecho do almoço que cai dentro do expediente
export function saidaPara(reg, horas) {
  const entrada = emMs(reg.entrada);
  let s = entrada + Math.max(0, horas) * HORA;
  if (reg.almoco) {
    const ini = emMs(reg.almoco);
    const ref = Math.max(ini, entrada);
    if (ref < s) s += Math.max(0, ini + reg.almocoHoras * HORA - ref);
  }
  return s;
}

// O histórico começa no primeiro dia registrado: antes disso não há o que mostrar
export function inicio(registro, hoje = new Date()) {
  let primeiro = chaveDia(hoje);
  for (const [k, reg] of Object.entries(registro)) if (vivo(reg) && k < primeiro) primeiro = k;
  return primeiro;
}

// Dias que o histórico e o relatório mostram num mês: os dias úteis a partir
// do primeiro registro (os futuros também, para marcar férias), qualquer dia
// com registro e os feriados nacionais em dia de semana
export function diasDoMes(ano, mes, registro, hoje = new Date(), cal = CAL_PADRAO) {
  const primeiro = inicio(registro, hoje);
  const dias = [];
  for (let d = new Date(ano, mes, 1); d.getMonth() === mes; d = somaDias(d, 1)) {
    const k = chaveDia(d);
    const reg = vivo(registro[k]);
    const feriado = cal.feriado(d);
    if (reg) dias.push({ k, reg });
    else if (k < primeiro || cal.fimDeSemana(d)) continue;
    else dias.push(feriado ? { k, feriado } : { k });
  }
  return dias;
}

// ------------------------------------------------------------------ sincronização

// Junta dois objetos campo a campo: fica o valor editado por último. `ta` e
// `tb` guardam a hora (ms) da edição de cada campo; sem esse mapa (dados
// antigos), vale a hora geral `qa`/`qb`. Empate fica com `b`, que é o arquivo.
// Campo apagado (o tipo que volta a ser "trabalho") também tem hora no mapa.
function juntar(a, ta, qa, b, tb, qb) {
  const out = { ...b };
  const t = { ...(tb ?? {}) };
  let aGanhou = false;
  const quando = (mapa, geral, campo) => (mapa ? mapa[campo] ?? 0 : geral);
  for (const campo of new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(ta ?? {})])) {
    const qA = quando(ta, qa, campo);
    if (qA <= quando(tb, qb, campo)) continue;
    if (campo in a) out[campo] = a[campo];
    else delete out[campo];
    t[campo] = qA;
    aGanhou = true;
  }
  return { out, t, aGanhou };
}

const semMeta = ({ t, atualizado, ...resto }) => resto;

function mesclarDia(a, b) {
  // Apagar e editar o mesmo dia: vale o que aconteceu por último
  if (a.apagado || b.apagado) {
    const aGanhou = (a.atualizado ?? 0) > (b.atualizado ?? 0);
    return { dia: aGanhou ? a : b, aGanhou };
  }
  const { out, t, aGanhou } = juntar(semMeta(a), a.t, a.atualizado ?? 0, semMeta(b), b.t, b.atualizado ?? 0);
  return { dia: { ...out, t, atualizado: Math.max(a.atualizado ?? 0, b.atualizado ?? 0) }, aGanhou };
}

// Junta a cópia do navegador com a do arquivo. Campo a campo, para que duas
// abas (ou um navegador que ficou sem servidor) mexendo no mesmo dia não
// apaguem a mudança uma da outra. `localGanhou`: o local tinha novidade.
export function mesclar(local, remoto) {
  const registro = { ...(remoto.registro ?? {}) };
  let localGanhou = false;
  for (const [k, reg] of Object.entries(local?.registro ?? {})) {
    if (!registro[k]) {
      registro[k] = reg;
      localGanhou = true;
      continue;
    }
    const { dia, aGanhou } = mesclarDia(reg, registro[k]);
    registro[k] = dia;
    localGanhou ||= aGanhou;
  }
  const campos = juntar(local?.campos ?? {}, local?.camposT, local?.camposAtualizado ?? 0,
    remoto.campos ?? {}, remoto.camposT, remoto.camposAtualizado ?? 0);
  return {
    dados: {
      campos: campos.out,
      camposT: campos.t,
      camposAtualizado: Math.max(local?.camposAtualizado ?? 0, remoto.camposAtualizado ?? 0),
      registro,
    },
    localGanhou: localGanhou || campos.aGanhou,
  };
}

const mesmoConteudo = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

// Volta o registro ao de um backup sem brigar com a sincronização: todo campo
// de um dia que muda ganha a hora de agora, e o dia que o backup não tinha
// vira lápide. Assim a cópia antiga de outra aba não desfaz a volta. Os
// ajustes ficam como estão. `mudados`: os dias que mudaram, em ordem.
export function restaurar(dados, backup, agora = Date.now()) {
  const registro = { ...dados.registro };
  const mudados = [];
  for (const k of new Set([...Object.keys(registro), ...Object.keys(backup.registro ?? {})])) {
    const atual = vivo(registro[k]);
    const velho = vivo(backup.registro?.[k]);
    if (!velho) {
      if (atual) {
        registro[k] = { apagado: true, atualizado: agora };
        mudados.push(k);
      }
      continue;
    }
    const conteudo = semMeta(velho);
    if (atual && mesmoConteudo(semMeta(atual), conteudo)) continue;
    // Inclui os campos que só o atual tem, para a ausência deles também ganhar
    const t = {};
    for (const c of [...Object.keys(conteudo), ...Object.keys(atual ?? {}), ...Object.keys(atual?.t ?? {})]) t[c] = agora;
    delete t.t;
    delete t.atualizado;
    registro[k] = { ...conteudo, t, atualizado: agora };
    mudados.push(k);
  }
  return { dados: { ...dados, registro }, mudados: mudados.sort() };
}

// ------------------------------------------------------------------ relatório

export function linhasDoMes(ano, mes, registro, metaPadrao, hoje = new Date(), cal = CAL_PADRAO) {
  return diasDoMes(ano, mes, registro, hoje, cal).map(({ k, reg, feriado }) => {
    const conta = noSaldo(reg, metaPadrao);
    return {
      k,
      tipo: feriado ? "feriado" : tipoDe(reg),
      feriado: feriado ?? null,
      entrada: reg?.entrada ?? "",
      almoco: reg?.almoco ?? "",
      almocoHoras: reg?.almoco ? Number(reg.almocoHoras) : 0,
      saida: reg?.saida ?? "",
      trabalhado: conta?.ms ?? null,
      meta: conta?.meta ?? null,
    };
  });
}

export function totaisDoMes(linhas) {
  const t = { trabalhado: 0, meta: 0, diasTrabalhados: 0, porTipo: {} };
  for (const l of linhas) {
    if (l.trabalhado != null) t.trabalhado += l.trabalhado;
    if (l.meta != null) t.meta += l.meta;
    if (l.tipo === "trabalho" && l.trabalhado != null) t.diasTrabalhados++;
    if (l.tipo !== "trabalho" && !l.feriado) t.porTipo[l.tipo] = (t.porTipo[l.tipo] ?? 0) + 1;
  }
  t.saldo = t.trabalhado - t.meta;
  return t;
}

// O CSV em português: ";" e vírgula decimal, que é como o LibreOffice e o
// Excel em português abrem certo. O inglês passa o seu.
export const CSV_PT = {
  cab: ["data", "dia_semana", "tipo", "chegada", "almoco_inicio", "almoco_horas", "saida",
    "horas_trabalhadas", "meta_horas"],
  diaSemana: k => DIAS[deChave(k).getDay()],
  tipo: t => TIPOS[t].nome,
  decimal: ",",
};

// Com vírgula decimal, o separador é ";" (senão a planilha parte os números);
// com ponto, ",". O BOM faz o Excel ler UTF-8.
export function csvDoMes(linhas, o = CSV_PT) {
  const sep = o.decimal === "," ? ";" : ",";
  const decimal = n => n.toFixed(2).replace(".", o.decimal);
  const celula = v => (new RegExp(`[${sep}"\r\n]`).test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  const horas = ms => (ms == null ? "" : decimal(ms / HORA));
  const corpo = linhas.map(l => [
    l.k, o.diaSemana(l.k), l.feriado ?? o.tipo(l.tipo), l.entrada, l.almoco,
    l.almoco ? decimal(l.almocoHoras) : "", l.saida, horas(l.trabalhado), horas(l.meta),
  ]);
  return "﻿" + [o.cab, ...corpo].map(c => c.map(celula).join(sep)).join("\r\n") + "\r\n";
}

// ------------------------------------------------------------------ estatísticas

// As `n` semanas que terminam na semana de `fim`, mais antiga primeiro
export function semanasAte(fim, n, registro, metaPadrao, cal = CAL_PADRAO) {
  const ultima = inicioDaSemana(fim, cal);
  return Array.from({ length: n }, (_, i) => {
    const segunda = somaDias(ultima, -7 * (n - 1 - i));
    return { segunda, ...semana(segunda, registro, metaPadrao) };
  });
}

// Dias de trabalho fechados entre `de` e `ate` (chaves, inclusive)
export function diasFechados(registro, de, ate) {
  return Object.keys(registro)
    .filter(k => k >= de && k <= ate && tipoDe(registro[k]) === "trabalho" && fechado(registro[k]))
    .sort()
    .map(k => {
      const reg = registro[k];
      const almoco = reg.almoco ? { ini: emMs(reg.almoco), fim: emMs(reg.almoco) + reg.almocoHoras * HORA } : null;
      return { k, entrada: emMs(reg.entrada), saida: emMs(reg.saida), almoco, ms: trabalhadoDia(reg) };
    });
}

const media = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function resumoPeriodo(registro, de, hoje, salario, metaPadrao, cal = CAL_PADRAO) {
  const ate = chaveDia(hoje);
  // Antes do primeiro registro a bolsa não conta: inflaria o valor da hora
  de = de > inicio(registro, hoje) ? de : inicio(registro, hoje);
  const dias = diasFechados(registro, de, ate);
  let saldo = 0;
  let bolsa = 0;
  for (let d = deChave(de); chaveDia(d) <= ate; d = somaDias(d, 1)) {
    const k = chaveDia(d);
    // Trabalho de hoje ainda aberto: a bolsa do dia sem as horas inflaria o
    // valor da hora. Folga, férias e afins de hoje já estão completos.
    if (k === ate && tipoDe(registro[k]) === "trabalho" && !fechado(registro[k])) break;
    const c = noSaldo(registro[k], metaPadrao);
    if (c) saldo += c.ms - c.meta;
    if (util(d, registro, cal)) bolsa += valorDia(d, salario, registro, cal);
  }
  const horas = dias.reduce((a, d) => a + d.ms, 0);
  return {
    dias: dias.length,
    mediaDia: media(dias.map(d => d.ms)),
    chegada: media(dias.map(d => d.entrada)),
    saida: media(dias.map(d => d.saida)),
    saldo,
    porHora: horas ? bolsa / (horas / HORA) : null,
  };
}
