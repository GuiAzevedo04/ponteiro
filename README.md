# Horas

Controle de horas trabalhadas, saldo da semana e bolsa do mês. É uma página
servida por um servidor pequeno em Python, que guarda tudo em `registro.json`
nesta pasta. Nada sai do computador.

## Requisitos

- Python 3.8 ou mais novo, só a biblioteca padrão.
- Um navegador atual: Chrome, Edge, Firefox ou Safari.
- Linux, macOS, FreeBSD ou Windows.

## Rodar

| Sistema | Comando, dentro da pasta `horas` |
|---|---|
| Linux, FreeBSD | `python3 servidor.py` |
| macOS | `python3 servidor.py` (o do Homebrew ou o do python.org) |
| Windows | `py servidor.py` (instalador do python.org) ou `python servidor.py` |

Depois é só abrir http://localhost:8765. Para usar outra porta, defina
`HORAS_PORTA` antes de rodar.

## Iniciar junto com o sistema

Os arquivos prontos ficam em `autostart/`. Em todos, confira o caminho da
pasta `horas` e o do Python antes de instalar.

- **Linux (systemd).** Copie `autostart/horas.service` para
  `~/.config/systemd/user/` e rode `systemctl --user enable --now horas.service`.
  Depois de mudar o `servidor.py`, rode `systemctl --user restart horas.service`.
- **macOS (launchd).** Troque `SEU_USUARIO` em
  `autostart/com.horas.servidor.plist`, copie o arquivo para
  `~/Library/LaunchAgents/` e rode
  `launchctl load ~/Library/LaunchAgents/com.horas.servidor.plist`.
  Deixe a pasta `horas` fora de Documentos, Mesa e Downloads. O macOS impede,
  sem aviso, que um programa iniciado pelo launchd leia essas pastas.
- **Windows.** Aperte Win+R, digite `shell:startup` e crie, na pasta que abrir,
  um atalho para `autostart\horas-windows.cmd`. Ele abre o servidor com
  `pythonw`, sem janela. Para parar o servidor, encerre o `pythonw.exe` no
  Gerenciador de Tarefas.
- **FreeBSD (e outros Unix sem systemd).** Instale o Python com
  `pkg install python3`, rode `crontab -e` e acrescente a linha de
  `autostart/freebsd-crontab.txt`.

## País, feriados e moeda

Em Ajustes ficam o país, as moedas e os feriados extras.

- **Países:** Brasil, Estados Unidos, México, França, Portugal, Rússia, China,
  Japão, Egito, Índia e Bangladesh, ou nenhum (só os feriados extras). O país
  decide os feriados, o fim de semana (sexta e sábado no Egito e em
  Bangladesh, com a semana começando no domingo) e a moeda padrão.
- **Moeda da bolsa e "Mostrar em":** a bolsa fica guardada na moeda em que
  se recebe (a do país, se não escolher outra). Com "Mostrar em" diferente,
  todos os valores aparecem convertidos pela cotação do dia. Quem busca a
  cotação é o servidor, uma vez por dia, em `open.er-api.com` (grátis, sem
  conta), e guarda em `cambio.json`. É a única ida do app à internet e não
  leva nada dos seus dados. Sem internet, vale a última cotação; sem
  cotação nenhuma, os valores ficam na moeda da bolsa. Meses passados
  também usam a cotação de hoje.
- **Feriados extras:** valem por cima dos do país. Servem para o feriado da
  cidade, um recesso, um feriado que o governo mudou de dia, ou um dia que
  vira de trabalho (como os sábados de troca na China).
- **Datas que dependem da lua:** as islâmicas do Egito saem do calendário
  Umm al-Qura e podem cair um dia antes ou depois da data anunciada. Nesse
  caso, ajuste com um feriado extra.
- **Tabelas oficiais:** os calendários que o governo publica ano a ano
  (China e Rússia, com as trocas de dia) e as datas lunares de Índia e
  Bangladesh ficam em `feriados-tabelas.js`, gerado pelo pacote Python
  `holidays`. Quando a China publicar o calendário de um ano novo (em
  novembro), gere de novo:

  ```sh
  python3 -m venv /tmp/v && /tmp/v/bin/pip install holidays
  /tmp/v/bin/python ferramentas/tabelas_feriados.py > feriados-tabelas.js
  /tmp/v/bin/python ferramentas/tabelas_feriados.py --referencia > testes/feriados-referencia.json
  ```

  O app não depende do pacote, só do arquivo gerado.

## Idiomas

Em Ajustes, o idioma da tela: português, inglês, espanhol, francês, russo,
árabe, hindi, bengali, chinês e japonês. Quem chega pela primeira vez recebe o
idioma do navegador.

- **Datas, horários e dinheiro** seguem o idioma (5:00 PM em inglês, 17:00 em
  português), sempre com algarismos 0-9. O que fica guardado em
  `registro.json` não muda com o idioma.
- **Duração do almoço:** dá para digitar no jeito de qualquer idioma, não só
  do que está na tela: `1h30`, `1:30`, `1,5`, `1.5 hours`, `1 ч 30 мин`,
  `1小时30分`, `1時間30分`, `1 घंटा 30 मिनट`, `১ ঘ ৩০ মি`, `١ س ٣٠ د`. Vale a
  vírgula ou o ponto como decimal, e os algarismos de outras escritas.
- **Árabe:** a tela é da direita para a esquerda; a linha do dia e os
  gráficos continuam da esquerda para a direita, como nas planilhas.
- **CSV:** com vírgula decimal, o separador é `;`; com ponto, `,`.
- **Nomes de feriados:** cada idioma traduz os do país em que é falado; os de
  outros países aparecem em inglês.
- **Traduções:** feitas sem revisão de quem fala cada idioma (principalmente
  hindi, bengali e árabe). Os textos ficam em `idiomas/*.js`, um arquivo por
  idioma, todos com as mesmas chaves (`node --test` confere).

Glossário para quem for revisar:

| Termo | Sentido |
|---|---|
| bolsa | valor fixo pago por mês (bolsa de estudos ou salário fixo) |
| meta | horas que o dia ou a semana deveria ter |
| saldo | horas trabalhadas menos a meta: positivo sobra, negativo falta |
| folga | dia sem trabalho que gasta saldo (conta na meta, sem horas) |
| dia fechado | dia com chegada e saída registradas |
| feriado/recesso | dia sem trabalho que sai da meta e da divisão da bolsa |

## Cores para daltonismo

Em Ajustes, "Cores: Para daltonismo" troca o verde e o vermelho do saldo (que
na deuteranopia e na protanopia ficam iguais) por azul e laranja, da paleta
Okabe–Ito, nos dois temas. As cores foram escolhidas para continuar distintas
nos três tipos de daltonismo simulados e com contraste AA, também com filtro
de luz azul ligado. Em qualquer modo, o saldo tem sinal (+/−), o campo com
erro tem borda tracejada, o aviso de saída faltando tem ⚠ e a semana em
andamento nos gráficos tem contorno tracejado.

## Dados e backups

- **Fonte da verdade:** `registro.json`. O navegador guarda uma cópia, para a
  página abrir mesmo com o servidor desligado. O que mudar nesse meio-tempo
  sobe quando o servidor voltar.
- **Backup diário:** antes da primeira gravação de cada dia, o servidor copia
  o arquivo para `backups/` e guarda as cópias do último ano.
- **Restaurar:** em Ajustes, escolha o dia em "Voltar ao começo de".
- **Segurança:** o servidor só atende o próprio computador (127.0.0.1) e só a
  própria página. Outros sites não leem nem gravam os dados.

## Testes

```sh
node --test                                 # contas da página (Node 22+, testado no 24)
python3 -m unittest discover -s testes      # servidor (no Windows: py -m unittest ...)
```

Os testes do servidor também simulam o Windows: o tipo do `.js`, o arquivo
preso por um antivírus e a pasta que não abre para fsync.

`bench/medir.py`, que mede o desempenho num Chrome headless, só roda no Linux.

## Fontes

Latim e cirílico usam a IBM Plex Sans, que vem junto em `fontes/` (licença
OFL em `fontes/OFL.txt`); os outros alfabetos usam as fontes do sistema. No
FreeBSD, e em Linux mínimo, chinês, japonês, hindi, bengali e árabe precisam
de fontes como as Noto (`pkg install noto` no FreeBSD, `noto-fonts` na maioria
dos Linux).
