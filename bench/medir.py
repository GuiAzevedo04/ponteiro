#!/usr/bin/env python3
"""Mede a página de horas num Chrome headless, só com a biblioteca padrão.

Cada versão roda com o próprio servidor.py, numa porta só dela e sobre dados
fictícios gerados aqui: o registro.json de verdade nunca é lido nem gravado.

  python3 bench/medir.py --rotulo antes --app bench/antes
  python3 bench/medir.py --rotulo depois
  python3 bench/medir.py --comparar antes depois
  python3 bench/medir.py --servir bench/antes   # cópia no ar para o Lighthouse
"""
import argparse
import contextlib
import datetime as dt
import fcntl
import json
import os
import random
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

BENCH = Path(__file__).resolve().parent
PASTA = BENCH.parent
RESULTADOS = BENCH / "resultados"
PYTHON = "/usr/bin/python3"  # o mesmo do horas.service
PORTA = 8799


class Chrome:
    """Chrome headless controlado pelo DevTools Protocol via --remote-debugging-pipe.

    O pipe usa os descritores 3 (comandos) e 4 (respostas), com mensagens JSON
    terminadas em \\0: dispensa cliente de websocket.
    """

    def __init__(self):
        self.perfil = tempfile.mkdtemp(prefix="horas-chrome-")
        cmd_le, self._escrita = os.pipe()
        self._leitura, resp_escreve = os.pipe()
        # Copiados para acima de 10 para o dup2 no filho não pisar num deles
        fd3 = fcntl.fcntl(cmd_le, fcntl.F_DUPFD, 10)
        fd4 = fcntl.fcntl(resp_escreve, fcntl.F_DUPFD, 10)

        def no_filho():
            os.dup2(fd3, 3)
            os.dup2(fd4, 4)

        self.proc = subprocess.Popen(
            [shutil.which("google-chrome"), "--headless", "--remote-debugging-pipe",
             f"--user-data-dir={self.perfil}", "--no-first-run", "--no-default-browser-check",
             "--disable-extensions", "--disable-sync", "--disable-background-networking",
             "--disable-component-update", "--window-size=1440,900", "about:blank"],
            pass_fds=(3, 4), preexec_fn=no_filho,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for fd in (cmd_le, resp_escreve, fd3, fd4):
            os.close(fd)

        self._id = 0
        self._respostas = {}
        self._cv = threading.Condition()
        self.eventos = []
        threading.Thread(target=self._ler, daemon=True).start()

    def _ler(self):
        buf = b""
        while pedaco := os.read(self._leitura, 1 << 16):
            buf += pedaco
            while b"\0" in buf:
                msg, buf = buf.split(b"\0", 1)
                m = json.loads(msg)
                with self._cv:
                    if "id" in m:
                        self._respostas[m["id"]] = m
                    else:
                        self.eventos.append(m)
                    self._cv.notify_all()

    def cmd(self, metodo, sessao=None, **params):
        self._id += 1
        i = self._id
        m = {"id": i, "method": metodo, "params": params}
        if sessao:
            m["sessionId"] = sessao
        os.write(self._escrita, json.dumps(m).encode() + b"\0")
        with self._cv:
            if not self._cv.wait_for(lambda: i in self._respostas, timeout=60):
                raise TimeoutError(metodo)
            r = self._respostas.pop(i)
        if "error" in r:
            raise RuntimeError(f"{metodo}: {r['error']}")
        return r["result"]

    def esperar(self, metodo, sessao, desde=0, timeout=30):
        def achar():
            return next((e for e in self.eventos[desde:]
                         if e["method"] == metodo and e.get("sessionId") == sessao), None)
        with self._cv:
            if not self._cv.wait_for(achar, timeout=timeout):
                raise TimeoutError(metodo)
            return achar()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        with contextlib.suppress(Exception):
            self.cmd("Browser.close")
        try:
            self.proc.wait(10)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        shutil.rmtree(self.perfil, ignore_errors=True)


def aba(c, dominios=("Page", "Runtime", "Performance")):
    alvo = next(t["targetId"] for t in c.cmd("Target.getTargets")["targetInfos"] if t["type"] == "page")
    s = c.cmd("Target.attachToTarget", targetId=alvo, flatten=True)["sessionId"]
    for d in dominios:
        c.cmd(f"{d}.enable", s)
    return alvo, s


def valor(c, s, expr):
    r = c.cmd("Runtime.evaluate", s, expression=expr, returnByValue=True, awaitPromise=True)
    if "exceptionDetails" in r:
        raise RuntimeError(r["exceptionDetails"])
    return r["result"].get("value")


def esperar_valor(c, s, expr, timeout=10):
    fim = time.monotonic() + timeout
    while time.monotonic() < fim:
        if (v := valor(c, s, expr)) is not None:
            return v
        time.sleep(0.05)
    raise TimeoutError(expr)


def navegar(c, s, url):
    desde = len(c.eventos)
    c.cmd("Page.navigate", s, url=url)
    c.esperar("Page.loadEventFired", s, desde)
    return desde


# ---------------------------------------------------------------- dados fictícios

CAMPOS = {"horasSemana": "30", "salario": "1500", "entrada": "08:00", "almoco": "12:00",
          "almocoHoras": "1", "temAlmoco": "true", "temExtra": "false"}


def registro_ficticio(meses):
    """Dias úteis dos últimos `meses` meses com horários variados; hoje fica aberto."""
    rnd = random.Random(42)
    hoje = dt.date.today()
    ano, mes = hoje.year, hoje.month - (meses - 1)
    while mes <= 0:
        mes += 12
        ano -= 1
    registro = {}
    d = dt.date(ano, mes, 1)
    while d < hoje:
        if d.weekday() < 5:
            entrada = 8 * 60 + rnd.randrange(0, 90, 5)
            saida = entrada + 7 * 60 + rnd.randrange(-40, 40, 5)
            registro[d.isoformat()] = {
                "entrada": f"{entrada // 60:02d}:{entrada % 60:02d}", "almoco": "12:00",
                "almocoHoras": 1, "meta": 6, "saida": f"{saida // 60:02d}:{saida % 60:02d}"}
        d += dt.timedelta(days=1)
    registro[hoje.isoformat()] = {"entrada": "08:00", "almoco": "12:00", "almocoHoras": 1, "meta": 6}
    return {"campos": CAMPOS, "registro": registro}


@contextlib.contextmanager
def servir(app, dados):
    """Sobe uma cópia do app (com o servidor.py dela) na PORTA, sobre `dados`."""
    tmp = Path(tempfile.mkdtemp(prefix="horas-app-"))
    try:
        for f in app.iterdir():
            if f.is_file() and not f.name.startswith("registro"):
                shutil.copy(f, tmp)
        # Os textos de cada idioma ficam numa pasta à parte (desde a versão com idiomas)
        if (app / "idiomas").is_dir():
            shutil.copytree(app / "idiomas", tmp / "idiomas")
        if (app / "fontes").is_dir():
            shutil.copytree(app / "fontes", tmp / "fontes")
        # A versão original tinha porta e URL fixas no código
        for nome, velho, novo in [("servidor.py", "PORTA = 8765", f"PORTA = {PORTA}"),
                                  ("index.html", "localhost:8765", f"localhost:{PORTA}")]:
            f = tmp / nome
            f.write_text(f.read_text(encoding="utf-8").replace(velho, novo), encoding="utf-8")
        (tmp / "registro.json").write_text(json.dumps(dados), encoding="utf-8")

        proc = subprocess.Popen([PYTHON, "servidor.py"], cwd=tmp, env={**os.environ, "HORAS_PORTA": str(PORTA)},
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                with contextlib.suppress(OSError):
                    urllib.request.urlopen(f"http://127.0.0.1:{PORTA}/", timeout=1).close()
                    break
                time.sleep(0.05)
            else:
                raise RuntimeError("servidor da cópia não subiu")
            yield f"http://localhost:{PORTA}/"
        finally:
            proc.terminate()
            proc.wait(5)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---------------------------------------------------------------- cenários

# Marca quando o "posso sair" ganha um horário de verdade e o quadro com ele
# termina de ser pintado: rAF + tarefa seguinte roda depois da pintura. (O
# carimbo do próprio rAF é o início do quadro e pode vir antes da mudança.)
OBSERVADOR = r"""
(() => {
  const pronto = () => /^\d\d:\d\d$/.test(document.getElementById("saida")?.textContent ?? "");
  const obs = new MutationObserver(() => {
    if (!pronto()) return;
    obs.disconnect();
    requestAnimationFrame(() => setTimeout(() => { window.__numeros = performance.now(); }));
  });
  obs.observe(document, { subtree: true, childList: true, characterData: true });
})();
"""

TEMPOS_DE_CARGA = """(() => {
  const n = performance.getEntriesByType("navigation")[0];
  const fcp = performance.getEntriesByName("first-contentful-paint")[0];
  return fcp && n.loadEventEnd ? { fcp: fcp.startTime, dcl: n.domContentLoadedEventEnd } : null;
})()"""


def visita(c, s, url):
    desde = navegar(c, s, url)
    numeros = esperar_valor(c, s, "window.__numeros")
    tempos = esperar_valor(c, s, TEMPOS_DE_CARGA)
    time.sleep(0.5)  # deixa o fetch de /dados terminar para entrar na conta
    ev = [e for e in c.eventos[desde:] if e.get("sessionId") == s]
    kb = sum(e["params"]["encodedDataLength"] for e in ev if e["method"] == "Network.loadingFinished") / 1024
    reqs = sum(1 for e in ev if e["method"] == "Network.requestWillBeSent")
    # Nada aparece antes da primeira pintura
    return {"fcp_ms": tempos["fcp"], "numeros_ms": max(numeros, tempos["fcp"]), "kb": kb, "requisicoes": reqs}


# Razão de contraste WCAG de cada texto visível contra o fundo efetivo
# (camadas semitransparentes e opacidade dos ancestrais incluídas); devolve os
# que ficam abaixo de 4,5:1 (3:1 para texto grande). Controles desabilitados
# são isentos, como na WCAG.
CHECA_CONTRASTE = r"""(() => {
  const rgba = s => { const m = s.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; return [m[0], m[1], m[2], m[3] ?? 1]; };
  const lum = ([r, g, b]) => {
    const f = c => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const mistura = (cima, base) => [0, 1, 2].map(i => cima[i] * cima[3] + base[i] * (1 - cima[3])).concat(1);
  const fundo = el => {
    const camadas = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const c = rgba(cs.backgroundColor);
      if (c[3] > 0) { camadas.push(c); if (c[3] >= 1) break; }
      else if (cs.backgroundImage.includes("gradient")) {
        const cores = cs.backgroundImage.match(/rgba?\([^)]*\)/g);
        if (cores) { camadas.push(rgba(cores.at(-1))); break; }
      }
    }
    return camadas.reverse().reduce((base, c) => mistura(c, base), [255, 255, 255, 1]);
  };
  const elementos = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) if (w.currentNode.textContent.trim()) elementos.add(w.currentNode.parentElement);
  document.querySelectorAll("input:not([type=checkbox]):not([type=radio]), select").forEach(e => elementos.add(e));
  const ruins = new Set();
  for (const el of elementos) {
    if (!el.checkVisibility() || el.matches(":disabled") || el.closest(":disabled")) continue;
    if (!el.getBoundingClientRect().width) continue;
    const cs = getComputedStyle(el);
    let opac = 1;
    for (let e = el; e; e = e.parentElement) opac *= Number(getComputedStyle(e).opacity);
    const bg = fundo(el);
    const cor = rgba(cs.color);
    cor[3] *= opac;
    const [a, b] = [lum(mistura(cor, bg)), lum(bg)].sort((x, y) => y - x);
    const razao = (a + 0.05) / (b + 0.05);
    const px = parseFloat(cs.fontSize);
    const grande = px >= 24 || (Number(cs.fontWeight) >= 700 && px >= 18.66);
    if (razao < (grande ? 3 : 4.5)) {
      const classe = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).join(".") : "";
      ruins.add(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${classe} ${razao.toFixed(2)}:1`);
    }
  }
  return [...ruins];
})()"""


def contraste(c, s):
    """Textos abaixo do contraste AA em cada tela, nos temas escuro e claro."""
    achados = {}
    for tema in ("dark", "light"):
        c.cmd("Emulation.setEmulatedMedia", s, features=[{"name": "prefers-color-scheme", "value": tema}])
        ruins = set()
        # A versão original volta para a tela principal pelo btnVoltar
        for botoes in (("btnHoje", "btnVoltar"), ("btnHistorico",), ("btnEstatisticas",)):
            achar = " || ".join(f"document.getElementById('{b}')" for b in botoes)
            valor(c, s, f"({achar})?.click()")
            ruins |= set(valor(c, s, CHECA_CONTRASTE))
        achados[tema] = sorted(ruins)
    c.cmd("Emulation.setEmulatedMedia", s, features=[])
    return achados


def cenario_carga(url, rep):
    out = {"fria": [], "repetida": []}
    for _ in range(rep):
        with Chrome() as c:
            _, s = aba(c, ("Page", "Runtime", "Network"))
            c.cmd("Page.addScriptToEvaluateOnNewDocument", s, source=OBSERVADOR)
            out["fria"].append(visita(c, s, url))
            time.sleep(1.5)  # tempo para um service worker ativar, se houver
            out["repetida"].append(visita(c, s, url))
    m = {}
    for tipo in ("fria", "repetida"):
        for k in out[tipo][0]:
            m[f"carga.{tipo}.{k}"] = [v[k] for v in out[tipo]]

    # Contraste não varia entre repetições: uma passada basta
    with Chrome() as c:
        _, s = aba(c)
        navegar(c, s, url)
        time.sleep(1)
        detalhes = contraste(c, s)
    for tema, ruins in detalhes.items():
        m[f"a11y.contraste_baixo_{tema}"] = [len(ruins)]
    return m, detalhes


def cenario_ocioso(url, rep, seg, cpu=1, fundo=False):
    porminuto = 60 / seg
    vals = {}
    for _ in range(rep):
        with Chrome() as c:
            alvo, s = aba(c)
            navegar(c, s, url)
            time.sleep(3)
            if cpu > 1:
                c.cmd("Emulation.setCPUThrottlingRate", s, rate=cpu)
            if fundo:
                janela = c.cmd("Browser.getWindowForTarget", targetId=alvo)["windowId"]
                c.cmd("Browser.setWindowBounds", windowId=janela, bounds={"windowState": "minimized"})
                time.sleep(2)
                assert valor(c, s, "document.visibilityState") == "hidden"

            def metricas():
                return {m["name"]: m["value"] for m in c.cmd("Performance.getMetrics", s)["metrics"]}
            m0 = metricas()
            time.sleep(seg)
            m1 = metricas()
            d = {k: m1[k] - m0[k] for k in m0}
            amostra = {
                "cpu_ms_min": d["TaskDuration"] * 1000 * porminuto,
                "script_ms_min": d["ScriptDuration"] * 1000 * porminuto,
                "estilo_layout_ms_min": (d["LayoutDuration"] + d["RecalcStyleDuration"]) * 1000 * porminuto,
                "recalc_estilo_min": d["RecalcStyleCount"] * porminuto,
                "layouts_min": d["LayoutCount"] * porminuto,
                "heap_mb": m1["JSHeapUsedSize"] / 1e6,
            }
            for k, v in amostra.items():
                vals.setdefault(k, []).append(v)
    nome = "fundo" if fundo else f"ocioso_cpu{cpu}x"
    return {f"{nome}.{k}": v for k, v in vals.items()}


# Abre o histórico e volta 11 meses; cada clique é medido até o layout terminar
NAVEGA_HISTORICO = """(() => {
  const medir = id => {
    const t = performance.now();
    document.getElementById(id).click();
    document.body.offsetHeight;
    return performance.now() - t;
  };
  const abrir = medir("btnHistorico");
  const meses = Array.from({ length: 11 }, () => medir("mesAnterior"));
  const est = document.getElementById("btnEstatisticas") ? medir("btnEstatisticas") : null;
  return { abrir, meses, est };
})()"""


def cenario_historico(app, rep):
    with servir(app, registro_ficticio(12)) as url:
        vals = {}
        for _ in range(rep):
            with Chrome() as c:
                _, s = aba(c)
                navegar(c, s, url)
                time.sleep(1)
                r = valor(c, s, NAVEGA_HISTORICO)
                vals.setdefault("historico.abrir_ms", []).append(r["abrir"])
                vals.setdefault("historico.mudar_mes_ms", []).append(statistics.median(r["meses"]))
                if r["est"] is not None:
                    vals.setdefault("estatisticas.abrir_ms", []).append(r["est"])
        return vals


def ab(url):
    saida = subprocess.run(["ab", "-q", "-n", "2000", "-c", "4", url], capture_output=True, text=True).stdout
    rps = float(re.search(r"Requests per second:\s+([\d.]+)", saida)[1])
    falhas = int(re.search(r"Failed requests:\s+(\d+)", saida)[1])
    non2xx = re.search(r"Non-2xx responses:\s+(\d+)", saida)
    return rps, falhas + (int(non2xx[1]) if non2xx else 0)


def escritas_concorrentes(base, n=20):
    """n clientes gravam, ao mesmo tempo, cada um um dia diferente.

    Cada cliente segue o protocolo da sua versão: a original só faz PUT; a nova
    manda If-Match e, num 409, junta o próprio dia ao documento atual e tenta
    de novo (o que o app.js faz). Conta quantos dias sobreviveram.
    """
    url = base + "dados"
    barreira = threading.Barrier(n)
    erros = []

    def pedir(metodo, corpo=None, etag=None):
        req = urllib.request.Request(url, method=metodo, data=corpo and json.dumps(corpo).encode())
        req.add_header("Content-Type", "application/json")
        if etag:
            req.add_header("If-Match", etag)
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, r.read(), r.headers.get("ETag")
        except urllib.error.HTTPError as e:
            return e.code, e.read(), e.headers.get("ETag")

    def cliente(i):
        dia = f"2031-01-{i + 1:02d}"
        try:
            _, corpo, etag = pedir("GET")
            dados = json.loads(corpo)
            barreira.wait()
            for _ in range(50):
                dados["registro"][dia] = {"entrada": "08:00", "almoco": "", "almocoHoras": 0, "meta": 6,
                                          "saida": "14:00", "atualizado": int(time.time() * 1000)}
                status, corpo, novo = pedir("PUT", dados, etag)
                if status == 409:
                    dados, etag = json.loads(corpo), novo
                    continue
                if status >= 300:
                    erros.append(status)
                return
            erros.append("desistiu")
        except Exception as e:  # conexão derrubada pelo servidor conta como erro
            erros.append(type(e).__name__)

    threads = [threading.Thread(target=cliente, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    _, corpo, _ = pedir("GET")
    vivos = sum(1 for k in json.loads(corpo)["registro"] if k.startswith("2031-01-"))
    return n - vivos, len(erros)


def cenario_servidor(app, rep):
    with servir(app, registro_ficticio(1)) as url:
        base = url.replace("localhost", "127.0.0.1")
        vals = {}
        for _ in range(rep):
            for nome, caminho in (("pagina", ""), ("dados", "dados")):
                rps, falhas = ab(base + caminho)
                vals.setdefault(f"servidor.{nome}_req_s", []).append(rps)
                vals.setdefault(f"servidor.{nome}_falhas", []).append(falhas)
            perdidas, erros = escritas_concorrentes(base)
            vals.setdefault("servidor.escritas_perdidas_de_20", []).append(perdidas)
            vals.setdefault("servidor.escritas_com_erro_de_20", []).append(erros)
        return vals


# ---------------------------------------------------------------- relatório

# chave: (rótulo, unidade, menor é melhor)
METRICAS = {
    "carga.fria.fcp_ms": ("1ª visita: primeira pintura", "ms", True),
    "carga.fria.numeros_ms": ("1ª visita: números na tela", "ms", True),
    "carga.repetida.fcp_ms": ("Visita repetida: primeira pintura", "ms", True),
    "carga.repetida.numeros_ms": ("Visita repetida: números na tela", "ms", True),
    "carga.fria.kb": ("1ª visita: transferido", "KB", True),
    "carga.fria.requisicoes": ("1ª visita: requisições", "", True),
    "ocioso_cpu1x.cpu_ms_min": ("Aba aberta: CPU", "ms/min", True),
    "ocioso_cpu1x.script_ms_min": ("Aba aberta: JavaScript", "ms/min", True),
    "ocioso_cpu1x.estilo_layout_ms_min": ("Aba aberta: estilo+layout", "ms/min", True),
    "ocioso_cpu1x.recalc_estilo_min": ("Aba aberta: recálculos de estilo", "/min", True),
    "ocioso_cpu1x.layouts_min": ("Aba aberta: layouts", "/min", True),
    "ocioso_cpu1x.heap_mb": ("Aba aberta: heap JS", "MB", True),
    "ocioso_cpu4x.cpu_ms_min": ("Aba aberta, CPU 4x lenta: CPU", "ms/min", True),
    "fundo.cpu_ms_min": ("Aba em segundo plano: CPU", "ms/min", True),
    "fundo.script_ms_min": ("Aba em segundo plano: JavaScript", "ms/min", True),
    "historico.abrir_ms": ("Histórico (12 meses): abrir", "ms", True),
    "historico.mudar_mes_ms": ("Histórico (12 meses): trocar de mês", "ms", True),
    "estatisticas.abrir_ms": ("Estatísticas (12 meses): abrir", "ms", True),
    "a11y.contraste_baixo_dark": ("Textos abaixo do contraste AA, tema escuro", "", True),
    "a11y.contraste_baixo_light": ("Textos abaixo do contraste AA, tema claro", "", True),
    "servidor.pagina_req_s": ("Servidor: GET / ", "req/s", False),
    "servidor.dados_req_s": ("Servidor: GET /dados", "req/s", False),
    "servidor.escritas_perdidas_de_20": ("20 gravações simultâneas: perdidas", "", True),
    "servidor.escritas_com_erro_de_20": ("20 gravações simultâneas: com erro", "", True),
}


def lighthouse(rotulo):
    f = RESULTADOS / f"lighthouse-{rotulo}.json"
    if not f.exists():
        return {}
    cats = json.loads(f.read_text())["categories"]
    return {f"lighthouse.{k}": [round(v["score"] * 100)] for k, v in cats.items()}


def fmt(v):
    if v is None:
        return "—"
    return f"{v:,.0f}".replace(",", ".") if abs(v) >= 100 else f"{v:.2f}".rstrip("0").rstrip(".").replace(".", ",")


def comparar(a, b):
    ra = json.loads((RESULTADOS / f"{a}.json").read_text())["metricas"] | lighthouse(a)
    rb = json.loads((RESULTADOS / f"{b}.json").read_text())["metricas"] | lighthouse(b)
    rotulos = METRICAS | {k: (f"Lighthouse: {k.split('.')[1]}", "pontos", False)
                          for k in sorted(ra.keys() | rb.keys()) if k.startswith("lighthouse.")}
    print(f"| Métrica (mediana) | {a} | {b} | Variação |\n|---|---:|---:|---:|")
    for k, (rot, un, menor) in rotulos.items():
        va = statistics.median(ra[k]) if k in ra else None
        vb = statistics.median(rb[k]) if k in rb else None
        if va is None and vb is None:
            continue
        var = ""
        if va is not None and vb is not None and va != vb:
            var = f"{(vb - va) / va * 100:+.0f}%" if va else "novo"
            var += " ✓" if (vb < va) == menor else " ✗"
        print(f"| {rot} ({un}) | {fmt(va)} | {fmt(vb)} | {var} |".replace(" ()", ""))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--rotulo")
    p.add_argument("--app", type=Path, default=PASTA)
    p.add_argument("--repeticoes", type=int, default=7, help="para carga, histórico e servidor")
    p.add_argument("--ociosas", type=int, default=3, help="repetições dos cenários de aba parada")
    p.add_argument("--segundos", type=int, default=30, help="duração de cada cenário de aba parada")
    p.add_argument("--so", nargs="*", default=["carga", "ocioso", "lento", "fundo", "historico", "servidor"])
    p.add_argument("--comparar", nargs=2, metavar=("A", "B"))
    p.add_argument("--servir", type=Path, metavar="APP", help="deixa uma cópia no ar até o Ctrl+C")
    args = p.parse_args()

    if args.servir:
        with servir(args.servir.resolve(), registro_ficticio(1)) as url:
            print(f"{url} (dados fictícios) · Ctrl+C para parar", flush=True)
            with contextlib.suppress(KeyboardInterrupt):
                threading.Event().wait()
        return 0
    if args.comparar:
        return comparar(*args.comparar)
    if not args.rotulo:
        p.error("--rotulo, --comparar ou --servir")

    app = args.app.resolve()
    metricas, contraste_baixo = {}, {}
    with servir(app, registro_ficticio(1)) as url:
        if "carga" in args.so:
            print("carga…", flush=True)
            m, contraste_baixo = cenario_carga(url, args.repeticoes)
            metricas |= m
        if "ocioso" in args.so:
            print("aba aberta…", flush=True)
            metricas |= cenario_ocioso(url, args.ociosas, args.segundos)
        if "lento" in args.so:
            print("aba aberta, CPU 4x lenta…", flush=True)
            metricas |= cenario_ocioso(url, args.ociosas, args.segundos, cpu=4)
        if "fundo" in args.so:
            print("aba em segundo plano…", flush=True)
            metricas |= cenario_ocioso(url, args.ociosas, args.segundos, fundo=True)
    if "historico" in args.so:
        print("histórico…", flush=True)
        metricas |= cenario_historico(app, args.repeticoes)
    if "servidor" in args.so:
        print("servidor…", flush=True)
        metricas |= cenario_servidor(app, min(args.repeticoes, 3))

    RESULTADOS.mkdir(exist_ok=True)
    versao = subprocess.run(["google-chrome", "--version"], capture_output=True, text=True).stdout.strip()
    destino = RESULTADOS / f"{args.rotulo}.json"
    destino.write_text(json.dumps({
        "rotulo": args.rotulo, "app": os.path.relpath(app, PASTA),
        "quando": dt.datetime.now().isoformat(timespec="seconds"), "chrome": versao,
        "segundos_por_cenario_parado": args.segundos, "metricas": metricas,
        "contraste_baixo": contraste_baixo,
    }, indent=1, ensure_ascii=False))
    print(f"\nsalvo em {destino}")
    for k, v in metricas.items():
        print(f"  {k}: {fmt(statistics.median(v))}")


if __name__ == "__main__":
    sys.exit(main())
