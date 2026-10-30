// Página de horas: tela de hoje, histórico, estatísticas, relatório e avisos.
// As contas ficam em calculo.js; aqui ficam o DOM, a sincronização e o relógio.
import {
  HORA, MINUTO, pad, hhmm, chaveDia, deChave, somaDias, inicioDaSemana, desdeMeiaNoite, dinheiro, dinheiroOculto, simboloMoeda, fmtH,
  fmtSaldo, emMs, msParaHhmm, fmtHora, fmtDiaMes, fmtData, feriadoNacional, TIPOS, vivo, tipoDe, util, diasUteisMes,
  valorDia, trabalhadoMs, fechado, trabalhadoDia,
  saidaAntes, semana, saidaPara, inicio, diasDoMes, mesclar, linhasDoMes, totaisDoMes, csvDoMes, semanasAte,
  diasFechados, resumoPeriodo, lerDuracao, fmtDuracao, ritmoSemana, projecaoMes, restaurar, taxaCambio, esc, bolsaDoMes, fecharBolsa,
} from "./calculo.js";
import { calendario } from "./feriados.js";
import { desenharGraficos, esconderDica } from "./graficos.js";
import pt from "./idiomas/pt.js";

// A busca sai antes de tudo; a tela só espera por ela se o navegador ainda
// não tiver uma cópia dos dados
const primeiraBusca = fetch("/dados", { cache: "no-store" }).catch(() => null);

const $ = id => document.getElementById(id);

// ------------------------------------------------------------------ idioma

// O idioma da tela (idiomas/*.js). Português vem junto; o inglês se carrega
// na hora de usar. `t` são os textos; o resto, formatos.
let T = pt;
const t = () => T.t;
const H = ms => fmtH(ms, T.duracao);
const S = ms => fmtSaldo(ms, T.duracao);
const hora = (ms, arredonda) => fmtHora(ms, T.locale, arredonda);
const horaTxt = hhmm => (hhmm ? hora(emMs(hhmm)) : "");
const dm = d => fmtDiaMes(d, T.locale);
const diaSem = d => (T.dias ? T.dias[d.getDay()] : fmtData(d, T.locale, { weekday: "short" }));
const nomeDoDia = d => `${diaSem(d)} ${dm(d)}`;
const duracao = horas => fmtDuracao(horas, T.duracao);
const nomeTipo = tipo => T.tipos[tipo];

// Os idiomas do app, cada um pelo próprio nome
const IDIOMAS = { pt: "Português", en: "English" };
const carregados = { pt };
async function carregarIdioma(codigo) {
  if (!IDIOMAS[codigo]) codigo = "pt";
  if (!carregados[codigo]) {
    try {
      carregados[codigo] = (await import(`./idiomas/${codigo}.js`)).default;
    } catch {
      return pt; // sem servidor e sem cópia guardada: fica em português
    }
  }
  return carregados[codigo];
}

function idiomaDoNavegador() {
  for (const l of navigator.languages ?? [navigator.language]) {
    const codigo = String(l).slice(0, 2).toLowerCase();
    if (IDIOMAS[codigo]) return codigo;
  }
  return "en";
}

// Os textos fixos do HTML levam a chave: data-t (o texto), data-t-aria,
// data-t-title e data-t-placeholder; data-t-arg vai para os que são função
function traduzirPagina() {
  const x = t();
  const texto = e => (typeof x[e.dataset.t] === "function" ? x[e.dataset.t](e.dataset.tArg) : x[e.dataset.t]);
  document.documentElement.lang = T.locale;
  for (const e of document.querySelectorAll("[data-t]")) poe(e, texto(e));
  for (const [dado, atributo] of [["tAria", "aria-label"], ["tTitle", "title"], ["tPlaceholder", "placeholder"]]) {
    const nome = `data-${dado.replace(/[A-Z]/g, l => `-${l.toLowerCase()}`)}`;
    for (const e of document.querySelectorAll(`[${nome}]`)) e.setAttribute(atributo, x[e.dataset[dado]]);
  }
  document.querySelector('meta[name="description"]').content = x.descricao;
  for (const b of document.querySelectorAll("[data-tabela]")) {
    poe(b, b.closest("figure").classList.contains("em-tabela") ? x.verGrafico : x.verTabela);
  }
  opcoesAjustes();
  if ($("ajustes").open) desenharExtras();
  document.documentElement.classList.remove("traduzindo");
}

// Troca o idioma da tela pelo dos ajustes (que pode ter vindo de outra aba)
async function aplicarIdioma() {
  const novo = await carregarIdioma(cfg().idioma);
  if (novo === T) return;
  T = novo;
  local.gravar("horas.idioma", T.codigo);
  traduzirPagina();
  aoMudarDeFora();
}

// Só mexe no DOM quando o texto muda: evita recalcular estilo e layout à toa
function poe(e, texto) {
  if (e.textContent !== texto) e.textContent = texto;
}
const htmlAtual = new WeakMap();
function poeHtml(e, html) {
  if (htmlAtual.get(e) !== html) {
    htmlAtual.set(e, html);
    e.innerHTML = html;
  }
}
const saldoHtml = ms => `<span class="${ms < 0 ? "neg" : "pos"}">${S(ms)}</span>`;

// O navegador pode recusar o localStorage (janela anônima, dados bloqueados)
const local = {
  ler(k) { try { return localStorage.getItem(k); } catch { return null; } },
  gravar(k, v) { try { localStorage.setItem(k, v); } catch { /* fica só na memória */ } },
  apagar(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
};
function lerJSON(k) {
  try { return JSON.parse(local.ler(k)); } catch { return null; }
}

// ------------------------------------------------------------------ dados

const PADRAO = {
  horasSemana: "30", salario: "3000", entrada: "08:00", almoco: "12:00", almocoHoras: "1",
  temAlmoco: "true", temExtra: "false", nome: "", alertas: "false", tema: "escuro", cores: "padrao", ocultar: "true",
};

// Persistência: o servidor.py guarda tudo em horas/dados/registro.json, que é a
// fonte da verdade. O navegador mantém uma cópia para abrir na hora e para
// quando o servidor estiver desligado; cada campo carrega a hora da última
// edição, e as duas cópias se juntam campo a campo (calculo.js: mesclar).
let dados = lerJSON("horas.dados"); // { campos, camposAtualizado, registro }; null até a 1ª carga
let versao = local.ler("horas.versao") ?? '"?"';
let pendente = local.ler("horas.pendente") === "1";
let online = null;
let edicoes = 0;

function lerExtras(json) {
  try {
    const lista = JSON.parse(json);
    return Array.isArray(lista) ? lista.filter(e => e && /^(\d{4}-)?\d{2}-\d{2}$/.test(e.data)) : [];
  } catch {
    return [];
  }
}

let calGuardado = { chave: null, cal: null };
function calDe(extras) {
  const chave = `${extras}|${T.codigo}`;
  if (calGuardado.chave !== chave) {
    calGuardado = { chave, cal: calendario({ extras: lerExtras(extras), idioma: T.codigo, semNome: t().feriado }) };
  }
  return calGuardado.cal;
}

// Cotações do dia (o servidor busca uma vez por dia). A última fica no
// navegador, para a conversão valer mesmo com o servidor desligado
let cambio = lerJSON("horas.cambio");
async function buscarCambio() {
  try {
    const r = await fetch("/dados/cambio", { cache: "no-store" });
    if (!r.ok) return;
    const novo = await r.json();
    if (novo?.data === cambio?.data && novo?.base === cambio?.base) return;
    cambio = novo;
    local.gravar("horas.cambio", JSON.stringify(novo));
    aoMudarDeFora();
    descreverCambio();
  } catch { /* fica a cotação que já tinha */ }
}

function cfg() {
  const c = { ...PADRAO, ...dados?.campos };
  const cal = calDe(c.feriadosExtras ?? "[]");
  // A bolsa é guardada na moeda em que se recebe; a tela pode mostrar em
  // outra. Sem cotação, mostra na da bolsa mesmo
  const moedaBolsa = c.moedaBolsa || "BRL";
  const moedaPedida = c.moeda || moedaBolsa;
  const taxa = taxaCambio(cambio, moedaBolsa, moedaPedida);
  const salario = Number(c.salario) || 0;
  return {
    cal, moedaBolsa, moedaPedida,
    idioma: c.idioma ?? local.ler("horas.idioma") ?? "pt",
    moeda: taxa === null ? moedaBolsa : moedaPedida,
    taxa: taxa ?? 1,
    metaDia: (Number(c.horasSemana) || 0) / 5,
    horasSemana: Number(c.horasSemana) || 0,
    bolsa: d => bolsaDoMes(c.bolsasAte, d, salario),
    entrada: c.entrada,
    almoco: c.almoco,
    almocoHoras: Number(c.almocoHoras) || 0,
    temAlmoco: c.temAlmoco === "true",
    temExtra: c.temExtra === "true",
    nome: c.nome,
    alertas: c.alertas === "true",
    tema: c.tema,
    cores: c.cores,
    ocultar: c.ocultar !== "false",
  };
}

let envioTimer;
function salvar() {
  edicoes++;
  local.gravar("horas.dados", JSON.stringify(dados));
  pendente = true;
  local.gravar("horas.pendente", "1");
  // Junta as mudanças de alguns instantes num envio só
  clearTimeout(envioTimer);
  envioTimer = setTimeout(enviar, 300);
  mostrarEstado();
}

// Cada campo guarda a hora da própria edição (camposT e reg.t): é o que
// deixa juntar mudanças de duas abas no mesmo dia sem perder nenhuma
function mudarCampos(mudancas) {
  const agora = Date.now();
  dados.campos = { ...dados.campos, ...mudancas };
  dados.camposT = { ...dados.camposT };
  for (const c of Object.keys(mudancas)) dados.camposT[c] = agora;
  dados.camposAtualizado = agora;
  salvar();
}

const diaNovo = () => {
  const c = cfg();
  return { entrada: "", almoco: "", almocoHoras: c.almocoHoras, saida: "", meta: c.metaDia };
};

function mudarDia(k, mudancas) {
  const agora = Date.now();
  const { t: _t, atualizado: _a, apagado: _ap, ...novos } = mudancas;
  const atual = vivo(dados.registro[k]);
  const reg = { ...(atual ?? diaNovo()), ...novos };
  // Dia novo: todos os campos nascem agora; dia existente: só os que mudaram
  // de valor (o registrarHoje manda todos de uma vez)
  const mudou = c => !atual || (c === "tipo" ? tipoDe(atual) !== (novos.tipo || "trabalho") : atual[c] !== novos[c]);
  const t = { ...atual?.t };
  for (const c of Object.keys(atual ? novos : reg)) if (mudou(c)) t[c] = agora;
  if (reg.tipo === "trabalho") delete reg.tipo;
  dados.registro[k] = { ...reg, t, atualizado: agora };
  salvar();
}

// Apagar deixa uma lápide: sem ela, a cópia de outra aba traria o dia de volta
function apagarDia(k) {
  dados.registro[k] = { apagado: true, atualizado: Date.now() };
  salvar();
}

// ------------------------------------------------------------------ sincronização

async function sincronizar(resposta) {
  let r = resposta;
  let remoto = null;
  try {
    if (r === undefined) r = await fetch("/dados", { cache: "no-store" });
    if (r?.ok) remoto = await r.json();
  } catch {
    // sem servidor: fica com a cópia do navegador
  }
  online = remoto !== null;
  if (online) receber(remoto, r.headers.get("ETag"));
  mostrarEstado();
}

function receber(remoto, etag) {
  const antes = JSON.stringify(dados);
  const { dados: juntos, localGanhou } = mesclar(dados, remoto);
  dados = juntos;
  if (etag) {
    versao = etag;
    local.gravar("horas.versao", versao);
  }
  if (JSON.stringify(dados) !== antes) {
    local.gravar("horas.dados", JSON.stringify(dados));
    aoMudarDeFora();
  }
  if (localGanhou) enviar();
  else if (!enviando) {
    pendente = false;
    local.apagar("horas.pendente");
  }
}

let enviando = false;
let enviarDeNovo = false;
async function enviar() {
  clearTimeout(envioTimer);
  if (enviando) {
    enviarDeNovo = true;
    return;
  }
  enviando = true;
  const marca = edicoes;
  try {
    // O If-Match diz em cima de qual versão do arquivo foi feita a mudança. Se
    // outra aba ou outro navegador gravou antes, o servidor responde 409 com
    // o arquivo atual: junta os dois e tenta de novo.
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      let r;
      let atual = null;
      try {
        r = await fetch("/dados", {
          method: "PUT",
          headers: { "Content-Type": "application/json", "If-Match": versao },
          body: JSON.stringify(dados),
        });
        if (r.status === 409) atual = await r.json();
      } catch {
        online = false; // sem servidor: a mudança fica pendente no navegador
        break;
      }
      versao = r.headers.get("ETag") ?? versao;
      local.gravar("horas.versao", versao);
      if (atual) {
        dados = mesclar(dados, atual).dados;
        local.gravar("horas.dados", JSON.stringify(dados));
        aoMudarDeFora();
        continue;
      }
      online = r.ok;
      if (r.ok && edicoes === marca) {
        pendente = false;
        local.apagar("horas.pendente");
      }
      break;
    }
  } finally {
    enviando = false;
  }
  mostrarEstado();
  if (enviarDeNovo) {
    enviarDeNovo = false;
    enviar();
  }
}

function mostrarEstado() {
  const e = $("estado");
  e.classList.toggle("off", online === false);
  if (online === false) poe(e, t().semServidor);
  else if (pendente) poe(e, t().salvando);
  else if (online) poe(e, t().salvo);
  e.title = online === false ? t().sobeQuandoVoltar : "horas/dados/registro.json";
}

// Outra aba deste navegador gravou: junta na hora, sem esperar o servidor
addEventListener("storage", e => {
  if (!pronto || !e.newValue) return;
  if (e.key === "horas.dados") {
    dados = mesclar(dados, JSON.parse(e.newValue)).dados;
    aoMudarDeFora();
  } else if (e.key === "horas.versao") {
    versao = e.newValue;
  }
});

// ------------------------------------------------------------------ telas

const TELAS = { hoje: $("telaHoje"), historico: $("telaHistorico"), estatisticas: $("telaEstatisticas") };
const BOTOES = { hoje: $("btnHoje"), historico: $("btnHistorico"), estatisticas: $("btnEstatisticas") };
let tela = "hoje";
let pronto = false;

function mostrar(nome) {
  if (!TELAS[nome]) nome = "hoje";
  tela = nome;
  for (const [n, t] of Object.entries(TELAS)) t.hidden = n !== nome;
  for (const [n, b] of Object.entries(BOTOES)) {
    if (n === nome) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  esconderDica();
  if (nome === "historico") renderHistorico();
  else if (nome === "estatisticas") renderEstatisticas();
  else {
    recalcular();
    desenharSegundo(new Date());
  }
}

// O endereço guarda a tela (#historico): F5 volta nela e o Voltar funciona.
// pushState não dispara evento, então a tela é desenhada aqui mesmo.
function irPara(nome) {
  if (location.hash !== `#${nome}`) history.pushState(null, "", `#${nome}`);
  mostrar(nome);
}
for (const [nome, botao] of Object.entries(BOTOES)) {
  botao.addEventListener("click", () => {
    if (nome === "historico") mesVisto = primeiroDoMes(new Date());
    irPara(nome);
  });
}
addEventListener("popstate", () => mostrar(location.hash.slice(1)));
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && tela !== "hoje" && !$("ajustes").open) irPara("hoje");
});

// Dado mudou fora desta tela (sincronização, outra aba): redesenha o que aparece
function aoMudarDeFora() {
  if (!pronto) return;
  if (cfg().idioma !== T.codigo) aplicarIdioma();
  aplicarTema();
  preencherCampos();
  recalcular();
  desenharSegundo(new Date());
  if (tela === "historico") renderHistorico();
  if (tela === "estatisticas") renderEstatisticas();
}

function aplicarTema() {
  const c = cfg();
  document.documentElement.dataset.tema = c.tema;
  document.documentElement.dataset.cores = c.cores;
  // inicio.js lê antes de pintar, para o tema claro não piscar escuro
  local.gravar("horas.tema", c.tema);
  local.gravar("horas.cores", c.cores);
  faviconPasso = -1; // as cores do favicon vêm do tema
  ocultarValores = c.ocultar;
  $("btnOcultar").setAttribute("aria-pressed", String(ocultarValores));
  $("btnOcultar").setAttribute("aria-label", ocultarValores ? t().mostrarValores : t().ocultarValores);
}

// Como o app do banco: os valores em reais saem da tela, mas continuam nas
// contas. Relatório e CSV mostram tudo, porque são para entregar.
let ocultarValores = true;
const grana = v => {
  const { moeda, taxa } = cfg();
  return ocultarValores ? dinheiroOculto(moeda, T.locale) : dinheiro(v * taxa, moeda, T.locale);
};
$("btnOcultar").addEventListener("click", () => {
  mudarCampos({ ocultar: String(!ocultarValores) });
  aoMudarDeFora();
});

// ------------------------------------------------------------------ hoje

const CAMPOS_HOJE = ["entrada", "temAlmoco", "almoco", "almocoHoras", "tipoHoje"];

const opcoesTipo = () => Object.keys(TIPOS).map(v => `<option value="${v}">${esc(nomeTipo(v))}</option>`).join("");

// Os campos de cima são sempre o dia de hoje: mostram o registro de hoje se
// houver, senão os últimos valores usados, para não digitar de novo a cada dia
function preencherCampos() {
  const c = cfg();
  const reg = vivo(dados.registro[chaveDia(new Date())]);
  const valores = {
    entrada: reg?.entrada || c.entrada,
    temAlmoco: reg ? Boolean(reg.almoco) : c.temAlmoco,
    almoco: reg?.almoco || c.almoco,
    almocoHoras: duracao(reg?.almocoHoras ?? c.almocoHoras),
    tipoHoje: tipoDe(reg),
    temExtra: c.temExtra,
  };
  for (const [id, v] of Object.entries(valores)) {
    const e = $(id);
    if (e === document.activeElement) continue;
    if (e.type === "checkbox") e.checked = v;
    else e.value = v;
  }
  $("almoco").disabled = !$("temAlmoco").checked;
  $("almocoHoras").removeAttribute("aria-invalid");
}

// Enquanto a duração digitada não fizer sentido ("1h3x"), vale a última boa
function almocoDigitado() {
  const horas = lerDuracao($("almocoHoras").value);
  return horas ?? vivo(dados.registro[chaveDia(new Date())])?.almocoHoras ?? cfg().almocoHoras;
}

const regDosCampos = () => ({
  entrada: $("entrada").value,
  almoco: $("temAlmoco").checked ? $("almoco").value : "",
  almocoHoras: almocoDigitado(),
  meta: cfg().metaDia,
  tipo: $("tipoHoje").value,
});

// Fim de semana só entra se já tiver registro (ou se a saída for registrada).
// Hoje apagado só volta se a pessoa digitar: abrir a página não o recria.
function registrarHoje(digitou = false) {
  const agora = new Date();
  const k = chaveDia(agora);
  const atual = vivo(dados.registro[k]);
  if (!atual && !digitou && dados.registro[k]?.apagado) return;
  if (!atual && !util(agora, dados.registro, cfg().cal)) return;
  const novo = regDosCampos();
  // Só grava se algo mudou: abrir a página não pode virar uma gravação
  const mudou = !atual || tipoDe(atual) !== novo.tipo
    || ["entrada", "almoco", "almocoHoras", "meta"].some(c => atual[c] !== novo[c]);
  if (mudou) mudarDia(k, novo);
}

function aoEditarHoje() {
  $("almocoHoras").setAttribute("aria-invalid", String(lerDuracao($("almocoHoras").value) == null));
  const r = regDosCampos();
  mudarCampos({
    entrada: r.entrada,
    almoco: $("almoco").value,
    almocoHoras: String(r.almocoHoras),
    temAlmoco: String($("temAlmoco").checked),
  });
  registrarHoje(true);
  $("almoco").disabled = !$("temAlmoco").checked;
  recalcular();
  desenharSegundo(new Date());
}
for (const id of CAMPOS_HOJE) $(id).addEventListener("input", aoEditarHoje);
// Ao sair do campo, mostra como a duração foi entendida ("35" vira "35min")
$("almocoHoras").addEventListener("change", e => {
  const horas = lerDuracao(e.target.value);
  if (horas != null) e.target.value = duracao(horas);
});
$("btnAgora").addEventListener("click", () => {
  $("entrada").value = hhmm(new Date());
  aoEditarHoje();
});
$("temExtra").addEventListener("input", () => {
  mudarCampos({ temExtra: String($("temExtra").checked) });
  recalcular();
});

$("btnSaida").addEventListener("click", () => {
  const agora = new Date();
  const k = chaveDia(agora);
  if (vivo(dados.registro[k])?.saida) mudarDia(k, { saida: "" });
  else mudarDia(k, { ...regDosCampos(), saida: hhmm(agora) });
  recalcular();
  desenharSegundo(agora);
});

// O que muda de minuto em minuto fica em `calc`; o relógio de cada segundo só
// lê dali. Assim o tique custa quase nada.
let calc = null;

function recalcular() {
  const agora = new Date();
  const k = chaveDia(agora);
  const c = cfg();
  const { cal } = c;
  const horasDia = c.metaDia;
  const reg = regDosCampos();
  const saiu = vivo(dados.registro[k])?.saida || "";
  const saldo = horasDia ? semana(inicioDaSemana(agora), dados.registro, horasDia, k).saldo : 0;
  // Depois da saída, o card mostra a semana já com hoje; antes, o saldo até
  // ontem é o que decide a hora de sair
  const fechouHoje = Boolean(saiu) && horasDia > 0 && fechado(vivo(dados.registro[k]));
  const saldoComHoje = fechouHoje
    ? semana(inicioDaSemana(agora), dados.registro, horasDia, chaveDia(somaDias(agora, 1))).saldo : null;
  const compensar = c.temExtra ? -saldo / HORA : 0;
  const vDia = valorDia(agora, c.bolsa(agora), dados.registro, cal);
  // Antes do primeiro registro a bolsa não conta, como no histórico
  const primeiro = deChave(inicio(dados.registro, agora));
  let diasPassados = 0;
  for (let d = new Date(agora.getFullYear(), agora.getMonth(), 1); d.getDate() < agora.getDate(); d = somaDias(d, 1)) {
    if (d >= primeiro && util(d, dados.registro, cal)) diasPassados++;
  }
  const temEntrada = Boolean(reg.entrada) && horasDia > 0;
  calc = {
    k, minuto: agora.getMinutes(), horasDia, reg, tipo: reg.tipo, saldo, saldoComHoje, compensar, vDia, diasPassados,
    diasUteis: diasUteisMes(agora.getFullYear(), agora.getMonth(), dados.registro, cal),
    temEntrada, ehUtil: util(agora, dados.registro, cal), saiu: saiu ? emMs(saiu) : null, saiuTexto: saiu,
    meta: temEntrada ? saidaPara(reg, horasDia) : null,
    saida: temEntrada ? saidaPara(reg, horasDia + compensar) : null,
    zerar: temEntrada ? saidaPara(reg, horasDia - saldo / HORA) : null,
    projecao: horasDia ? projecaoMes(dados.registro, agora, horasDia, cal) : null,
  };
  desenharMinuto(agora);
  desenharPendencia(agora);
  armarAviso();
  if (tela === "historico") atualizarHojeNoHistorico(agora);
  // Sem servidor: tenta de novo, e o que ficou sem subir sobe junto
  if (online === false && !enviando) sincronizar();
}

// Dia de trabalho sem saída (ou com saída antes da chegada) fica fora do
// saldo: sem este aviso, esquecer a saída deixa o saldo com cara de em dia
let pendentes = [];
function desenharPendencia(agora) {
  pendentes = [];
  for (let i = 7; i >= 1; i--) {
    const d = somaDias(agora, -i);
    const reg = vivo(dados.registro[chaveDia(d)]);
    if (reg?.entrada && tipoDe(reg) === "trabalho" && !fechado(reg)) pendentes.push(d);
  }
  const p = $("pendencia");
  p.hidden = !pendentes.length;
  if (p.hidden) return;
  const [d] = pendentes;
  poe($("pendenciaTexto"), pendentes.length > 1
    ? t().pendenciaVarios(pendentes.length, pendentes.map(nomeDoDia).join(", "))
    : t().pendenciaUm(nomeDoDia(d), saidaAntes(dados.registro[chaveDia(d)])));
}

$("btnPendencia").addEventListener("click", () => {
  const [d] = pendentes;
  if (!d) return;
  mesVisto = primeiroDoMes(d);
  irPara("historico");
  const campo = $("linhas").querySelector(`tr[data-dia="${chaveDia(d)}"] [data-campo="saida"]`);
  campo?.focus();
  campo?.scrollIntoView({ block: "center" });
});

const trabalhadoAgora = desde =>
  calc.temEntrada && calc.tipo === "trabalho" ? trabalhadoMs(calc.reg, calc.saiu ?? desde) : 0;

function ganhoHoje(ms) {
  if (!calc.ehUtil) return 0;
  if (calc.tipo !== "trabalho") return calc.vDia; // férias, atestado e folga são pagos
  return calc.horasDia ? Math.min(1, ms / HORA / calc.horasDia) * calc.vDia : 0;
}

function desenharMinuto(agora) {
  const { horasDia, vDia, saldo, compensar, tipo, temEntrada } = calc;
  const trabalho = tipo === "trabalho";
  const desde = desdeMeiaNoite(agora);
  const ms = trabalhadoAgora(desde);

  poe($("hojeData"), fmtData(agora, T.locale, { weekday: "long", day: "numeric", month: "long" }));
  const selo = $("seloTipo");
  selo.hidden = trabalho;
  poe(selo, nomeTipo(tipo));

  poe($("pct"), trabalho && horasDia ? t().pctMeta(Math.floor((ms / HORA / horasDia) * 100)) : nomeTipo(tipo));
  poe($("info"), horasDia ? t().infoHora(grana(vDia / horasDia), H(horasDia * HORA)) : t().definaHoras);
  poe($("infoMes"), t().infoMes(calc.diasUteis, grana(vDia)));

  const saidaEl = $("saida");
  const info = $("infoSaida");
  if (!trabalho) {
    poe(saidaEl, "—");
    poeHtml(info, esc(t().hojeE(nomeTipo(tipo))));
  } else if (!temEntrada) {
    poe(saidaEl, "--:--");
    poeHtml(info, esc(t().preenchaChegada));
  } else {
    poe(saidaEl, hora(calc.saida, Math.ceil));
    if (calc.saldoComHoje !== null) {
      poeHtml(info, calc.saldoComHoje ? t().saldoComHoje(saldoHtml(calc.saldoComHoje)) : esc(t().semanaEmDia));
    } else if (!saldo) poeHtml(info, esc(t().semanaEmDia));
    else if (compensar) poeHtml(info, t().compensando(saldoHtml(saldo)));
    else poeHtml(info, t().saldoZerar(saldoHtml(saldo), hora(calc.zerar, Math.ceil)));
  }
  poe($("btnSaida"), calc.saiuTexto ? t().saiAs(horaTxt(calc.saiuTexto)) : t().registrarSaida);

  desenharLinha(desde, ms);
  desenharSemana(ms);
  desenharRitmo(agora, ms);
  document.title = trabalho && temEntrada ? `${H(ms)} · ${t().app}` : t().app;
  desenharFavicon(trabalho && horasDia ? ms / HORA / horasDia : 0);
}

const pct = (t, ini, fim) => `${(Math.min(1, Math.max(0, (t - ini) / (fim - ini))) * 100).toFixed(2)}%`;

// Linha do dia: da chegada até a hora de sair (ou até agora, se passou dela)
function desenharLinha(desde, ms) {
  const linha = $("linhaDia");
  const { reg, temEntrada, tipo } = calc;
  linha.hidden = !temEntrada || tipo !== "trabalho";
  if (linha.hidden) return;
  const ate = calc.saiu ?? desde;
  const ini = emMs(reg.entrada);
  const fim = Math.max(calc.saida, ate, ini + HORA);

  $("ldFeito").style.width = pct(ate, ini, fim);
  const almoco = $("ldAlmoco");
  const rotAlmoco = $("ldAlmocoRot");
  const temAlmoco = Boolean(reg.almoco) && emMs(reg.almoco) + reg.almocoHoras * HORA > ini;
  almoco.hidden = rotAlmoco.hidden = !temAlmoco;
  if (temAlmoco) {
    const a = Math.max(emMs(reg.almoco), ini);
    const b = emMs(reg.almoco) + reg.almocoHoras * HORA;
    almoco.style.left = pct(a, ini, fim);
    almoco.style.width = `calc(${pct(b, ini, fim)} - ${pct(a, ini, fim)})`;
    rotAlmoco.style.left = `calc((${pct(a, ini, fim)} + ${pct(b, ini, fim)}) / 2)`;
    // Rótulo do almoço só se couber longe das pontas
    const meio = ((a + b) / 2 - ini) / (fim - ini);
    rotAlmoco.hidden = meio < 0.18 || meio > 0.82;
    poe(rotAlmoco, t().almocoFaixa(horaTxt(reg.almoco), hora(b)));
  }
  $("ldSaida").style.left = pct(calc.saida, ini, fim);
  $("ldSaida").title = t().podeSairAs(hora(calc.saida, Math.ceil));
  const agora = $("ldAgora");
  agora.hidden = calc.saiu != null;
  agora.style.left = pct(ate, ini, fim);
  poe($("ldIni"), t().chegadaAs(horaTxt(reg.entrada)));
  poe($("ldFim"), calc.saiu != null ? t().saidaAs(horaTxt(calc.saiuTexto))
    : ate > calc.saida ? t().agoraSaldo(hora(ate), S(ms - calc.horasDia * HORA))
      : t().podeSair(hora(calc.saida, Math.ceil)));
}

// Os dias de trabalho desta semana (segunda a sexta, mais um fim de semana trocado
// para trabalho ou com registro), com o trabalhado de cada um
function desenharSemana(msHoje) {
  const { cal } = cfg();
  const inicio = inicioDaSemana(deChave(calc.k));
  const meta = calc.horasDia * HORA;
  const dias = Array.from({ length: 7 }, (_, i) => somaDias(inicio, i))
    .filter(d => !cal.fimDeSemana(d) || vivo(dados.registro[chaveDia(d)]));
  $("semanaDias").style.gridTemplateColumns = `repeat(${dias.length}, 1fr)`;
  const html = dias.map(d => {
    const k = chaveDia(d);
    const reg = vivo(dados.registro[k]);
    const tipo = tipoDe(reg);
    const feriado = !reg && feriadoNacional(d, cal);
    let ms = 0;
    let valor = k > calc.k ? "" : "—";
    if (feriado) valor = t().feriado;
    else if (tipo !== "trabalho") valor = nomeTipo(tipo);
    else if (k === calc.k && calc.temEntrada) valor = H((ms = msHoje));
    else if (fechado(reg)) valor = H((ms = trabalhadoDia(reg)));
    const classe = `dia-sem${k === calc.k ? " hoje" : ""}${ms ? "" : " fora"}`;
    const largura = meta ? Math.min(100, (ms / meta) * 100).toFixed(0) : 0;
    return `<div class="${classe}"><span class="d">${esc(nomeDoDia(d))}</span><b>${esc(valor) || "&nbsp;"}</b>`
      + `<span class="mini"><span style="width:${largura}%"></span></span></div>`;
  }).join("");
  poeHtml($("semanaDias"), html);
}

// Quanto cada dia que sobra precisa ter para fechar a semana, e onde o saldo
// do mês chega se o resto do mês seguir a média dos dias já fechados
function desenharRitmo(agora, msHoje) {
  const caixa = $("ritmo");
  caixa.hidden = !calc.horasDia;
  if (caixa.hidden) return;
  const r = ritmoSemana(dados.registro, agora, calc.horasDia, msHoje, cfg().cal);
  // Semana toda de férias ou feriado não tem meta: fica só o mês
  let texto = "";
  if (r.meta) {
    const resto = !r.falta ? t().ritmoCumprida
      : r.dias === 1 && r.comHoje ? t().ritmoHoje(H(r.falta))
        : r.dias === 1 ? t().ritmoUltimo(H(r.porDia))
          : r.dias ? t().ritmoVarios(H(r.porDia), r.dias, r.comHoje)
            : t().ritmoFaltaram(H(r.falta));
    texto = `${t().ritmoBase(H(r.feito), H(r.meta))} · ${resto}`;
  }
  poe($("ritmoSemana"), texto);

  const p = calc.projecao;
  const mes = $("ritmoMes");
  poeHtml(mes, t().ritmoMes(saldoHtml(p.saldo), previsao(p) ? saldoHtml(p.fim) : ""));
  mes.title = previsao(p) ? t().ritmoMesDica(S(p.media), p.base, p.restantes) : "";
}
// Com menos de três dias fechados a média ainda não diz nada
const previsao = p => p && p.base >= 3 && p.restantes > 0;

// Favicon com o anel de progresso do dia; troca em passos de 5%
let faviconPasso = -1;
function desenharFavicon(p) {
  const passo = Math.min(20, Math.floor(p * 20));
  if (passo === faviconPasso) return;
  faviconPasso = passo;
  const r = 12;
  const volta = 2 * Math.PI * r;
  // O fundo do ícone é sempre escuro: as cores são as do tema escuro
  const daltonismo = cfg().cores === "daltonismo";
  const cor = passo >= 20 ? (daltonismo ? "#56b4e9" : "#5cc58f") : (daltonismo ? "#cc79a7" : "#7eb0f5");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#121316"/>`
    + `<circle cx="16" cy="16" r="${r}" fill="none" stroke="#2c2f36" stroke-width="5"/>`
    + `<circle cx="16" cy="16" r="${r}" fill="none" stroke="${cor}" stroke-width="5" stroke-linecap="round" `
    + `stroke-dasharray="${((passo / 20) * volta).toFixed(1)} ${volta.toFixed(1)}" transform="rotate(-90 16 16)"/></svg>`;
  $("favicon").href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function desenharSegundo(agora) {
  if (tela !== "hoje" || document.hidden || !calc) return;
  const ms = trabalhadoAgora(desdeMeiaNoite(agora));
  const s = Math.floor(ms / 1000);
  poe($("tempo"), `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`);
  const ganho = ganhoHoje(ms);
  poe($("dinheiro"), grana(ganho));
  poe($("mes"), grana(calc.diasPassados * calc.vDia + ganho));
}

// Um tique por segundo, alinhado à virada do segundo; com a aba escondida,
// um por minuto (só título e favicon). A versão anterior rodava 10 por segundo.
let relogio;
function tique() {
  const agora = new Date();
  if (chaveDia(agora) !== calc.k) {
    preencherCampos();
    registrarHoje();
    recalcular();
  } else if (agora.getMinutes() !== calc.minuto) {
    recalcular();
  }
  desenharSegundo(agora);
}
function agendar() {
  clearTimeout(relogio);
  const periodo = document.hidden ? MINUTO : 1000;
  relogio = setTimeout(() => {
    tique();
    agendar();
  }, periodo - (Date.now() % periodo) + 5);
}
document.addEventListener("visibilitychange", () => {
  if (!pronto) return;
  if (!document.hidden) {
    tique();
    sincronizar();
  }
  agendar();
});

// ------------------------------------------------------------------ aviso de saída

let avisoTimer;
function armarAviso() {
  clearTimeout(avisoTimer);
  const ligado = cfg().alertas && "Notification" in window && Notification.permission === "granted";
  $("btnAviso").setAttribute("aria-pressed", String(ligado));
  if (!ligado || calc.tipo !== "trabalho" || !calc.temEntrada || calc.saiu != null) return;
  const marca = `${calc.k}:${msParaHhmm(calc.saida, Math.ceil)}`;
  if (local.ler("horas.avisado") === marca) return;
  const falta = calc.saida - desdeMeiaNoite(new Date());
  // Página aberta bem depois da hora: não faz sentido avisar
  if (falta < -2 * MINUTO) return;
  avisoTimer = setTimeout(() => {
    if (local.ler("horas.avisado") === marca) return; // outra aba já avisou
    local.gravar("horas.avisado", marca);
    const corpo = calc.compensar
      ? t().avisoCompensado(hora(calc.saida, Math.ceil))
      : t().avisoMeta(H(calc.horasDia * HORA));
    new Notification(t().avisoTitulo, { body: corpo, icon: "/icone.svg", tag: marca });
  }, Math.max(0, falta));
}

$("btnAviso").addEventListener("click", async () => {
  const ligar = $("btnAviso").getAttribute("aria-pressed") !== "true";
  if (ligar) {
    if (!("Notification" in window)) return toast(t().semNotificacao);
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission !== "granted") return toast(t().notificacaoBloqueada);
  }
  mudarCampos({ alertas: String(ligar) });
  armarAviso();
  toast(ligar && calc.saida != null ? t().avisoLigadoPara(hora(calc.saida, Math.ceil)) : ligar ? t().avisoLigado : t().avisoDesligado);
});

// ------------------------------------------------------------------ aviso na tela

let toastTimer;
function toast(texto, acao, duracao = 7000) {
  const t = $("aviso");
  t.replaceChildren(texto);
  if (acao) {
    const b = document.createElement("button");
    b.className = "botao";
    b.textContent = acao.rotulo;
    b.addEventListener("click", () => {
      t.hidden = true;
      acao.fazer();
    });
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), duracao);
}

// ------------------------------------------------------------------ ajustes

const CAMPOS_AJUSTES = ["horasSemana", "salario", "nome", "idioma", "tema", "cores", "moedaBolsa", "moeda"];
$("idioma").innerHTML = Object.entries(IDIOMAS).map(([k, n]) => `<option value="${k}" lang="${k}">${esc(n)}</option>`).join("");

// Moedas pelo nome, no idioma da tela
function opcoesAjustes() {
  const escolhidos = ["moedaBolsa", "moeda", "tipoHoje"].map(id => [id, $(id).value]);
  const nomeMoeda = new Intl.DisplayNames([T.locale], { type: "currency" });
  const moedas = ["BRL", "USD"].map(m => `<option value="${m}">${esc(nomeMoeda.of(m))} (${m})</option>`).join("");
  $("moedaBolsa").innerHTML = moedas;
  $("moeda").innerHTML = moedas;
  $("tipoHoje").innerHTML = opcoesTipo();
  for (const [id, valor] of escolhidos) if (valor) $(id).value = valor;
}

// "1 BRL = 0,199 USD · cotação de 22/10", e de onde vem (os termos do serviço
// grátis pedem o link). Some quando não há conversão
function descreverCambio() {
  const c = cfg();
  const nota = $("cambioInfo");
  if (c.moedaBolsa === c.moedaPedida) return void nota.replaceChildren();
  if (c.moeda !== c.moedaPedida) return void nota.replaceChildren(t().semCotacao(c.moedaBolsa));
  const taxa = new Intl.NumberFormat(`${T.locale}-u-nu-latn`, { maximumSignificantDigits: 4 }).format(c.taxa);
  const fonte = document.createElement("a");
  fonte.href = "https://www.exchangerate-api.com";
  fonte.target = "_blank";
  fonte.rel = "noopener";
  fonte.textContent = "Rates By Exchange Rate API";
  nota.replaceChildren(t().cotacao(c.moedaBolsa, c.moedaPedida, taxa, dm(new Date(`${cambio.data}T12:00`))), " ", fonte);
}

$("btnAjustes").addEventListener("click", () => {
  const c = { ...PADRAO, ...dados.campos, idioma: T.codigo, moedaBolsa: cfg().moedaBolsa, moeda: cfg().moedaPedida };
  for (const id of CAMPOS_AJUSTES) $(id).value = c[id];
  descreverCambio();
  desenharExtras();
  $("ajustes").showModal();
  listarBackups();
});
for (const id of CAMPOS_AJUSTES) {
  $(id).addEventListener("input", () => {
    const mudancas = { [id]: $(id).value };
    if (id === "salario" && dados.campos.salario != null) {
      mudancas.bolsasAte = fecharBolsa(dados.campos.bolsasAte, dados.campos.salario, new Date());
    }
    mudarCampos(mudancas);
    if (id === "horasSemana") registrarHoje();
    if (id === "moedaBolsa" || id === "moeda") {
      $("moeda").value = cfg().moedaPedida; // "Mostrar em" vazio segue a moeda da bolsa
      descreverCambio();
    }
    aoMudarDeFora();
    aplicarTema();
    recalcular();
    desenharSegundo(new Date());
  });
}

// ------------------------------------------------------------------ feriados extras

// Uma linha por feriado extra; "todo ano" guarda só o mês e o dia
function linhaExtra(e = { data: "", nome: "", tipo: "feriado" }) {
  const todoAno = e.data.length === 5;
  const valor = todoAno ? `${new Date().getFullYear()}-${e.data}` : e.data;
  const opcao = (v, rotulo) => `<option value="${v}"${e.tipo === v ? " selected" : ""}>${esc(rotulo)}</option>`;
  const x = t();
  return `<div class="extra">`
    + `<input type="date" data-x="data" value="${esc(valor)}" aria-label="${esc(x.data)}">`
    + `<label><input type="checkbox" data-x="todoAno"${todoAno ? " checked" : ""}> ${esc(x.todoAno)}</label>`
    + `<span class="quebra"></span>`
    + `<input type="text" data-x="nome" value="${esc(e.nome)}" placeholder="${esc(x.nome)}" aria-label="${esc(x.nome)}" autocomplete="off">`
    + `<select data-x="tipo" aria-label="${esc(x.tipo)}">${opcao("feriado", x.feriado)}${opcao("util", x.diaDeTrabalho)}</select>`
    + `<button type="button" class="x" data-x="tirar" aria-label="${esc(x.tirar)}" title="${esc(x.tirar)}">×</button></div>`;
}

function desenharExtras() {
  const lista = lerExtras(dados.campos.feriadosExtras ?? "[]");
  $("extras").innerHTML = lista.map(linhaExtra).join("");
}

// Linha sem data ainda não vale: fica na tela até ter
function guardarExtras() {
  const lista = [...$("extras").querySelectorAll(".extra")].map(linha => {
    const campo = x => linha.querySelector(`[data-x="${x}"]`);
    const data = campo("data").value;
    if (!data) return null;
    return { data: campo("todoAno").checked ? data.slice(5) : data, nome: campo("nome").value.trim(), tipo: campo("tipo").value };
  }).filter(Boolean);
  mudarCampos({ feriadosExtras: JSON.stringify(lista) });
  registrarHoje();
  aoMudarDeFora();
}
$("extras").addEventListener("input", guardarExtras);
$("extras").addEventListener("click", e => {
  if (!e.target.closest('[data-x="tirar"]')) return;
  e.target.closest(".extra").remove();
  guardarExtras();
});
$("btnExtra").addEventListener("click", () => {
  $("extras").insertAdjacentHTML("beforeend", linhaExtra());
  $("extras").lastElementChild.querySelector("input").focus();
});


// ------------------------------------------------------------------ backups

const nomeDia = k => nomeDoDia(deChave(k));
let backupEscolhido = null;

function limparBackup(texto = "") {
  backupEscolhido = null;
  $("btnRestaurar").disabled = true;
  poe($("backupInfo"), texto);
}

async function listarBackups() {
  const sel = $("backupData");
  limparBackup();
  try {
    const r = await fetch("/dados/backups", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const datas = await r.json();
    sel.innerHTML = `<option value="">${esc(t().escolhaDia)}</option>`
      + datas.map(k => `<option value="${esc(k)}">${esc(nomeDia(k))}</option>`).join("");
    sel.disabled = !datas.length;
    if (!datas.length) limparBackup(t().semBackups);
  } catch {
    sel.replaceChildren();
    sel.disabled = true;
    limparBackup(t().backupSemServidor);
  }
}

// Antes de restaurar, mostra quais dias voltariam
$("backupData").addEventListener("change", async e => {
  const k = e.target.value;
  limparBackup();
  if (!k) return;
  try {
    const r = await fetch(`/dados/backups/${k}`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const copia = await r.json();
    if (e.target.value !== k) return; // trocou de dia enquanto lia
    const { mudados } = restaurar(dados, copia);
    if (!mudados.length) return limparBackup(t().backupIgual);
    const lista = mudados.length > 6 ? t().eMais(mudados.slice(0, 5).map(nomeDia).join(", "), mudados.length - 5)
      : mudados.map(nomeDia).join(", ");
    backupEscolhido = { k, copia };
    $("btnRestaurar").disabled = false;
    poe($("backupInfo"), t().voltam(lista, mudados.length));
  } catch {
    limparBackup(t().backupIlegivel);
  }
});

$("btnRestaurar").addEventListener("click", () => {
  if (!backupEscolhido) return;
  const { k, copia } = backupEscolhido;
  const antes = dados;
  const { dados: novos, mudados } = restaurar(dados, copia);
  dados = novos;
  salvar();
  $("ajustes").close();
  aoMudarDeFora();
  toast(t().restaurado(nomeDia(k), mudados.length), {
    rotulo: t().desfazer,
    fazer: () => {
      dados = restaurar(dados, antes).dados;
      salvar();
      aoMudarDeFora();
    },
  }, 15000);
});

// ------------------------------------------------------------------ histórico

const primeiroDoMes = d => new Date(d.getFullYear(), d.getMonth(), 1);
let mesVisto = primeiroDoMes(new Date());

function selectTipo(tipo, rotulo, bloqueado) {
  return `<select data-campo="tipo" aria-label="${esc(t().tipoDe(rotulo))}"${bloqueado ? " disabled" : ""}>`
    + Object.keys(TIPOS).map(v => `<option value="${v}"${v === tipo ? " selected" : ""}>${esc(nomeTipo(v))}</option>`).join("")
    + "</select>";
}

function campoHist(campo, tipo, valor, bloqueado, rotulo, invalido = false) {
  const extra = tipo === "text" ? ` autocomplete="off" spellcheck="false" title="${esc(t().exemploDuracao)}"` : "";
  return `<td><input type="${tipo}" data-campo="${campo}" value="${esc(valor)}" aria-label="${esc(rotulo)}"${extra}`
    + `${invalido ? ' aria-invalid="true"' : ""}${bloqueado ? " disabled" : ""}></td>`;
}

function linhaSemana(segunda, metaPadrao, hoje) {
  const sexta = somaDias(segunda, 4);
  const { ms, meta, saldo } = semana(segunda, dados.registro, metaPadrao, chaveDia(somaDias(deChave(hoje), 1)));
  const tot = meta ? t().semanaTotal(H(ms), H(meta), saldoHtml(saldo))
    : chaveDia(segunda) > hoje ? "" : `<span class="apagado">${esc(t().nenhumDiaFechado)}</span>`;
  return `<tr class="semana"><td colspan="10"><div class="semanaLinha"><span>${esc(t().semanaDeA(dm(segunda), dm(sexta)))}</span><span>${tot}</span></div></td></tr>`;
}

function linhaDia({ k, reg, feriado }, hoje, agora, c) {
  const data = deChave(k);
  const nome = nomeDoDia(data);
  const futuro = k > hoje;
  if (feriado) {
    return `<tr data-dia="${k}" class="feriado"><th scope="row">${esc(nome)}</th><td colspan="9" class="apagado">${esc(t().feriadoNome(feriado))}</td></tr>`;
  }
  const tipo = tipoDe(reg);
  const r = reg ?? { almocoHoras: c.almocoHoras };
  const trabalho = tipo === "trabalho";
  const vDia = util(data, dados.registro, c.cal) ? valorDia(data, c.bolsa(data), dados.registro, c.cal) : 0;
  let trab = "";
  let porHora = "";
  if (!trabalho) trab = '<span class="apagado">—</span>';
  else if (futuro) trab = "";
  else if (!reg || (!reg.entrada && !reg.saida)) trab = `<span class="apagado">${esc(t().semRegistro)}</span>`;
  else if (saidaAntes(reg)) trab = `<span class="neg">${esc(t().saidaAntesChegada)}</span>`;
  else if (fechado(reg)) {
    const ms = trabalhadoDia(reg);
    trab = H(ms);
    if (vDia && ms) porHora = grana(vDia / (ms / HORA));
  } else if (k === hoje && reg.entrada) {
    trab = `<span class="ate-agora">${H(trabalhadoMs(reg, desdeMeiaNoite(agora)))}</span> <span class="apagado">${esc(t().ateAgora)}</span>`;
  } else trab = `<span class="apagado">${esc(t().semSaida)}</span>`;
  const valeu = vDia && !futuro ? `<span class="num">${grana(vDia)}</span>` : '<span class="apagado">—</span>';
  // Horários só fazem sentido em dia de trabalho que já chegou
  const bloqueado = futuro || !trabalho;
  const classe = k === hoje ? "hoje" : futuro ? "futuro" : reg ? "" : "vazio";
  const x = t();
  return `<tr data-dia="${k}" class="${classe}"><th scope="row">${esc(nome)}</th>`
    + `<td>${selectTipo(tipo, nome, false)}</td>`
    + campoHist("entrada", "time", r.entrada, bloqueado, x.chegadaEm(nome))
    + campoHist("almoco", "time", r.almoco, bloqueado, x.almocoEm(nome))
    + campoHist("almocoHoras", "text", duracao(r.almocoHoras), bloqueado, x.duracaoAlmocoEm(nome))
    + campoHist("saida", "time", r.saida, bloqueado, x.saidaEm(nome), saidaAntes(reg))
    + `<td class="trab">${trab}</td><td>${valeu}</td><td>${porHora}</td>`
    + `<td class="acao">${reg ? `<button class="x" data-apagar aria-label="${esc(x.apagarRegistro(nome))}" title="${esc(x.apagar)}">×</button>` : ""}</td></tr>`;
}

function renderHistorico() {
  const ano = mesVisto.getFullYear();
  const mes = mesVisto.getMonth();
  const agora = new Date();
  const hoje = chaveDia(agora);
  const c = cfg();
  const { cal } = c;
  const metaPadrao = c.metaDia;
  const primeiro = deChave(inicio(dados.registro, agora));
  poe($("colPorHora"), t().colPorHora(simboloMoeda(c.moeda, T.locale)));
  const titulo = fmtData(mesVisto, T.locale, { month: "long", year: "numeric" });
  $("tituloMes").textContent = titulo[0].toUpperCase() + titulo.slice(1);
  $("mesAnterior").disabled = mesVisto <= primeiroDoMes(primeiro);
  // Até um ano à frente, para marcar férias
  $("mesSeguinte").disabled = mesVisto >= new Date(agora.getFullYear() + 1, agora.getMonth(), 1);

  // Editar uma linha redesenha a tabela: guarda onde estava o foco para voltar nele
  const foco = document.activeElement;
  const alvo = !$("linhas").contains(foco) ? null
    : foco.dataset.campo ? `[data-campo="${foco.dataset.campo}"]` : foco.matches("[data-apagar]") ? "[data-apagar]" : null;
  const voltar = alvo && `tr[data-dia="${foco.closest("tr").dataset.dia}"] ${alvo}`;

  let html = "";
  let semanaAtual = "";
  for (const dia of diasDoMes(ano, mes, dados.registro, agora, cal)) {
    const seg = chaveDia(inicioDaSemana(deChave(dia.k)));
    if (seg !== semanaAtual) {
      semanaAtual = seg;
      html += linhaSemana(deChave(seg), metaPadrao, hoje);
    }
    html += linhaDia(dia, hoje, agora, c);
  }
  $("linhas").innerHTML = html || `<tr><td colspan="10" class="apagado">${esc(t().nadaNoMes)}</td></tr>`;
  if (voltar) $("linhas").querySelector(voltar)?.focus();

  const tot = totaisDoMes(linhasDoMes(ano, mes, dados.registro, metaPadrao, agora, cal));
  const saldo = semana(inicioDaSemana(agora), dados.registro, metaPadrao, hoje).saldo;
  let uteis = 0;
  for (let d = new Date(ano, mes, 1); d.getMonth() === mes && d <= agora; d = somaDias(d, 1)) {
    if (d >= primeiro && util(d, dados.registro, cal)) uteis++;
  }
  const partes = [
    t().resumoMes(H(tot.trabalhado), H(tot.meta), saldoHtml(tot.saldo)),
    t().resumoValeram(uteis, `<span class="num">${grana(uteis * valorDia(mesVisto, c.bolsa(mesVisto), dados.registro, cal))}</span>`),
  ];
  if (ano === agora.getFullYear() && mes === agora.getMonth()) {
    partes.push(t().resumoSemana(saldoHtml(saldo)));
    if (previsao(calc?.projecao)) partes.push(t().resumoFecha(saldoHtml(calc.projecao.fim)));
  }
  poeHtml($("resumo"), partes.join(" · "));
}

// O "até agora" de hoje anda sozinho; o resto da tabela não muda com o tempo
function atualizarHojeNoHistorico(agora) {
  const celula = $("linhas").querySelector(`tr[data-dia="${calc.k}"] .ate-agora`);
  const reg = vivo(dados.registro[calc.k]);
  if (celula && reg?.entrada) poe(celula, H(trabalhadoMs(reg, desdeMeiaNoite(agora))));
}

$("linhas").addEventListener("change", e => {
  const campo = e.target.dataset.campo;
  if (!campo) return;
  const k = e.target.closest("tr").dataset.dia;
  let valor = e.target.value;
  if (campo === "almocoHoras") {
    valor = lerDuracao(valor);
    // Não grava o que não entendeu: o campo fica vermelho até corrigir
    e.target.setAttribute("aria-invalid", String(valor == null));
    if (valor == null) return;
  }
  mudarDia(k, { [campo]: valor });
  if (k === chaveDia(new Date())) {
    preencherCampos();
    recalcular();
  }
  // O Chrome dispara change a cada dígito do time: redesenhar agora joga o
  // cursor de volta para a hora (1210 virava 00:01). Espera sair do campo.
  if (e.target.type === "time") redesenharAoSair = true;
  // Nos outros o change vem no Tab, antes de o foco chegar no próximo campo
  else setTimeout(renderHistorico);
});

let redesenharAoSair = false;
$("linhas").addEventListener("focusout", () => {
  if (!redesenharAoSair) return;
  redesenharAoSair = false;
  // Depois do foco chegar no próximo campo, para o renderHistorico devolvê-lo
  setTimeout(renderHistorico);
});

$("linhas").addEventListener("click", e => {
  const botao = e.target.closest("[data-apagar]");
  if (!botao) return;
  const k = botao.closest("tr").dataset.dia;
  const antes = { ...dados.registro[k] };
  apagarDia(k);
  aoMudarDeFora();
  toast(t().registroApagado(dm(deChave(k))), {
    rotulo: t().desfazer,
    fazer: () => {
      mudarDia(k, antes);
      aoMudarDeFora();
    },
  });
});

$("mesAnterior").addEventListener("click", () => {
  mesVisto = new Date(mesVisto.getFullYear(), mesVisto.getMonth() - 1, 1);
  renderHistorico();
});
$("mesSeguinte").addEventListener("click", () => {
  mesVisto = new Date(mesVisto.getFullYear(), mesVisto.getMonth() + 1, 1);
  renderHistorico();
});

// ------------------------------------------------------------------ relatório e CSV

function montarRelatorio() {
  const ano = mesVisto.getFullYear();
  const mes = mesVisto.getMonth();
  const c = cfg();
  const linhas = linhasDoMes(ano, mes, dados.registro, c.metaDia, new Date(), c.cal);
  const tot = totaisDoMes(linhas);
  const x = t();
  const titulo = fmtData(mesVisto, T.locale, { month: "long", year: "numeric" });
  const corpo = linhas.map(l => {
    const d = deChave(l.k);
    const almoco = l.almoco ? `${horaTxt(l.almoco)}–${hora(emMs(l.almoco) + l.almocoHoras * HORA)}` : "";
    const fora = l.tipo !== "trabalho" ? ' class="fora"' : "";
    return `<tr${fora}><td>${dm(d)}</td><td>${esc(diaSem(d))}</td><td>${esc(l.feriado ?? nomeTipo(l.tipo))}</td>`
      + `<td>${horaTxt(l.entrada)}</td><td>${almoco}</td><td>${horaTxt(l.saida)}</td><td>${l.trabalhado != null ? H(l.trabalhado) : ""}</td></tr>`;
  }).join("");
  const outros = Object.entries(tot.porTipo).map(([tipo, n]) => x.relTipo(nomeTipo(tipo), n));
  $("relatorio").innerHTML = `
    <h1>${esc(x.relTitulo(titulo))}</h1>
    <p class="cab">${c.nome ? `${esc(c.nome)} · ` : ""}${esc(x.relCab(c.horasSemana, dinheiro(c.bolsa(mesVisto) * c.taxa, c.moeda, T.locale)))}</p>
    <table>
      <thead><tr>${x.relColunas.map(n => `<th>${esc(n)}</th>`).join("")}</tr></thead>
      <tbody>${corpo}</tbody>
    </table>
    <p class="totais">${[x.relTotais(H(tot.trabalhado), H(tot.meta), S(tot.saldo), tot.diasTrabalhados), ...outros].join(" · ")}</p>
    <div class="assinaturas"><div>${esc(x.bolsista)}</div><div>${esc(x.orientador)}</div></div>
    <p class="gerado">${esc(x.geradoEm(fmtData(new Date(), T.locale, {})))}</p>`;
}
addEventListener("beforeprint", montarRelatorio);
$("btnRelatorio").addEventListener("click", () => {
  montarRelatorio();
  print();
});

$("btnCsv").addEventListener("click", () => {
  const ano = mesVisto.getFullYear();
  const mes = mesVisto.getMonth();
  const c = cfg();
  const csv = csvDoMes(linhasDoMes(ano, mes, dados.registro, c.metaDia, new Date(), c.cal),
    { ...T.csv, diaSemana: k => diaSem(deChave(k)), tipo: nomeTipo });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `horas-${ano}-${pad(mes + 1)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ------------------------------------------------------------------ estatísticas

let periodo = 12;
for (const chip of document.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => {
    periodo = Number(chip.dataset.semanas);
    for (const c of document.querySelectorAll(".chip")) c.setAttribute("aria-pressed", String(c === chip));
    renderEstatisticas();
  });
}

function renderEstatisticas() {
  const agora = new Date();
  const c = cfg();
  const { cal } = c;
  const metaPadrao = c.metaDia;
  const primeiro = deChave(inicio(dados.registro, agora));
  // Semanas antes do primeiro registro só achatariam os gráficos
  const desdeInicio = Math.max(1, Math.round((inicioDaSemana(agora) - inicioDaSemana(primeiro)) / (7 * 24 * HORA)) + 1);
  const n = periodo ? Math.min(periodo, desdeInicio) : desdeInicio;
  poe($("periodoNota"), periodo > desdeInicio ? t().registrosComecam(dm(primeiro)) : "");
  const semanas = semanasAte(agora, n, dados.registro, metaPadrao);
  const de = chaveDia(semanas[0].segunda);
  const r = resumoPeriodo(dados.registro, de, agora, c.bolsa, metaPadrao, cal);

  const x = t();
  const kpi = (rotulo, valor, sub) => `<div class="card kpi"><span class="rotulo">${rotulo}</span><strong>${valor}</strong><span>${sub}</span></div>`;
  const ou = (v, f) => (v == null ? "—" : f(v));
  poeHtml($("kpis"), [
    kpi(x.mediaDia, ou(r.mediaDia, H), x.diasFechados(r.dias)),
    kpi(x.chegadaMedia, ou(r.chegada, hora), x.nosDiasFechados),
    kpi(x.saidaMedia, ou(r.saida, hora), x.nosDiasFechados),
    kpi(x.saldoPeriodo, saldoHtml(r.saldo), r.saldo < 0 ? x.horasDevendo : x.horasSobrando),
    kpi(x.valorHora, ou(r.porHora, grana), x.bolsaPorHora),
  ].join(""));

  const dias = diasFechados(dados.registro, de, chaveDia(agora));
  larguraDesenhada = Math.round($("telaEstatisticas").getBoundingClientRect().width);
  desenharGraficos({ T, t, H, S, hora, dm, nomeDoDia }, semanas, dias, r);
}

// Reaproveita o desenho ao mudar o tamanho da janela, sem pular de layout
let redesenho;
let larguraDesenhada = 0;
new ResizeObserver(([e]) => {
  const largura = Math.round(e.contentRect.width);
  if (tela !== "estatisticas" || !largura || largura === larguraDesenhada) return;
  clearTimeout(redesenho);
  redesenho = setTimeout(renderEstatisticas, 120);
}).observe($("telaEstatisticas"));

// "Ver tabela": cada gráfico tem a mesma informação em tabela
for (const botao of document.querySelectorAll("[data-tabela]")) {
  botao.addEventListener("click", () => {
    const fig = botao.closest("figure");
    const mostrarTabela = !fig.classList.contains("em-tabela");
    fig.classList.toggle("em-tabela", mostrarTabela);
    botao.textContent = mostrarTabela ? t().verGrafico : t().verTabela;
    fig.querySelector(".area").hidden = mostrarTabela;
    fig.querySelector(".tabela-graf").hidden = !mostrarTabela;
  });
}

// ------------------------------------------------------------------ início

function prepararTela() {
  pronto = true;
  aplicarTema();
  preencherCampos();
  registrarHoje();
  recalcular();
  mostrar(location.hash.slice(1));
  agendar();
  mostrarEstado();
}

async function iniciar() {
  // O idioma da última visita já vem antes da tela (o português está junto)
  T = await carregarIdioma(local.ler("horas.idioma") ?? "pt");
  traduzirPagina();
  // Com cópia no navegador a tela sai na hora; sem ela (primeira visita),
  // espera o arquivo para não mostrar números inventados
  if (dados) prepararTela();
  await sincronizar(await primeiraBusca);
  if (!dados) dados = { campos: {}, camposAtualizado: 0, registro: {} };
  // Primeira visita: o idioma vem do navegador e fica gravado
  if (dados.campos.idioma === undefined) mudarCampos({ idioma: idiomaDoNavegador() });
  if (cfg().idioma !== T.codigo) {
    T = await carregarIdioma(cfg().idioma);
    local.gravar("horas.idioma", T.codigo);
    traduzirPagina();
  }
  if (!pronto) prepararTela();
  else aoMudarDeFora();
  buscarCambio();
  setInterval(buscarCambio, 6 * 3600 * 1000);
}
iniciar();

// Guarda a página para abrir mesmo com o servidor desligado. Registrado depois
// do load para não disputar a primeira carga.
if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
