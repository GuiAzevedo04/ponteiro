// Feriados por país, sem DOM. Cada país tem regras que valem para qualquer
// ano (data fixa, Páscoa, n-ésimo dia da semana, calendário lunar ou hijri) e,
// onde o governo decide ano a ano (China, Rússia) ou a data vem da observação
// da lua (Índia, Bangladesh), tabelas oficiais em feriados-tabelas.js, que
// também traz o calendário lunar chinês de 2000 a 2100.
// As regras seguem a lei atual: anos antigos podem ter tido outras datas.
import { TABELAS } from "./feriados-tabelas.js";

const pad = n => String(n).padStart(2, "0");
const chave = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mais = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dia = (ano, mes, d) => new Date(ano, mes - 1, d);
const deChaveLocal = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };

// ------------------------------------------------------------------ datas móveis

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

// Páscoa ortodoxa (e copta): Meeus no calendário juliano, mais os 13 dias de
// diferença para o gregoriano, que valem de 1900 a 2099
export function pascoaOrtodoxa(ano) {
  const a = ano % 4, b = ano % 7, c = ano % 19;
  const d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
  const mes = Math.floor((d + e + 114) / 31);
  return dia(ano, mes, ((d + e + 114) % 31) + 1 + 13);
}

// n-ésimo `diaSemana` (0 = domingo) do mês; n = -1 é o último
function enesimo(ano, mes, diaSemana, n) {
  if (n > 0) {
    const primeiro = dia(ano, mes, 1);
    return mais(primeiro, ((diaSemana - primeiro.getDay() + 7) % 7) + 7 * (n - 1));
  }
  const ultimo = dia(ano, mes + 1, 0);
  return mais(ultimo, -((ultimo.getDay() - diaSemana + 7) % 7));
}

// Equinócios do Japão (fórmula do Observatório Nacional, válida de 1980 a 2099)
const equinocio = (ano, base) => Math.floor(base + 0.242194 * (ano - 1980) - Math.floor((ano - 1980) / 4));

// Calendário hijri Umm al-Qura pelo Intl: para cada dia do ano gregoriano, o
// mês e o dia hijri. Feito uma vez por ano. O Umm al-Qura é uma tabela
// oficial, igual em todo navegador.
const hijriDoAno = new Map();
function hijri(ano, mes, d) {
  if (!hijriDoAno.has(ano)) {
    const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { month: "numeric", day: "numeric", timeZone: "UTC" });
    const mapa = new Map();
    for (let x = dia(ano, 1, 1); x.getFullYear() === ano; x = mais(x, 1)) {
      const md = fmt.format(Date.UTC(ano, x.getMonth(), x.getDate(), 12));
      // Um mês/dia hijri pode cair duas vezes no mesmo ano (o ano hijri tem 354 dias)
      mapa.set(md, [...(mapa.get(md) ?? []), x]);
    }
    hijriDoAno.set(ano, mapa);
  }
  return hijriDoAno.get(ano).get(`${mes}/${d}`) ?? [];
}

// Datas do calendário lunar chinês (e o Qingming, termo solar) pela tabela.
// Fora de 2000 a 2100 não há data.
const QUAL = { anoNovo: 0, qingming: 1, barcoDragao: 2, meioOutono: 3 };
const chines = (ano, festa) => {
  const k = TABELAS.chines[ano]?.[QUAL[festa]];
  return k ? [deChaveLocal(k)] : [];
};

// ------------------------------------------------------------------ nomes

// Nome de cada feriado em português e inglês; os outros idiomas usam o inglês
// quando não têm tradução (idiomas/*.js podem completar por id)
const N = (pt, en) => ({ pt, en });
export const NOMES = {
  anoNovo: N("Ano Novo", "New Year's Day"),
  confraternizacao: N("Confraternização Universal", "New Year's Day"),
  carnaval: N("Carnaval", "Carnival"),
  sextaSanta: N("Sexta-feira Santa", "Good Friday"),
  pascoa: N("Páscoa", "Easter Sunday"),
  segundaPascoa: N("Segunda-feira de Páscoa", "Easter Monday"),
  ascensao: N("Ascensão", "Ascension Day"),
  pentecostes: N("Segunda-feira de Pentecostes", "Whit Monday"),
  corpusChristi: N("Corpus Christi", "Corpus Christi"),
  tiradentes: N("Tiradentes", "Tiradentes' Day"),
  trabalho: N("Dia do Trabalho", "Labour Day"),
  independenciaBR: N("Independência", "Independence Day"),
  aparecida: N("Nossa Senhora Aparecida", "Our Lady of Aparecida"),
  finados: N("Finados", "All Souls' Day"),
  republicaBR: N("Proclamação da República", "Republic Day"),
  conscienciaNegra: N("Consciência Negra", "Black Consciousness Day"),
  natal: N("Natal", "Christmas Day"),
  // Estados Unidos
  mlk: N("Dia de Martin Luther King Jr.", "Martin Luther King Jr. Day"),
  washington: N("Aniversário de Washington", "Washington's Birthday"),
  memorial: N("Memorial Day", "Memorial Day"),
  juneteenth: N("Juneteenth", "Juneteenth National Independence Day"),
  independenciaUS: N("Independência", "Independence Day"),
  laborUS: N("Dia do Trabalho", "Labor Day"),
  colombo: N("Dia de Colombo", "Columbus Day"),
  veteranos: N("Dia dos Veteranos", "Veterans Day"),
  acaoDeGracas: N("Ação de Graças", "Thanksgiving Day"),
  // México
  constituicaoMX: N("Dia da Constituição", "Constitution Day"),
  juarez: N("Natalício de Benito Juárez", "Benito Juárez's birthday"),
  independenciaMX: N("Independência", "Independence Day"),
  revolucaoMX: N("Dia da Revolução", "Revolution Day"),
  posseMX: N("Posse presidencial", "Change of Federal Government"),
  // França
  vitoria1945: N("Dia da Vitória", "Victory Day"),
  bastilha: N("Festa Nacional", "National Day"),
  assuncao: N("Assunção", "Assumption Day"),
  todosOsSantos: N("Todos os Santos", "All Saints' Day"),
  armisticio: N("Armistício", "Armistice Day"),
  // Portugal
  liberdade: N("Dia da Liberdade", "Freedom Day"),
  diaDePortugal: N("Dia de Portugal", "Day of Portugal"),
  republicaPT: N("Implantação da República", "Republic Day"),
  restauracao: N("Restauração da Independência", "Restoration of Independence Day"),
  imaculada: N("Imaculada Conceição", "Immaculate Conception"),
  // Rússia
  anoNovoRU: N("Feriados de Ano Novo", "New Year Holidays"),
  natalOrtodoxo: N("Natal ortodoxo", "Orthodox Christmas Day"),
  defensor: N("Dia do Defensor da Pátria", "Defender of the Fatherland Day"),
  mulher: N("Dia Internacional da Mulher", "International Women's Day"),
  primavera: N("Festa da Primavera e do Trabalho", "Holiday of Spring and Labor"),
  vitoriaRU: N("Dia da Vitória", "Victory Day"),
  russia: N("Dia da Rússia", "Russia Day"),
  unidade: N("Dia da Unidade Nacional", "Unity Day"),
  // China
  vesperaAnoNovoChines: N("Véspera do Ano Novo Chinês", "Chinese New Year's Eve"),
  anoNovoChines: N("Ano Novo Chinês", "Chinese New Year (Spring Festival)"),
  qingming: N("Qingming", "Tomb-Sweeping Day"),
  barcoDragao: N("Festival do Barco-Dragão", "Dragon Boat Festival"),
  meioOutono: N("Festival do Meio do Outono", "Mid-Autumn Festival"),
  nacionalCN: N("Dia Nacional", "National Day"),
  // Japão
  maioridade: N("Dia da Maioridade", "Coming of Age Day"),
  fundacao: N("Dia da Fundação Nacional", "Foundation Day"),
  imperador: N("Aniversário do Imperador", "Emperor's Birthday"),
  equinocioPrimavera: N("Equinócio da primavera", "Vernal Equinox Day"),
  showa: N("Dia de Showa", "Showa Day"),
  constituicaoJP: N("Dia da Constituição", "Constitution Day"),
  verde: N("Dia do Verde", "Greenery Day"),
  criancas: N("Dia das Crianças", "Children's Day"),
  mar: N("Dia do Mar", "Marine Day"),
  montanha: N("Dia da Montanha", "Mountain Day"),
  idosos: N("Dia do Respeito aos Idosos", "Respect for the Aged Day"),
  equinocioOutono: N("Equinócio de outono", "Autumnal Equinox Day"),
  esportes: N("Dia dos Esportes", "Sports Day"),
  cultura: N("Dia da Cultura", "Culture Day"),
  gratidaoTrabalho: N("Dia de Gratidão ao Trabalho", "Labor Thanksgiving Day"),
  feriadoNacionalJP: N("Feriado nacional", "National Holiday"),
  substituto: N("Feriado substituto", "Substitute Holiday"),
  // Egito
  natalCopta: N("Natal copta", "Coptic Christmas Day"),
  revolucao25jan: N("Revolução de 25 de Janeiro e Dia da Polícia", "January 25th Revolution and National Police Day"),
  sinai: N("Libertação do Sinai", "Sinai Liberation Day"),
  shamElNessim: N("Sham el-Nessim", "Spring Festival"),
  revolucao30jun: N("Revolução de 30 de Junho", "June 30 Revolution Day"),
  revolucao23jul: N("Revolução de 23 de Julho", "July 23 Revolution Day"),
  forcasArmadas: N("Dia das Forças Armadas", "Armed Forces Day"),
  // Islâmicos
  anoNovoIslamico: N("Ano Novo islâmico", "Islamic New Year"),
  mawlid: N("Nascimento do Profeta", "Prophet's Birthday"),
  eidFitr: N("Eid al-Fitr", "Eid al-Fitr"),
  arafah: N("Dia de Arafah", "Day of Arafah"),
  eidAdha: N("Eid al-Adha", "Eid al-Adha"),
  ashura: N("Ashura", "Ashura"),
  meioShaban: N("Meio de Sha'ban", "Mid-Sha'ban"),
  laylatQadr: N("Laylat al-Qadr", "Laylat al-Qadr"),
  jumatulWida: N("Jumu'atul-Wida", "Jumu'atul-Wida"),
  // Índia
  republicaIN: N("Dia da República", "Republic Day"),
  independenciaIN: N("Independência", "Independence Day"),
  gandhi: N("Aniversário de Gandhi", "Mahatma Gandhi's Birthday"),
  shivaratri: N("Maha Shivaratri", "Maha Shivaratri"),
  holi: N("Holi", "Holi"),
  ramNavami: N("Ram Navami", "Ram Navami"),
  mahavir: N("Mahavir Jayanti", "Mahavira's Birthday"),
  ambedkar: N("Aniversário de Ambedkar", "Dr. B. R. Ambedkar's Birthday"),
  budaPurnima: N("Buddha Purnima", "Buddha Purnima"),
  janmashtami: N("Janmashtami", "Janmashtami"),
  dussehra: N("Dussehra", "Dussehra"),
  diwali: N("Diwali", "Diwali"),
  guruNanak: N("Aniversário de Guru Nanak", "Guru Nanak's Birthday"),
  // Bangladesh
  lingua: N("Dia dos Mártires e da Língua Materna", "Martyrs' Day and International Mother Language Day"),
  independenciaBD: N("Independência", "Independence Day"),
  anoNovoBengali: N("Ano Novo bengali", "Bengali New Year's Day"),
  julho2024: N("Dia do Levante de Julho", "July Mass Uprising Day"),
  vitoriaBD: N("Dia da Vitória", "Victory Day"),
  // Trocas de dia decididas pelo governo
  folgaTrocada: N("Folga (troca de dia)", "Day off (substituted)"),
};

// ------------------------------------------------------------------ países

const fixo = (mes, d) => ano => [dia(ano, mes, d)];
const pascoaMais = n => ano => [mais(pascoa(ano), n)];
const ortodoxaMais = n => ano => [mais(pascoaOrtodoxa(ano), n)];
const nSemana = (mes, diaSemana, n) => ano => [enesimo(ano, mes, diaSemana, n)];
const SEG = 1, QUI = 4;

// Feriado em fim de semana: sábado vai para sexta e domingo para segunda (EUA)
function observadoEUA(mapa, ano, ids) {
  for (const [k, f] of [...mapa]) {
    if (!ids.has(f.id)) continue;
    const d = deChaveLocal(k);
    const outro = d.getDay() === 6 ? mais(d, -1) : d.getDay() === 0 ? mais(d, 1) : null;
    if (outro && outro.getFullYear() === ano) mapa.set(chave(outro), { id: f.id, observado: true });
  }
}

export const PAISES = {
  BR: {
    moeda: "BRL", fimDeSemana: [0, 6], inicioSemana: 1,
    regras: [
      ["confraternizacao", fixo(1, 1)], ["tiradentes", fixo(4, 21)], ["trabalho", fixo(5, 1)],
      ["independenciaBR", fixo(9, 7)], ["aparecida", fixo(10, 12)], ["finados", fixo(11, 2)],
      ["republicaBR", fixo(11, 15)], ["conscienciaNegra", fixo(11, 20)], ["natal", fixo(12, 25)],
      // Carnaval e Corpus Christi são ponto facultativo, mas a universidade costuma parar
      ["carnaval", pascoaMais(-48)], ["carnaval", pascoaMais(-47)], ["sextaSanta", pascoaMais(-2)],
      ["corpusChristi", pascoaMais(60)],
    ],
  },
  US: {
    moeda: "USD", fimDeSemana: [0, 6], inicioSemana: 1,
    regras: [
      ["anoNovo", fixo(1, 1)], ["mlk", nSemana(1, SEG, 3)], ["washington", nSemana(2, SEG, 3)],
      ["memorial", nSemana(5, SEG, -1)], ["juneteenth", fixo(6, 19)], ["independenciaUS", fixo(7, 4)],
      ["laborUS", nSemana(9, SEG, 1)], ["colombo", nSemana(10, SEG, 2)], ["veteranos", fixo(11, 11)],
      ["acaoDeGracas", nSemana(11, QUI, 4)], ["natal", fixo(12, 25)],
    ],
    // O Ano Novo num sábado é observado na sexta, 31/12 do ano anterior
    vizinhos: true,
    ajustar: (mapa, ano) => observadoEUA(mapa, ano, new Set(["anoNovo", "juneteenth", "independenciaUS", "veteranos", "natal"])),
  },
  MX: {
    moeda: "MXN", fimDeSemana: [0, 6], inicioSemana: 1,
    regras: [
      ["anoNovo", fixo(1, 1)], ["constituicaoMX", nSemana(2, SEG, 1)], ["juarez", nSemana(3, SEG, 3)],
      ["trabalho", fixo(5, 1)], ["independenciaMX", fixo(9, 16)], ["revolucaoMX", nSemana(11, SEG, 3)],
      ["natal", fixo(12, 25)],
      // A posse do presidente, de seis em seis anos (desde 2024 em 1º de outubro)
      ["posseMX", ano => (ano >= 2024 && (ano - 2024) % 6 === 0 ? [dia(ano, 10, 1)] : [])],
    ],
  },
  FR: {
    moeda: "EUR", fimDeSemana: [0, 6], inicioSemana: 1,
    regras: [
      ["anoNovo", fixo(1, 1)], ["segundaPascoa", pascoaMais(1)], ["trabalho", fixo(5, 1)],
      ["vitoria1945", fixo(5, 8)], ["ascensao", pascoaMais(39)], ["pentecostes", pascoaMais(50)],
      ["bastilha", fixo(7, 14)], ["assuncao", fixo(8, 15)], ["todosOsSantos", fixo(11, 1)],
      ["armisticio", fixo(11, 11)], ["natal", fixo(12, 25)],
    ],
  },
  PT: {
    moeda: "EUR", fimDeSemana: [0, 6], inicioSemana: 1,
    regras: [
      ["anoNovo", fixo(1, 1)], ["sextaSanta", pascoaMais(-2)], ["pascoa", pascoaMais(0)],
      ["liberdade", fixo(4, 25)], ["trabalho", fixo(5, 1)], ["corpusChristi", pascoaMais(60)],
      ["diaDePortugal", fixo(6, 10)], ["assuncao", fixo(8, 15)], ["republicaPT", fixo(10, 5)],
      ["todosOsSantos", fixo(11, 1)], ["restauracao", fixo(12, 1)], ["imaculada", fixo(12, 8)],
      ["natal", fixo(12, 25)],
    ],
  },
  RU: {
    moeda: "RUB", fimDeSemana: [0, 6], inicioSemana: 1,
    regras: [
      ...[1, 2, 3, 4, 5, 6, 8].map(d => ["anoNovoRU", fixo(1, d)]), ["natalOrtodoxo", fixo(1, 7)],
      ["defensor", fixo(2, 23)], ["mulher", fixo(3, 8)], ["primavera", fixo(5, 1)],
      ["vitoriaRU", fixo(5, 9)], ["russia", fixo(6, 12)], ["unidade", fixo(11, 4)],
    ],
    // Fora de janeiro, feriado no fim de semana passa para o próximo dia útil.
    // As folgas de janeiro o governo redistribui por decreto (tabela oficial).
    ajustar: (mapa, ano) => {
      for (const [k, f] of [...mapa].sort()) {
        const d = deChaveLocal(k);
        if (d.getMonth() === 0 || (d.getDay() !== 0 && d.getDay() !== 6)) continue;
        let outro = mais(d, 1);
        while (outro.getDay() === 0 || outro.getDay() === 6 || mapa.has(chave(outro))) outro = mais(outro, 1);
        if (outro.getFullYear() === ano) mapa.set(chave(outro), { id: f.id, observado: true });
      }
    },
  },
  CN: {
    moeda: "CNY", fimDeSemana: [0, 6], inicioSemana: 1,
    regras: [
      ["anoNovo", fixo(1, 1)],
      ["vesperaAnoNovoChines", ano => chines(ano, "anoNovo").map(d => mais(d, -1))],
      ...[0, 1, 2].map(n => ["anoNovoChines", ano => chines(ano, "anoNovo").map(d => mais(d, n))]),
      ["qingming", ano => chines(ano, "qingming")], ["trabalho", fixo(5, 1)], ["trabalho", fixo(5, 2)],
      ["barcoDragao", ano => chines(ano, "barcoDragao")], ["meioOutono", ano => chines(ano, "meioOutono")],
      ...[1, 2, 3].map(d => ["nacionalCN", fixo(10, d)]),
    ],
  },
  JP: {
    moeda: "JPY", fimDeSemana: [0, 6], inicioSemana: 1,
    regras: [
      ["anoNovo", fixo(1, 1)], ["maioridade", nSemana(1, SEG, 2)], ["fundacao", fixo(2, 11)],
      ["imperador", fixo(2, 23)], ["equinocioPrimavera", ano => [dia(ano, 3, equinocio(ano, 20.8431))]],
      ["showa", fixo(4, 29)], ["constituicaoJP", fixo(5, 3)], ["verde", fixo(5, 4)], ["criancas", fixo(5, 5)],
      ["mar", nSemana(7, SEG, 3)], ["montanha", fixo(8, 11)], ["idosos", nSemana(9, SEG, 3)],
      ["equinocioOutono", ano => [dia(ano, 9, equinocio(ano, 23.2488))]], ["esportes", nSemana(10, SEG, 2)],
      ["cultura", fixo(11, 3)], ["gratidaoTrabalho", fixo(11, 23)],
    ],
    ajustar: mapa => {
      // Dia comum entre dois feriados também é feriado (国民の休日)
      for (const k of [...mapa.keys()]) {
        const d = deChaveLocal(k);
        const meio = mais(d, 1), depois = mais(d, 2);
        if (!mapa.has(chave(meio)) && mapa.has(chave(depois)) && meio.getDay() !== 0) {
          mapa.set(chave(meio), { id: "feriadoNacionalJP" });
        }
      }
      // Feriado no domingo passa para o próximo dia que não for feriado (振替休日)
      for (const k of [...mapa.keys()].sort()) {
        const d = deChaveLocal(k);
        if (d.getDay() !== 0) continue;
        let outro = mais(d, 1);
        while (mapa.has(chave(outro))) outro = mais(outro, 1);
        mapa.set(chave(outro), { id: "substituto" });
      }
    },
  },
  EG: {
    moeda: "EGP", fimDeSemana: [5, 6], inicioSemana: 0,
    regras: [
      ["natalCopta", fixo(1, 7)], ["revolucao25jan", fixo(1, 25)], ["sinai", fixo(4, 25)],
      ["shamElNessim", ortodoxaMais(1)], ["trabalho", fixo(5, 1)], ["revolucao30jun", fixo(6, 30)],
      ["revolucao23jul", fixo(7, 23)], ["forcasArmadas", fixo(10, 6)],
      ["anoNovoIslamico", ano => hijri(ano, 1, 1)], ["mawlid", ano => hijri(ano, 3, 12)],
      ["eidFitr", ano => hijri(ano, 10, 1)], ["eidFitr", ano => hijri(ano, 10, 2)],
      ["arafah", ano => hijri(ano, 12, 9)],
      ...[10, 11, 12].map(d => ["eidAdha", ano => hijri(ano, 12, d)]),
    ],
    // Desde 2020, os feriados cívicos de domingo a quarta passam para a quinta
    ajustar: mapa => {
      const movem = new Set(["revolucao25jan", "sinai", "trabalho", "revolucao30jun", "revolucao23jul", "forcasArmadas", "anoNovoIslamico"]);
      const ate = { 0: 4, 1: 3, 2: 2, 3: 1 };
      for (const [k, f] of [...mapa]) {
        const d = deChaveLocal(k);
        if (!movem.has(f.id) || !(d.getDay() in ate)) continue;
        const [fica, ...resto] = f.outros ?? [];
        if (fica) mapa.set(k, resto.length ? { id: fica, outros: resto } : { id: fica });
        else mapa.delete(k);
        juntarFeriado(mapa, chave(mais(d, ate[d.getDay()])), { id: f.id, observado: true });
      }
    },
  },
  IN: {
    moeda: "INR", fimDeSemana: [0, 6], inicioSemana: 1,
    // Datas fixas nacionais; os festivais (hindus, islâmicos, sikh, jain,
    // budistas) dependem da lua e vêm da tabela oficial de cada ano
    regras: [
      ["republicaIN", fixo(1, 26)], ["ambedkar", fixo(4, 14)], ["independenciaIN", fixo(8, 15)],
      ["gandhi", fixo(10, 2)], ["sextaSanta", pascoaMais(-2)], ["natal", fixo(12, 25)],
    ],
  },
  BD: {
    moeda: "BDT", fimDeSemana: [5, 6], inicioSemana: 0,
    regras: [
      ["lingua", fixo(2, 21)], ["independenciaBD", fixo(3, 26)], ["anoNovoBengali", fixo(4, 14)],
      ["trabalho", fixo(5, 1)], ["julho2024", fixo(8, 5)], ["vitoriaBD", fixo(12, 16)], ["natal", fixo(12, 25)],
    ],
    // Sem tabela para o ano, os islâmicos saem do calendário Umm al-Qura (a data
    // oficial depende da lua vista no país e pode cair um dia depois)
    semTabela: [
      ["eidFitr", ano => hijri(ano, 10, 1)], ["eidFitr", ano => hijri(ano, 10, 2)], ["eidFitr", ano => hijri(ano, 10, 3)],
      ...[10, 11, 12].map(d => ["eidAdha", ano => hijri(ano, 12, d)]),
      ["ashura", ano => hijri(ano, 1, 10)], ["mawlid", ano => hijri(ano, 3, 12)],
    ],
  },
};

export const SEM_PAIS = { moeda: "USD", fimDeSemana: [0, 6], inicioSemana: 1, regras: [] };

// ------------------------------------------------------------------ ano a ano

const porAno = new Map();

// Dois feriados no mesmo dia (Sinai e Sham el-Nessim em 2033): o segundo vai
// em `outros`, para não sumir se o primeiro mudar de dia
function juntarFeriado(mapa, k, f) {
  const atual = mapa.get(k);
  if (!atual) mapa.set(k, f);
  else if (atual.id !== f.id && !atual.outros?.includes(f.id)) atual.outros = [...(atual.outros ?? []), f.id];
}

// Feriados de um ano: Map de "AAAA-MM-DD" para { id, observado }, mais os
// fins de semana que viram dia de trabalho (troca de dia na China e na Rússia)
export function feriadosDoAno(ano, codigo) {
  const k = `${codigo}:${ano}`;
  if (porAno.has(k)) return porAno.get(k);
  const pais = PAISES[codigo] ?? SEM_PAIS;
  const tabela = TABELAS[codigo]?.[ano];
  const mapa = new Map();
  let uteis = new Set();
  if (tabela?.completo) {
    // Ano com calendário oficial completo publicado: vale a tabela inteira
    for (const [d, id, observado] of tabela.feriados) mapa.set(d, observado ? { id, observado } : { id });
    uteis = new Set(tabela.uteis ?? []);
  } else {
    const regras = [...pais.regras, ...(tabela ? [] : pais.semTabela ?? [])];
    // Regras que mexem em datas de um ano para outro (o 31/12 observado nos
    // EUA) olham também os vizinhos
    for (const a of pais.vizinhos ? [ano - 1, ano, ano + 1] : [ano]) {
      for (const [id, datas] of regras) for (const d of datas(a)) juntarFeriado(mapa, chave(d), { id });
    }
    pais.ajustar?.(mapa, ano);
    for (const [d, id] of tabela?.feriados ?? []) juntarFeriado(mapa, d, { id });
    for (const d of [...mapa.keys()]) if (!d.startsWith(`${ano}-`)) mapa.delete(d);
  }
  const resultado = { feriados: mapa, uteis };
  porAno.set(k, resultado);
  return resultado;
}

// Nome no idioma, com o inglês quando não houver tradução; dois feriados no
// mesmo dia saem juntos
export function nomeDoFeriado(f, idioma = "pt", traducoes = {}) {
  const nome = id => traducoes[id] ?? NOMES[id]?.[idioma] ?? NOMES[id]?.en ?? id;
  const principal = f.observado ? `${nome(f.id)} (${traducoes.observado ?? (idioma === "pt" ? "observado" : "observed")})` : nome(f.id);
  return [principal, ...(f.outros ?? []).map(nome)].join(" · ");
}

// ------------------------------------------------------------------ calendário

// O calendário de quem usa o app: país + feriados extras. Extras são
// { data: "MM-DD" (todo ano) ou "AAAA-MM-DD", nome, tipo: "feriado" | "util" };
// "util" faz o dia ser de trabalho mesmo em fim de semana ou feriado.
export function calendario({ pais = "BR", extras = [], idioma = "pt", traducoes = {}, semNome = "Feriado" } = {}) {
  const def = PAISES[pais] ?? SEM_PAIS;
  const fds = new Set(def.fimDeSemana);
  const extra = k => extras.find(e => e.data === k) ?? extras.find(e => e.data === k.slice(5));
  // O histórico pergunta o mesmo dia muitas vezes (cada linha refaz os dias
  // úteis do mês): a resposta de cada dia fica guardada
  const feriados = new Map();
  const fins = new Map();
  const cal = {
    pais, idioma, moeda: def.moeda, inicioSemana: def.inicioSemana,
    diasPorSemana: 7 - fds.size,
    // Fim de semana do país, sem contar as trocas de dia
    fimDeSemanaFixo: diaSemana => fds.has(diaSemana),
    // Nome do feriado do dia, ou undefined
    feriado(d) {
      const k = chave(d);
      if (!feriados.has(k)) {
        const e = extra(k);
        const f = feriadosDoAno(d.getFullYear(), pais).feriados.get(k);
        feriados.set(k, e ? (e.tipo === "feriado" ? e.nome || semNome : undefined) : f && nomeDoFeriado(f, idioma, traducoes));
      }
      return feriados.get(k);
    },
    // Fim de semana de verdade: o do país menos os dias trocados para trabalho
    fimDeSemana(d) {
      const k = chave(d);
      if (!fins.has(k)) {
        const e = extra(k);
        fins.set(k, e ? e.tipo === "feriado" && fds.has(d.getDay())
          : fds.has(d.getDay()) && !feriadosDoAno(d.getFullYear(), pais).uteis.has(k));
      }
      return fins.get(k);
    },
    folga: d => cal.fimDeSemana(d) || Boolean(cal.feriado(d)),
  };
  return cal;
}
