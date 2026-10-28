#!/usr/bin/env python3
"""Serve a página de horas em http://localhost:8765 e guarda os dados em registro.json.

Só usa a biblioteca padrão. Rodar com: python3 servidor.py
"""
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PASTA = Path(__file__).resolve().parent
ARQUIVO = PASTA / "registro.json"
PORTA = 8765


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PASTA, **kwargs)

    # A página também pode ser aberta direto do arquivo (origem file://),
    # então /dados precisa aceitar outra origem
    def end_headers(self):
        if self.path == "/dados":
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, PUT")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path != "/dados":
            return super().do_GET()
        corpo = ARQUIVO.read_bytes() if ARQUIVO.exists() else b"{}"
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_PUT(self):
        if self.path != "/dados":
            return self.send_error(404)
        corpo = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            dados = json.loads(corpo)
        except ValueError:
            return self.send_error(400, "JSON inválido")

        # Grava num temporário e troca: desligar no meio não corrompe o arquivo
        tmp = ARQUIVO.with_suffix(".tmp")
        tmp.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, ARQUIVO)
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"Horas em http://localhost:{PORTA} · dados em {ARQUIVO}")
    ThreadingHTTPServer(("127.0.0.1", PORTA), Handler).serve_forever()
