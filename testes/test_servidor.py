import http.client
import io
import json
import shutil
import sys
import tempfile
import threading
import unittest
from unittest import mock
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import servidor  # noqa: E402

INICIAL = {"versao": 3, "campos": {"horasSemana": "30"},
           "registro": {"2026-10-06": {"entrada": "09:00", "saida": "17:00", "meta": 6}}}


RESPOSTA_CAMBIO = {"result": "success", "base_code": "USD", "time_last_update_unix": 1792627351,
                   "time_next_update_unix": 1792715501, "rates": {"USD": 1, "BRL": 5.0246, "EUR": 0.8903}}


def resposta(obj):
    return io.BytesIO(json.dumps(obj).encode())


class ServidorTest(unittest.TestCase):
    def setUp(self):
        # Teste nenhum vai à internet: quem quer cotação diz qual
        self.internet = mock.patch.object(servidor, "urlopen", side_effect=OSError("sem rede"))
        self.urlopen = self.internet.start()
        self.addCleanup(self.internet.stop)
        self.pasta = Path(tempfile.mkdtemp())
        for nome in ("index.html", "app.js", "feriados.js", "servidor.py", "fontes/plex-sans-latin-400.woff2"):
            (self.pasta / nome).parent.mkdir(exist_ok=True)
            (self.pasta / nome).write_text(f"conteúdo de {nome}", encoding="utf-8")
        (self.pasta / "registro.json").write_text(json.dumps(INICIAL), encoding="utf-8")
        self.srv = servidor.Servidor(self.pasta, 0)
        self.porta = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        shutil.rmtree(self.pasta)

    def pedir(self, metodo, caminho, corpo=None, **cabecalhos):
        cab = {"Host": f"localhost:{self.porta}"}
        if corpo is not None:
            cab["Content-Type"] = "application/json"
            corpo = json.dumps(corpo).encode()
        cab.update({k.replace("_", "-"): v for k, v in cabecalhos.items()})
        con = http.client.HTTPConnection("127.0.0.1", self.porta, timeout=10)
        try:
            con.request(metodo, caminho, corpo, cab)
            r = con.getresponse()
            return r.status, r.read(), r.headers
        finally:
            con.close()

    def no_disco(self):
        return json.loads((self.pasta / "registro.json").read_text(encoding="utf-8"))

    def novo_dia(self, dados, dia):
        dados = json.loads(json.dumps(dados))
        dados["registro"][dia] = {"entrada": "08:00", "saida": "14:00", "meta": 6}
        return dados

    # ------------------------------------------------------------ segurança

    def test_nao_manda_cors(self):
        status, _, cab = self.pedir("GET", "/dados")
        self.assertEqual(status, 200)
        self.assertIsNone(cab["Access-Control-Allow-Origin"])

    def test_outro_site_nao_le(self):
        status, _, _ = self.pedir("GET", "/dados", Origin="https://evil.example")
        self.assertEqual(status, 403)
        status, _, _ = self.pedir("GET", "/dados", Sec_Fetch_Site="cross-site")
        self.assertEqual(status, 403)

    def test_outro_site_nao_grava(self):
        status, _, _ = self.pedir("PUT", "/dados", self.novo_dia(INICIAL, "2026-10-07"),
                                  Origin="https://evil.example", If_Match='"3"')
        self.assertEqual(status, 403)
        self.assertEqual(self.no_disco(), INICIAL)

    def test_a_propria_pagina_grava(self):
        status, _, _ = self.pedir("PUT", "/dados", self.novo_dia(INICIAL, "2026-10-07"),
                                  Origin=f"http://localhost:{self.porta}", Sec_Fetch_Site="same-origin",
                                  If_Match='"3"')
        self.assertEqual(status, 204)

    def test_host_estranho_dns_rebinding(self):
        status, _, _ = self.pedir("GET", "/dados", Host=f"evil.example:{self.porta}")
        self.assertEqual(status, 421)

    def test_so_arquivos_da_lista(self):
        for caminho in ("/servidor.py", "/registro.json", "/backups/", "/../registro.json", "/testes/"):
            with self.subTest(caminho=caminho):
                self.assertEqual(self.pedir("GET", caminho)[0], 404)
        for caminho in ("/", "/index.html?x=1", "/app.js", "/feriados.js", "/dados?t=1"):
            with self.subTest(caminho=caminho):
                self.assertEqual(self.pedir("GET", caminho)[0], 200)
        # A pasta das fontes não lista nem serve o que não estiver na lista
        for caminho in ("/fontes/", "/fontes/OFL.txt"):
            with self.subTest(caminho=caminho):
                self.assertEqual(self.pedir("GET", caminho)[0], 404)

    def test_fonte_com_tipo_proprio(self):
        status, _, cab = self.pedir("GET", "/fontes/plex-sans-latin-400.woff2")
        self.assertEqual(status, 200)
        self.assertEqual(cab["Content-Type"], "font/woff2")

    def test_cabecalhos_de_seguranca(self):
        _, _, cab = self.pedir("GET", "/")
        self.assertIn("frame-ancestors 'none'", cab["Content-Security-Policy"])
        self.assertEqual(cab["X-Content-Type-Options"], "nosniff")

    # ------------------------------------------------------------ gravação

    def test_get_manda_versao_no_etag(self):
        _, corpo, cab = self.pedir("GET", "/dados")
        self.assertEqual(cab["ETag"], '"3"')
        self.assertEqual(json.loads(corpo), INICIAL)

    def test_put_sem_if_match(self):
        status, _, _ = self.pedir("PUT", "/dados", self.novo_dia(INICIAL, "2026-10-07"))
        self.assertEqual(status, 428)
        self.assertEqual(self.no_disco(), INICIAL)

    def test_put_desatualizado_devolve_o_atual(self):
        status, corpo, cab = self.pedir("PUT", "/dados", self.novo_dia(INICIAL, "2026-10-07"), If_Match='"2"')
        self.assertEqual(status, 409)
        self.assertEqual(json.loads(corpo), INICIAL)
        self.assertEqual(cab["ETag"], '"3"')
        self.assertEqual(self.no_disco(), INICIAL)

    def test_put_incrementa_versao(self):
        status, _, cab = self.pedir("PUT", "/dados", self.novo_dia(INICIAL, "2026-10-07"), If_Match='"3"')
        self.assertEqual((status, cab["ETag"]), (204, '"4"'))
        disco = self.no_disco()
        self.assertEqual(disco["versao"], 4)
        self.assertIn("2026-10-07", disco["registro"])

    def test_corpo_invalido(self):
        con = http.client.HTTPConnection("127.0.0.1", self.porta)
        con.request("PUT", "/dados", b"{quebrado", {"Host": f"localhost:{self.porta}",
                                                     "Content-Type": "application/json", "If-Match": '"3"'})
        self.assertEqual(con.getresponse().status, 400)
        con.close()
        status, _, _ = self.pedir("PUT", "/dados", {"sem": "registro"}, If_Match='"3"')
        self.assertEqual(status, 400)
        status, _, _ = self.pedir("PUT", "/dados", INICIAL, If_Match='"3"', Content_Type="text/plain")
        self.assertEqual(status, 415)

    def test_gravacoes_simultaneas_nao_se_perdem(self):
        """20 clientes gravam ao mesmo tempo; com If-Match + nova tentativa, todos sobrevivem."""
        n = 20
        barreira = threading.Barrier(n)
        erros = []

        def cliente(i):
            try:
                _, corpo, cab = self.pedir("GET", "/dados")
                dados, etag = json.loads(corpo), cab["ETag"]
                barreira.wait()
                for _ in range(n * 2):
                    status, corpo, cab = self.pedir("PUT", "/dados", self.novo_dia(dados, f"2031-01-{i + 1:02d}"),
                                                    If_Match=etag)
                    if status == 409:
                        dados, etag = json.loads(corpo), cab["ETag"]
                        continue
                    if status != 204:
                        erros.append(status)
                    return
                erros.append("desistiu")
            except OSError as e:  # conexão derrubada também é erro, não pode sumir na thread
                erros.append(repr(e))

        threads = [threading.Thread(target=cliente, args=(i,)) for i in range(n)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(erros, [])
        disco = self.no_disco()
        self.assertEqual(sum(k.startswith("2031-01-") for k in disco["registro"]), n)
        self.assertEqual(disco["versao"], 3 + n)
        self.assertEqual(list(self.pasta.glob("*.tmp")), [])

    # ------------------------------------------------------------ outros sistemas

    def test_tipo_do_js_nao_depende_do_sistema(self):
        """No Windows o mimetypes pode dizer text/plain para .js: o módulo não carregaria."""
        with mock.patch("mimetypes.guess_type", return_value=("text/plain", None)):
            _, _, cab = self.pedir("GET", "/app.js")
            self.assertEqual(cab["Content-Type"], "text/javascript; charset=utf-8")
            _, _, cab = self.pedir("GET", "/")
            self.assertEqual(cab["Content-Type"], "text/html; charset=utf-8")

    def test_grava_no_windows(self):
        """Sem fsync de pasta (o Windows não abre pasta) e com o arquivo preso por um instante."""
        troca_de_verdade = servidor.os.replace
        falhas = iter([PermissionError("preso pelo antivírus")] * 2)

        def replace_preso(origem, destino):
            erro = next(falhas, None)
            if erro:
                raise erro
            return troca_de_verdade(origem, destino)

        abriu_pasta = []
        open_de_verdade = servidor.os.open

        def open_vigiado(caminho, *a, **kw):
            if Path(caminho).is_dir():
                abriu_pasta.append(caminho)
            return open_de_verdade(caminho, *a, **kw)

        with mock.patch.object(servidor.os, "name", "nt"), \
                mock.patch.object(servidor.os, "replace", replace_preso), \
                mock.patch.object(servidor.os, "open", open_vigiado):
            status, _, _ = self.pedir("PUT", "/dados", self.novo_dia(INICIAL, "2026-10-07"), If_Match='"3"')
        self.assertEqual(status, 204)
        self.assertIn("2026-10-07", self.no_disco()["registro"])
        self.assertEqual(abriu_pasta, [])
        self.assertEqual(list(self.pasta.glob("*.tmp")), [])

    def test_arquivo_preso_de_vez_nao_corrompe(self):
        with mock.patch.object(servidor.os, "replace", side_effect=PermissionError("preso")), \
                mock.patch.object(servidor.time, "sleep"):
            status, _, _ = self.pedir("PUT", "/dados", self.novo_dia(INICIAL, "2026-10-07"), If_Match='"3"')
        self.assertEqual(status, 500)
        self.assertEqual(self.no_disco(), INICIAL)
        self.assertEqual(list(self.pasta.glob("*.tmp")), [])

    # ------------------------------------------------------------ backups

    def test_backup_guarda_o_estado_de_antes_do_dia(self):
        hoje = self.pasta / "backups" / f"registro-{date.today().isoformat()}.json"
        self.pedir("PUT", "/dados", self.novo_dia(INICIAL, "2026-10-07"), If_Match='"3"')
        self.assertEqual(json.loads(hoje.read_text(encoding="utf-8")), INICIAL)
        self.pedir("PUT", "/dados", self.novo_dia(self.no_disco(), "2026-10-08"), If_Match='"4"')
        self.assertEqual(json.loads(hoje.read_text(encoding="utf-8")), INICIAL)

    def test_backup_mantem_o_ultimo_ano(self):
        pasta = self.pasta / "backups"
        pasta.mkdir()
        hoje = date.today()
        for atras in (400, 366, 365, 100, 1):
            dia = (hoje - timedelta(days=atras)).isoformat()
            (pasta / f"registro-{dia}.json").write_text("{}", encoding="utf-8")
        (pasta / "registro.antes-da-reforma.json").write_text("{}", encoding="utf-8")
        self.pedir("PUT", "/dados", self.novo_dia(INICIAL, "2026-10-07"), If_Match='"3"')
        datados = sorted(p.name[9:19] for p in pasta.glob("registro-????-??-??.json"))
        esperados = sorted((hoje - timedelta(days=d)).isoformat() for d in (365, 100, 1, 0))
        self.assertEqual(datados, esperados)
        self.assertTrue((pasta / "registro.antes-da-reforma.json").exists())

    def test_lista_os_backups_do_mais_novo_ao_mais_velho(self):
        status, corpo, _ = self.pedir("GET", "/dados/backups")
        self.assertEqual((status, json.loads(corpo)), (200, []))
        pasta = self.pasta / "backups"
        pasta.mkdir()
        for dia in ("2026-10-20", "2026-10-22", "2026-10-21"):
            (pasta / f"registro-{dia}.json").write_text(json.dumps({"registro": {dia: {}}}), encoding="utf-8")
        (pasta / "registro.antes-da-reforma.json").write_text("{}", encoding="utf-8")
        status, corpo, cab = self.pedir("GET", "/dados/backups")
        self.assertEqual(json.loads(corpo), ["2026-10-22", "2026-10-21", "2026-10-20"])
        self.assertEqual(cab["Cache-Control"], "no-store")

    def test_le_um_backup_pela_data(self):
        pasta = self.pasta / "backups"
        pasta.mkdir()
        (pasta / "registro-2026-10-21.json").write_text(json.dumps(INICIAL), encoding="utf-8")
        status, corpo, _ = self.pedir("GET", "/dados/backups/2026-10-21")
        self.assertEqual((status, json.loads(corpo)), (200, INICIAL))
        for caminho in ("/dados/backups/2026-10-22", "/dados/backups/2026-10-2", "/dados/backups/../registro.json",
                        "/dados/backups/2026-10-21.json", "/dados/backups/%2e%2e", "/dados/backups/"):
            with self.subTest(caminho=caminho):
                self.assertEqual(self.pedir("GET", caminho)[0], 404)

    def test_outro_site_nao_le_os_backups(self):
        for caminho in ("/dados/backups", "/dados/backups/2026-10-21"):
            with self.subTest(caminho=caminho):
                self.assertEqual(self.pedir("GET", caminho, Origin="https://evil.example")[0], 403)
                self.assertEqual(self.pedir("GET", caminho, Host=f"evil.example:{self.porta}")[0], 421)

    # ------------------------------------------------------------ câmbio

    def test_cambio_busca_e_guarda(self):
        self.urlopen.side_effect = None
        self.urlopen.return_value = resposta(RESPOSTA_CAMBIO)
        status, corpo, _ = self.pedir("GET", "/dados/cambio")
        esperado = {"data": "2026-10-22", "proxima": 1792715501, "base": "USD",
                    "taxas": {"USD": 1, "BRL": 5.0246, "EUR": 0.8903}}
        self.assertEqual((status, json.loads(corpo)), (200, esperado))
        self.assertEqual(json.loads((self.pasta / "cambio.json").read_text(encoding="utf-8")), esperado)

    def test_cambio_do_dia_nao_busca_de_novo(self):
        guardado = {"data": "2026-10-22", "proxima": 4102444800, "base": "USD", "taxas": {"USD": 1, "BRL": 5}}
        (self.pasta / "cambio.json").write_text(json.dumps(guardado), encoding="utf-8")
        status, corpo, _ = self.pedir("GET", "/dados/cambio")
        self.assertEqual((status, json.loads(corpo)), (200, guardado))
        self.urlopen.assert_not_called()

    def test_cambio_sem_internet_usa_o_ultimo(self):
        velho = {"data": "2026-10-01", "proxima": 0, "base": "USD", "taxas": {"USD": 1, "BRL": 5.4}}
        (self.pasta / "cambio.json").write_text(json.dumps(velho), encoding="utf-8")
        status, corpo, _ = self.pedir("GET", "/dados/cambio")
        self.assertEqual((status, json.loads(corpo)), (200, velho))
        # E não insiste a cada pedido enquanto a rede não volta
        self.pedir("GET", "/dados/cambio")
        self.assertEqual(self.urlopen.call_count, 1)

    def test_cambio_nunca_buscado_e_sem_internet(self):
        self.assertEqual(self.pedir("GET", "/dados/cambio")[0], 503)

    def test_cambio_resposta_estranha_nao_estraga_o_guardado(self):
        self.urlopen.side_effect = None
        for ruim in ({"result": "error"}, {"result": "success"}, {"result": "success", "rates": "x"}):
            with self.subTest(ruim=ruim):
                self.urlopen.return_value = resposta(ruim)
                self.assertIsNone(servidor.buscar_cambio())
        self.urlopen.return_value = resposta({**RESPOSTA_CAMBIO, "rates": {"USD": 1, "BRL": "5", "XXX": -1, "EUR": True}})
        self.assertEqual(servidor.buscar_cambio()["taxas"], {"USD": 1})

    def test_outro_site_nao_le_o_cambio(self):
        self.assertEqual(self.pedir("GET", "/dados/cambio", Origin="https://evil.example")[0], 403)

    def test_sem_arquivo_comeca_vazio(self):
        (self.pasta / "registro.json").unlink()
        _, corpo, cab = self.pedir("GET", "/dados")
        self.assertEqual(json.loads(corpo), {"versao": 0, "campos": {}, "registro": {}})
        self.assertEqual(cab["ETag"], '"0"')


if __name__ == "__main__":
    unittest.main()
