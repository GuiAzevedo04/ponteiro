#!/usr/bin/env python3
"""Serve a página de horas em http://localhost:8765 e guarda os dados em dados/registro.json.

Só usa a biblioteca padrão (Python 3.8 ou mais novo). Rodar com: python3 servidor.py
HORAS_PORTA troca a porta (o bench usa isso para rodar uma cópia ao lado).
"""
import sys

if sys.version_info < (3, 8):
    sys.exit("O servidor de horas precisa do Python 3.8 ou mais novo.")

import json
import os
import re
import shutil
import tempfile
import threading
import time
import traceback
from datetime import date, datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

PASTA = Path(__file__).resolve().parent
PORTA = int(os.environ.get("HORAS_PORTA", 8765))
MANTER_DIAS = 365
LIMITE_CORPO = 5 * 1024 * 1024
VAZIO = {"versao": 0, "campos": {}, "registro": {}}
# Os backups só se leem, e só pela data: o nome do arquivo nunca vem da rede
UM_BACKUP = re.compile(r"/dados/backups/([0-9]{4}-[0-9]{2}-[0-9]{2})")
# Cotações do dia (exchangerate-api.com, grátis e sem conta), com base no dólar.
# É a única ida à internet, e não leva nada dos seus dados
CAMBIO_URL = "https://open.er-api.com/v6/latest/USD"
CAMBIO_ESPERA = 600  # sem internet, tenta de novo a cada 10 min, não a cada F5

# Só isto é servido: nada de servidor.py, registro.json ou backups pela rede
IDIOMAS = ("pt", "en")
FONTES = ("plex-sans-latin-400", "plex-sans-latin-600")
ESTATICOS = {
    **{f"/idiomas/{i}.js": f"idiomas/{i}.js" for i in IDIOMAS},
    **{f"/fontes/{f}.woff2": f"fontes/{f}.woff2" for f in FONTES},
    "/": "index.html",
    "/index.html": "index.html",
    "/estilo.css": "estilo.css",
    "/app.js": "app.js",
    "/calculo.js": "calculo.js",
    "/graficos.js": "graficos.js",
    "/feriados.js": "feriados.js",
    "/sw.js": "sw.js",
    "/inicio.js": "inicio.js",
    "/icone.svg": "icone.svg",
    "/manifest.webmanifest": "manifest.webmanifest",
}

# Tipo fixo por extensão: o mimetypes aceita o que o sistema disser, e com
# nosniff o navegador recusa um módulo com o tipo errado
TIPOS = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".webmanifest": "application/manifest+json",
}

SEGURANCA = {
    "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; "
                               "img-src 'self' data:; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
}


def buscar_cambio(url=CAMBIO_URL):
    """As cotações do dia, ou None se a internet ou o serviço falharem."""
    try:
        with urlopen(url, timeout=5) as r:
            bruto = json.loads(r.read())
        if bruto.get("result") != "success":
            return None
        taxas = {k: v for k, v in bruto["rates"].items()
                 if isinstance(k, str) and isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0}
        return {
            "data": datetime.fromtimestamp(bruto["time_last_update_unix"], timezone.utc).date().isoformat(),
            "proxima": int(bruto["time_next_update_unix"]),
            "base": bruto["base_code"],
            "taxas": taxas,
        }
    except (OSError, ValueError, KeyError, TypeError, AttributeError, OverflowError):
        return None


class Servidor(ThreadingHTTPServer):
    # O padrão do socketserver (5) faz o kernel derrubar conexões numa rajada
    # de requisições, como várias abas sincronizando ao mesmo tempo
    request_queue_size = 64

    def __init__(self, pasta=PASTA, porta=PORTA):
        super().__init__(("127.0.0.1", porta), Handler)
        self.pasta = Path(pasta)
        self.dados = self.pasta / "dados"
        self.dados.mkdir(exist_ok=True)
        self.arquivo = self.dados / "registro.json"
        self.backups = self.dados / "backups"
        porta = self.server_address[1]
        self.hosts = {f"localhost:{porta}", f"127.0.0.1:{porta}"}
        self.origens = {f"http://{h}" for h in self.hosts}
        # Ler, comparar a versão e gravar precisa ser uma coisa só
        self.trava = threading.Lock()
        self._cache = (None, b"", 0)
        self.arquivo_cambio = self.dados / "cambio.json"
        self.trava_cambio = threading.Lock()
        self._tentou_cambio = 0.0

    def ler_bruto(self):
        """Bytes do arquivo e a versão; o JSON só é relido quando o arquivo muda.

        O inode entra na chave: o os.replace de cada gravação troca o arquivo,
        então nem uma gravação no mesmo instante passa despercebida.
        """
        try:
            st = self.arquivo.stat()
        except FileNotFoundError:
            return json.dumps(VAZIO).encode(), 0
        chave = (st.st_ino, st.st_mtime_ns, st.st_size)
        if self._cache[0] != chave:
            corpo = self.arquivo.read_bytes()
            self._cache = (chave, corpo, json.loads(corpo).get("versao", 0))
        return self._cache[1], self._cache[2]

    def cambio(self):
        """As cotações guardadas, renovadas quando o serviço já publicou outras.

        Sem internet, devolve as últimas que tiver (ou None, se nunca buscou).
        """
        with self.trava_cambio:
            try:
                atual = json.loads(self.arquivo_cambio.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                atual = None
            vencido = not isinstance(atual, dict) or time.time() >= atual.get("proxima", 0)
            if vencido and time.time() - self._tentou_cambio >= CAMBIO_ESPERA:
                self._tentou_cambio = time.time()
                novo = buscar_cambio()
                if novo:
                    fd, tmp = tempfile.mkstemp(dir=self.dados, prefix=".cambio-", suffix=".tmp")
                    try:
                        with os.fdopen(fd, "w", encoding="utf-8") as f:
                            json.dump(novo, f)
                        os.replace(tmp, self.arquivo_cambio)
                    except OSError:
                        Path(tmp).unlink(missing_ok=True)
                    atual = novo
            return atual if isinstance(atual, dict) else None

    def gravar(self, dados):
        self.guardar_backup_do_dia()
        # Temporário com nome único (dois PUTs ao mesmo tempo não dividem o
        # arquivo) e fsync antes da troca: desligar no meio não corrompe nada
        fd, tmp = tempfile.mkstemp(dir=self.dados, prefix=".registro-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(dados, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.arquivo)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
        # Garante a troca no disco
        pasta = os.open(self.dados, os.O_RDONLY)
        try:
            os.fsync(pasta)
        finally:
            os.close(pasta)

    def guardar_backup_do_dia(self):
        """Antes da primeira gravação de cada dia, guarda o arquivo como estava."""
        destino = self.backups / f"registro-{date.today().isoformat()}.json"
        if destino.exists() or not self.arquivo.exists():
            return
        self.backups.mkdir(exist_ok=True)
        shutil.copy2(self.arquivo, destino)
        limite = (date.today() - timedelta(days=MANTER_DIAS)).isoformat()
        for velho in self.backups.glob("registro-????-??-??.json"):
            if velho.name[9:19] < limite:
                velho.unlink()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, request, endereco, servidor):
        super().__init__(request, endereco, servidor, directory=servidor.pasta / "pagina")

    def guess_type(self, path):
        return TIPOS.get(Path(path).suffix, "application/octet-stream")

    def end_headers(self):
        for nome, valor in SEGURANCA.items():
            self.send_header(nome, valor)
        if not urlsplit(self.path).path.startswith("/dados"):
            # Sempre revalida (um 304 é barato): versão nova aparece no próximo F5
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def permitido(self):
        """Barra outros sites e DNS rebinding; sem CORS, ninguém de fora lê a resposta."""
        if self.headers.get("Host") not in self.server.hosts:
            self.send_error(421, "Host desconhecido")
            return False
        origem = self.headers.get("Origin")
        site = self.headers.get("Sec-Fetch-Site")
        if (origem and origem not in self.server.origens) or (site and site not in ("same-origin", "none")):
            self.send_error(403, "Só a própria página pode usar /dados")
            return False
        return True

    def do_GET(self):
        self.servir(cabecalho_apenas=False)

    def do_HEAD(self):
        self.servir(cabecalho_apenas=True)

    def servir(self, cabecalho_apenas):
        if not self.permitido():
            return
        caminho = urlsplit(self.path).path
        if caminho == "/dados":
            with self.server.trava:
                corpo, versao = self.server.ler_bruto()
            return self.responder_dados(200, corpo, versao, cabecalho_apenas)
        if caminho == "/dados/cambio":
            cambio = self.server.cambio()
            if cambio is None:
                return self.send_error(503, "Sem cotação: o servidor não alcançou a internet")
            return self.responder_dados(200, json.dumps(cambio).encode(), None, cabecalho_apenas)
        if caminho == "/dados/backups":
            datas = sorted((p.name[9:19] for p in self.server.backups.glob("registro-????-??-??.json")), reverse=True)
            return self.responder_dados(200, json.dumps(datas).encode(), None, cabecalho_apenas)
        m = UM_BACKUP.fullmatch(caminho)
        if m:
            try:
                corpo = (self.server.backups / f"registro-{m[1]}.json").read_bytes()
            except FileNotFoundError:
                return self.send_error(404)
            return self.responder_dados(200, corpo, None, cabecalho_apenas)
        arquivo = ESTATICOS.get(caminho)
        if not arquivo:
            return self.send_error(404)
        self.path = "/" + arquivo
        return super().do_HEAD() if cabecalho_apenas else super().do_GET()

    def responder_dados(self, status, corpo, versao, cabecalho_apenas=False):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        if versao is not None:
            self.send_header("ETag", f'"{versao}"')
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not cabecalho_apenas:
            self.wfile.write(corpo)

    def do_PUT(self):
        if not self.permitido():
            return
        if urlsplit(self.path).path != "/dados":
            return self.send_error(404)
        if self.headers.get_content_type() != "application/json":
            return self.send_error(415, "Esperava application/json")
        try:
            tamanho = int(self.headers.get("Content-Length", 0))
        except ValueError:
            tamanho = -1
        # Negativo faria o read esperar até a conexão fechar
        if tamanho < 0:
            return self.send_error(400, "Content-Length inválido")
        if tamanho > LIMITE_CORPO:
            return self.send_error(413)
        try:
            dados = json.loads(self.rfile.read(tamanho))
            if not isinstance(dados, dict) or not isinstance(dados.get("registro"), dict):
                raise ValueError
        except ValueError:
            return self.send_error(400, "JSON inválido")

        # Cada gravação diz em cima de qual versão foi feita. Se outra aba (ou
        # um navegador que ficou sem servidor) gravou antes, devolve o atual
        # para o cliente juntar as mudanças, em vez de apagar as da outra.
        esperado = self.headers.get("If-Match")
        if not esperado:
            return self.send_error(428, "Falta If-Match")
        with self.server.trava:
            corpo, versao = self.server.ler_bruto()
            if esperado != f'"{versao}"':
                return self.responder_dados(409, corpo, versao)
            dados["versao"] = versao + 1
            try:
                self.server.gravar(dados)
            except OSError:
                # Disco cheio, arquivo preso: a página guarda a mudança e tenta de novo
                traceback.print_exc()
                return self.send_error(500, "Não deu para gravar registro.json")
        self.send_response(204)
        self.send_header("ETag", f'"{dados["versao"]}"')
        self.end_headers()

    def do_OPTIONS(self):
        self.send_error(405)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    servidor = Servidor()
    print(f"Horas em http://localhost:{PORTA} · dados em {servidor.arquivo}", flush=True)
    servidor.serve_forever()
