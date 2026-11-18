// Os três gráficos das estatísticas, em SVG, com a tabela de cada um e a dica
// que segue o mouse e o teclado. O app.js calcula os dados e passa os formatos
// do idioma da tela; aqui só se desenha.
import { HORA, deChave, fmtNumero, esc } from "./calculo.js";

const $ = id => document.getElementById(id);

// Formatos do idioma da tela (os mesmos do app.js), trocados a cada desenho
let T, t, H, S, hora, dm, nomeDoDia;

// `barras` são semanas ou dias ({ data, ms, meta, saldo }), conforme `verDias`;
// `dias` são os dias fechados, para o gráfico do expediente
export function desenharGraficos(formatos, barras, verDias, dias, resumo) {
  ({ T, t, H, S, hora, dm, nomeDoDia } = formatos);
  const x = t();
  // Os textos de cada unidade, com os mesmos campos nos dois lados
  const U = verDias
    ? {
      rot: b => nomeDoDia(b.data),
      titulo: rot => rot,
      ate: x.ateDia,
      naUnidade: x.noDia,
      col: x.colDia,
      colAte: x.colAteDia,
      colSaldo: x.colSaldoDia,
      graf: x.grafPorDiaAria,
      grafSaldo: x.grafSaldoDiaAria,
      ultimaAberta: false,
    }
    : {
      rot: b => dm(b.data),
      titulo: x.semanaDe,
      ate: x.ateSemanaDe,
      naUnidade: x.naSemana,
      col: x.colSemanaDe,
      colAte: x.colAteSemanaDe,
      colSaldo: x.colSaldoSemana,
      graf: x.grafSemanasAria,
      grafSaldo: x.grafSaldoAria,
      ultimaAberta: true, // a semana atual ainda não terminou
    };
  graficoHoras(barras, U);
  graficoSaldo(barras, U);
  graficoExpediente(dias, resumo);
}

const decimal = v => fmtNumero(Math.round(v * 100) / 100, T.locale);

function passoBonito(max, alvo = 4) {
  const bruto = max / alvo;
  const p = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

// Coluna com a ponta de cima arredondada e a base reta, no eixo
function colunaPath(x, y, w, h, r = 4) {
  if (h <= 0) return "";
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`;
}

function montarFigura(id, desenho, tabela) {
  const fig = $(id);
  const area = fig.querySelector(".area");
  let tab = fig.querySelector(".tabela-graf");
  if (!tab) {
    tab = document.createElement("div");
    tab.className = "tabela-graf";
    tab.hidden = true;
    fig.append(tab);
  }
  tab.innerHTML = `<table><thead><tr>${tabela.cab.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead>`
    + `<tbody>${tabela.linhas.map(l => `<tr>${l.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  area.innerHTML = desenho ?? `<p class="vazio">${esc(t().semDiasFechados)}</p>`;
  return area;
}

const svgAbre = (L, A, rotulo) => `<svg width="${L}" height="${A}" viewBox="0 0 ${L} ${A}" role="img" aria-label="${esc(rotulo)}">`;
// Rótulos do eixo x: um a cada tantos, contando da direita (a barra mais recente sempre aparece)
const mostraRotulo = (i, n, banda, largura = 48) => (n - 1 - i) % Math.max(1, Math.ceil(largura / banda)) === 0;

function graficoHoras(barras, U) {
  const fig = $("gHoras");
  const tabela = {
    cab: [U.col, t().colTrabalhado, t().colMeta, t().colSaldo],
    linhas: barras.map(b => [U.rot(b), H(b.ms), H(b.meta), S(b.saldo)]),
  };
  if (!barras.length) return montarFigura("gHoras", null, tabela);
  const aberta = i => U.ultimaAberta && i === barras.length - 1;
  const L = Math.max(280, fig.querySelector(".area").clientWidth || fig.clientWidth - 48);
  const A = 220;
  const m = { t: 10, r: 8, b: 28, l: 46 };
  const w = L - m.l - m.r;
  const h = A - m.t - m.b;
  const max = Math.max(1, ...barras.map(b => Math.max(b.ms, b.meta) / HORA));
  const passo = passoBonito(max);
  const topo = Math.ceil(max / passo) * passo;
  const y = v => m.t + h - (v / topo) * h;
  const banda = w / barras.length;
  const larg = Math.min(24, Math.max(2, banda * 0.6));
  let g = "";
  for (let v = 0; v <= topo + 1e-9; v += passo) {
    g += `<line class="grade${v ? "" : " base"}" x1="${m.l}" x2="${L - m.r}" y1="${y(v)}" y2="${y(v)}"/>`
      + `<text class="eixo" x="${m.l - 8}" y="${y(v)}" dy="0.32em" text-anchor="end">${T.eixoHoras(decimal(v))}</text>`;
  }
  barras.forEach((b, i) => {
    const cx = m.l + banda * (i + 0.5);
    const hv = b.ms / HORA;
    if (hv > 0) g += `<path class="barra${aberta(i) ? " parcial" : ""}" data-i="${i}" d="${colunaPath(cx - larg / 2, y(hv), larg, y(0) - y(hv))}"/>`;
    if (b.meta) g += `<line class="meta" x1="${cx - larg / 2 - 3}" x2="${cx + larg / 2 + 3}" y1="${y(b.meta / HORA)}" y2="${y(b.meta / HORA)}"/>`;
    if (mostraRotulo(i, barras.length, banda)) g += `<text class="eixo" x="${cx}" y="${A - 6}" text-anchor="middle">${dm(b.data)}</text>`;
  });
  barras.forEach((b, i) => {
    g += `<rect class="alvo" data-i="${i}" tabindex="0" x="${m.l + banda * i}" y="${m.t}" width="${banda}" height="${h}" aria-label="${esc(t().barraAria(U.titulo(U.rot(b)), H(b.ms), H(b.meta)))}"/>`;
  });
  const area = montarFigura("gHoras", `${svgAbre(L, A, U.graf)}${g}</svg>`, tabela);
  ligarDicas(area, i => {
    const b = barras[i];
    return {
      titulo: U.titulo(U.rot(b)) + (aberta(i) ? t().emAndamento : ""),
      linhas: [[H(b.ms), t().trabalhado, ""], [H(b.meta), t().meta, "neutra"], [S(b.saldo), t().saldo, "nada"]],
    };
  });
}

function graficoSaldo(barras, U) {
  const fig = $("gSaldo");
  let soma = 0;
  const acum = barras.map(b => (soma += b.saldo) / HORA);
  const tabela = {
    cab: [U.colAte, U.colSaldo, t().colAcumulado],
    linhas: barras.map((b, i) => [U.rot(b), S(b.saldo), S(acum[i] * HORA)]),
  };
  if (!barras.length) return montarFigura("gSaldo", null, tabela);
  const L = Math.max(280, fig.querySelector(".area").clientWidth || fig.clientWidth - 48);
  const A = 220;
  const m = { t: 14, r: 68, b: 28, l: 56 };
  const w = L - m.l - m.r;
  const h = A - m.t - m.b;
  const lo = Math.min(0, ...acum);
  const hi = Math.max(0, ...acum);
  const passo = passoBonito(Math.max(1, hi - lo));
  const baixo = Math.floor(lo / passo) * passo;
  const alto = Math.max(baixo + passo, Math.ceil(hi / passo) * passo);
  const y = v => m.t + h - ((v - baixo) / (alto - baixo)) * h;
  const banda = w / barras.length;
  const x = i => m.l + banda * (i + 0.5);
  let g = "";
  for (let v = baixo; v <= alto + 1e-9; v += passo) {
    g += `<line class="grade${Math.abs(v) < 1e-9 ? " base" : ""}" x1="${m.l}" x2="${L - m.r}" y1="${y(v)}" y2="${y(v)}"/>`
      + `<text class="eixo" x="${m.l - 8}" y="${y(v)}" dy="0.32em" text-anchor="end">${v > 0 ? "+" : v < 0 ? "−" : ""}${T.eixoHoras(decimal(Math.abs(v)))}</text>`;
  }
  barras.forEach((b, i) => {
    if (mostraRotulo(i, barras.length, banda)) g += `<text class="eixo" x="${x(i)}" y="${A - 6}" text-anchor="middle">${dm(b.data)}</text>`;
  });
  const pontos = acum.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  g += `<path class="lavagem" d="M${x(0)},${y(0)}L${pontos.join("L")}L${x(acum.length - 1)},${y(0)}Z"/>`;
  g += `<path class="linha-serie" d="M${pontos.join("L")}"/>`;
  const ult = acum.length - 1;
  g += `<circle class="ponto" cx="${x(ult)}" cy="${y(acum[ult])}" r="5"/>`;
  g += `<text class="rotulo-dado" x="${x(ult) + 10}" y="${y(acum[ult])}" dy="0.32em">${S(acum[ult] * HORA)}</text>`;
  acum.forEach((v, i) => {
    g += `<g class="foco" data-i="${i}"><line x1="${x(i)}" x2="${x(i)}" y1="${m.t}" y2="${m.t + h}"/><circle class="ponto" cx="${x(i)}" cy="${y(v)}" r="5"/></g>`;
  });
  barras.forEach((b, i) => {
    g += `<rect class="alvo" data-i="${i}" tabindex="0" x="${m.l + banda * i}" y="${m.t}" width="${banda}" height="${h}" aria-label="${esc(`${U.ate(U.rot(b))}: ${S(acum[i] * HORA)}`)}"/>`;
  });
  const area = montarFigura("gSaldo", `${svgAbre(L, A, U.grafSaldo)}${g}</svg>`, tabela);
  ligarDicas(area, i => ({
    titulo: U.ate(U.rot(barras[i])),
    linhas: [[S(acum[i] * HORA), t().acumulado, ""], [S(barras[i].saldo), U.naUnidade, "nada"]],
  }));
}

function graficoExpediente(dias, resumo) {
  const fig = $("gExpediente");
  const tabela = {
    cab: [t().colDia, t().colChegada, t().colAlmoco, t().colSaida, t().colTrabalhado],
    linhas: dias.map(d => [nomeDoDia(deChave(d.k)), hora(d.entrada),
      d.almoco ? `${hora(d.almoco.ini)}–${hora(d.almoco.fim)}` : "—", hora(d.saida), H(d.ms)]),
  };
  if (!dias.length) return montarFigura("gExpediente", null, tabela);
  const L = Math.max(280, fig.querySelector(".area").clientWidth || fig.clientWidth - 48);
  const A = 300;
  const m = { t: 10, r: 134, b: 28, l: 48 };
  const w = L - m.l - m.r;
  const h = A - m.t - m.b;
  // De 06h embaixo a 24h em cima; só desce se algum dia começou mais cedo
  const ini = Math.min(6 * HORA, Math.floor(Math.min(...dias.map(d => d.entrada)) / (3 * HORA)) * 3 * HORA);
  const fim = 24 * HORA;
  const y = t => m.t + h - ((t - ini) / (fim - ini)) * h;
  const passo = 3 * HORA;
  const banda = w / dias.length;
  const larg = Math.min(24, Math.max(2, banda * 0.6));
  const raio = Math.min(4, larg / 2);
  let g = "";
  for (let t = ini; t <= fim; t += passo) {
    g += `<line class="grade" x1="${m.l}" x2="${L - m.r}" y1="${y(t)}" y2="${y(t)}"/>`
      + `<text class="eixo" x="${m.l - 8}" y="${y(t)}" dy="0.32em" text-anchor="end">${T.eixoHoraDoDia(t / HORA)}</text>`;
  }
  dias.forEach((d, i) => {
    const cx = m.l + banda * (i + 0.5);
    // O almoço que cai dentro do expediente vira um vão entre dois trechos
    const trechos = d.almoco && d.almoco.ini < d.saida && d.almoco.fim > d.entrada
      ? [[d.entrada, Math.max(d.entrada, d.almoco.ini)], [Math.min(d.saida, d.almoco.fim), d.saida]]
      : [[d.entrada, d.saida]];
    for (const [a, b] of trechos) {
      if (b - a <= 0) continue;
      g += `<rect class="seg" data-i="${i}" x="${cx - larg / 2}" y="${y(b)}" width="${larg}" height="${Math.max(1, y(a) - y(b) - 1)}" rx="${raio}"/>`;
    }
    if (mostraRotulo(i, dias.length, banda)) g += `<text class="eixo" x="${cx}" y="${A - 6}" text-anchor="middle">${dm(deChave(d.k))}</text>`;
  });
  for (const [t, rot] of [[resumo.chegada, T.t.chegadaMediaRot], [resumo.saida, T.t.saidaMediaRot]]) {
    g += `<line class="ref" x1="${m.l}" x2="${L - m.r + 4}" y1="${y(t)}" y2="${y(t)}"/>`
      + `<text class="ref-rot" x="${L - m.r + 8}" y="${y(t)}" dy="0.32em">${esc(rot)} ${hora(t)}</text>`;
  }
  dias.forEach((d, i) => {
    g += `<rect class="alvo" data-i="${i}" tabindex="0" x="${m.l + banda * i}" y="${m.t}" width="${banda}" height="${h}" aria-label="${esc(tabela.linhas[i].join(", "))}"/>`;
  });
  const area = montarFigura("gExpediente", `${svgAbre(L, A, t().grafExpedienteAria)}${g}</svg>`, tabela);
  ligarDicas(area, i => {
    const [dia, chegada, almoco, saida, trab] = tabela.linhas[i];
    return { titulo: dia, linhas: [[`${chegada}–${saida}`, t().expediente, ""], [almoco, t().almoco, "nada"], [trab, t().trabalhado, "nada"]] };
  });
}

// Dica do gráfico: a área de cada coluna inteira é o alvo (não só a marca),
// e o teclado (Tab) mostra o mesmo que o mouse. Os ouvintes entram uma vez
// por gráfico; cada redesenho só troca o conteúdo.
const conteudoDaDica = new WeakMap();
function ligarDicas(area, conteudo) {
  const primeiraVez = !conteudoDaDica.has(area);
  conteudoDaDica.set(area, conteudo);
  if (!primeiraVez) return;
  let atual = null;
  const marcar = (i, sim) => {
    for (const e of area.querySelectorAll(`[data-i="${i}"]:not(.alvo)`)) e.classList.toggle("ativo", sim);
  };
  const sair = () => {
    if (atual != null) marcar(atual, false);
    atual = null;
    esconderDica();
  };
  const entrar = e => {
    const alvo = e.target;
    if (!alvo.classList?.contains("alvo")) return;
    const i = Number(alvo.dataset.i);
    if (atual === i) return;
    sair();
    atual = i;
    marcar(i, true);
    const { titulo, linhas } = conteudoDaDica.get(area)(i);
    const dica = $("dica");
    const cab = document.createElement("div");
    cab.className = "titulo";
    cab.textContent = titulo;
    const filas = linhas.map(([valor, rotulo, tecla]) => {
      const fila = document.createElement("div");
      const t = document.createElement("span");
      t.className = `tecla ${tecla}`;
      const b = document.createElement("b");
      b.textContent = valor;
      fila.append(t, b, ` ${rotulo}`);
      return fila;
    });
    dica.replaceChildren(cab, ...filas);
    dica.hidden = false;
    const r = alvo.getBoundingClientRect();
    const d = dica.getBoundingClientRect();
    dica.style.left = `${Math.min(innerWidth - d.width - 8, Math.max(8, r.left + r.width / 2 - d.width / 2))}px`;
    dica.style.top = `${Math.max(8, r.top - d.height - 8)}px`;
  };
  area.addEventListener("pointerover", entrar);
  area.addEventListener("focusin", entrar);
  area.addEventListener("pointerleave", sair);
  area.addEventListener("focusout", sair);
}

export function esconderDica() {
  $("dica").hidden = true;
}
