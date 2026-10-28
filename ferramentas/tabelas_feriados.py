#!/usr/bin/env python3
"""Gera feriados-tabelas.js a partir do pacote `holidays` (só para quem mantém o app).

As regras de feriados.js valem para qualquer ano; estas tabelas cobrem o que
não tem regra: os anos em que China e Rússia publicaram o calendário oficial
(com as trocas de dia), as datas lunares de Índia e Bangladesh e o calendário
lunar chinês de 2000 a 2100. O Intl também tem esse calendário, mas erra a lua
nova que cai perto da meia-noite de Pequim (2027 e 2030) e muda de motor entre
navegadores.

  python3 -m venv /tmp/v && /tmp/v/bin/pip install holidays
  /tmp/v/bin/python ferramentas/tabelas_feriados.py > feriados-tabelas.js
  /tmp/v/bin/python ferramentas/tabelas_feriados.py --referencia > testes/feriados-referencia.json

Rodar de novo quando sair o calendário de um ano novo (a China publica em
novembro). O app não depende do pacote: só do arquivo gerado.
"""
import json
import re
import sys
from datetime import date

import holidays
from holidays.calendars.chinese import _ChineseLunisolar

ANOS = range(2025, 2036)

IDS = {
    # China
    "New Year's Day": "anoNovo", "Chinese New Year's Eve": "vesperaAnoNovoChines",
    "Chinese New Year (Spring Festival)": "anoNovoChines", "Tomb-Sweeping Day": "qingming",
    "Labor Day": "trabalho", "Dragon Boat Festival": "barcoDragao", "Mid-Autumn Festival": "meioOutono",
    "National Day": "nacionalCN",
    # Rússia
    "New Year Holidays": "anoNovoRU", "Christmas Day": "natal", "Defender of the Fatherland Day": "defensor",
    "International Women's Day": "mulher", "Holiday of Spring and Labor": "primavera", "Victory Day": "vitoria",
    "Russia Day": "russia", "Unity Day": "unidade",
    # Índia e Bangladesh
    "Holi": "holi", "Ram Navami": "ramNavami", "Mahavira's Birthday": "mahavir", "Buddha Purnima": "budaPurnima",
    "Eid al-Fitr": "eidFitr", "Eid al-Adha": "eidAdha", "Ashura": "ashura", "Prophet's Birthday": "mawlid",
    "Janmashtami (Vaishnava)": "janmashtami", "Janmashtami": "janmashtami", "Dussehra": "dussehra",
    "Diwali": "diwali", "Guru Nanak's Birthday": "guruNanak", "Mid-Sha'ban": "meioShaban",
    "Laylat al-Qadr": "laylatQadr", "Jumu'atul-Wida": "jumatulWida", "Maha Shivaratri": "shivaratri",
}
# Datas fixas que feriados.js já gera por regra
FIXOS = {
    "IN": {"Republic Day", "Independence Day", "Mahatma Gandhi's Birthday", "Good Friday", "Christmas",
           "Dr. B. R. Ambedkar's Birthday"},
    "BD": {"Martyrs' Day and International Mother Language Day", "Independence Day", "Bengali New Year's Day",
           "May Day", "July Mass Uprising Day", "Victory Day", "Christmas Day"},
}
# Ids que mudam de nome por país
POR_PAIS = {("RU", "natal"): "natalOrtodoxo", ("RU", "vitoria"): "vitoriaRU"}


def identificar(pais, nome):
    """(id, observado) de um nome do pacote; para quem não conhece, erro."""
    if nome.startswith("Day off (substituted"):
        return "folgaTrocada", False
    observado = "(observed" in nome
    base = re.sub(r" \((observed|estimated|observed, estimated)\)$", "", nome)
    if base not in IDS:
        sys.exit(f"{pais}: nome sem id em IDS: {nome!r}")
    return POR_PAIS.get((pais, IDS[base]), IDS[base]), observado


def lista(pais, ano):
    return sorted(holidays.country_holidays(pais, years=ano, language="en_US").items())


def completo(pais):
    """Anos com calendário oficial publicado: tabela inteira, com as trocas de dia."""
    especiais = set(getattr(holidays.country_holidays(pais, years=2025), "special_public_holidays", {}))
    tabela = {}
    for ano in ANOS:
        if ano not in especiais:
            continue
        h = holidays.country_holidays(pais, years=ano, language="en_US")
        feriados = []
        for d, nome in sorted(h.items()):
            for parte in nome.split("; "):
                id_, obs = identificar(pais, parte)
                feriados.append([d.isoformat(), id_, True] if obs else [d.isoformat(), id_])
                break
        uteis = sorted(d.isoformat() for d in getattr(h, "weekend_workdays", ()) if d.year == ano)
        tabela[ano] = {"completo": True, "feriados": feriados, "uteis": uteis}
    return tabela


def lunares(pais):
    """Só as datas que dependem da lua; as fixas ficam com as regras."""
    tabela = {}
    for ano in ANOS:
        feriados = []
        for d, nome in lista(pais, ano):
            for parte in nome.split("; "):
                base = re.sub(r" \((observed|estimated|observed, estimated)\)$", "", parte)
                if base in FIXOS[pais]:
                    continue
                feriados.append([d.isoformat(), identificar(pais, parte)[0]])
        tabela[ano] = {"feriados": feriados}
    return tabela


def chines():
    """Ano Novo, Qingming, Barco-Dragão e Meio do Outono, ano a ano."""
    c = _ChineseLunisolar()
    datas = {}
    for ano in range(2000, 2101):
        datas[ano] = [str(f(ano)[0]) for f in (c.lunar_new_year_date, c.qingming_date, c.dragon_boat_date,
                                               c.mid_autumn_date)]
    return datas


def referencia():
    """Datas de cada país e ano segundo o pacote, para o teste comparar com as regras."""
    saida = {}
    for pais in ("US", "MX", "FR", "PT", "RU", "CN", "JP", "EG", "IN", "BD"):
        saida[pais] = {}
        for ano in ANOS:
            h = holidays.country_holidays(pais, years=ano)
            saida[pais][ano] = {
                "feriados": sorted(d.isoformat() for d in h),
                "uteis": sorted(d.isoformat() for d in getattr(h, "weekend_workdays", ()) if d.year == ano),
            }
    print(json.dumps({"versao": holidays.__version__, "paises": saida}, separators=(",", ":")))


def main():
    if "--referencia" in sys.argv:
        return referencia()
    tabelas = {"CN": completo("CN"), "RU": completo("RU"), "IN": lunares("IN"), "BD": lunares("BD"),
               "chines": chines()}
    print("// Gerado por ferramentas/tabelas_feriados.py a partir do pacote holidays")
    print(f"// {holidays.__version__}, em {date.today().isoformat()}. Não editar à mão.")
    print(f"export const TABELAS = {json.dumps(tabelas, ensure_ascii=False, separators=(',', ':'))};")


if __name__ == "__main__":
    main()
