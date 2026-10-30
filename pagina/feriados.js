// Feriados nacionais do Brasil, sem DOM: datas fixas e as que dependem da
// Páscoa. As regras seguem a lei atual: anos antigos podem ter tido outras datas.

const pad = n => String(n).padStart(2, "0");
const chave = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mais = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dia = (ano, mes, d) => new Date(ano, mes - 1, d);

export function pascoa(ano) {
  // Algoritmo de Meeus
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const d2 = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes, d2);
}

const N = (pt, en) => ({ pt, en });
export const NOMES = {
  confraternizacao: N("Confraternização Universal", "New Year's Day"),
  carnaval: N("Carnaval", "Carnival"),
  sextaSanta: N("Sexta-feira Santa", "Good Friday"),
  corpusChristi: N("Corpus Christi", "Corpus Christi"),
  tiradentes: N("Tiradentes", "Tiradentes' Day"),
  trabalho: N("Dia do Trabalho", "Labour Day"),
  independencia: N("Independência", "Independence Day"),
  aparecida: N("Nossa Senhora Aparecida", "Our Lady of Aparecida"),
  finados: N("Finados", "All Souls' Day"),
  republica: N("Proclamação da República", "Republic Day"),
  conscienciaNegra: N("Consciência Negra", "Black Consciousness Day"),
  natal: N("Natal", "Christmas Day"),
};

const fixo = (mes, d) => ano => dia(ano, mes, d);
const pascoaMais = n => ano => mais(pascoa(ano), n);

const REGRAS = [
  ["confraternizacao", fixo(1, 1)], ["tiradentes", fixo(4, 21)], ["trabalho", fixo(5, 1)],
  ["independencia", fixo(9, 7)], ["aparecida", fixo(10, 12)], ["finados", fixo(11, 2)],
  ["republica", fixo(11, 15)], ["conscienciaNegra", fixo(11, 20)], ["natal", fixo(12, 25)],
  // Carnaval e Corpus Christi são ponto facultativo, mas a universidade costuma parar
  ["carnaval", pascoaMais(-48)], ["carnaval", pascoaMais(-47)], ["sextaSanta", pascoaMais(-2)],
  ["corpusChristi", pascoaMais(60)],
];

// Feriados de um ano: Map de "AAAA-MM-DD" para a lista de ids. Dois no mesmo
// dia (Sexta-feira Santa num 21/04) saem os dois.
const porAno = new Map();
export function feriadosDoAno(ano) {
  if (!porAno.has(ano)) {
    const mapa = new Map();
    for (const [id, data] of REGRAS) {
      const k = chave(data(ano));
      mapa.set(k, [...(mapa.get(k) ?? []), id]);
    }
    porAno.set(ano, mapa);
  }
  return porAno.get(ano);
}

export const nomeDoFeriado = (ids, idioma = "pt") => ids.map(id => NOMES[id][idioma] ?? NOMES[id].pt).join(" · ");

// O calendário de quem usa o app: feriados nacionais + feriados extras. Extras são
// { data: "MM-DD" (todo ano) ou "AAAA-MM-DD", nome, tipo: "feriado" | "util" };
// "util" faz o dia ser de trabalho mesmo em fim de semana ou feriado.
const FIM_DE_SEMANA = new Set([0, 6]);
export function calendario({ extras = [], idioma = "pt", semNome = "Feriado" } = {}) {
  const extra = k => extras.find(e => e.data === k) ?? extras.find(e => e.data === k.slice(5));
  // O histórico pergunta o mesmo dia muitas vezes (cada linha refaz os dias
  // úteis do mês): a resposta de cada dia fica guardada
  const feriados = new Map();
  const cal = {
    // Nome do feriado do dia, ou undefined
    feriado(d) {
      const k = chave(d);
      if (!feriados.has(k)) {
        const e = extra(k);
        const ids = feriadosDoAno(d.getFullYear()).get(k);
        feriados.set(k, e ? (e.tipo === "feriado" ? e.nome || semNome : undefined) : ids && nomeDoFeriado(ids, idioma));
      }
      return feriados.get(k);
    },
    // Fim de semana de verdade: sábado e domingo, menos os extras do tipo "util"
    fimDeSemana(d) {
      const e = extra(chave(d));
      return FIM_DE_SEMANA.has(d.getDay()) && (!e || e.tipo === "feriado");
    },
    folga: d => cal.fimDeSemana(d) || Boolean(cal.feriado(d)),
  };
  return cal;
}
