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

## Onde mudar o quê

| Para mudar | Arquivo |
|---|---|
| Textos da tela | `idiomas/pt.js` e `idiomas/en.js` (as mesmas chaves nos dois) |
| Cores, tamanhos e espaços | `estilo.css` (as cores ficam no começo, em `:root`) |
| Feriados nacionais | `feriados.js` (os da cidade vão em Ajustes) |
| Contas: saldo, bolsa, hora de sair | `calculo.js`, com testes em `testes/` |
| Telas e botões | `index.html` (o que aparece) e `app.js` (o que faz) |
| Gráficos das estatísticas | `graficos.js` |
| Seus dados | `registro.json`; prefira mudar pela página |

O servidor só entrega os arquivos da lista `ESTATICOS` em `servidor.py`, e a
página só abre sem servidor com os da lista `ARQUIVOS` em `sw.js`: um arquivo
novo entra nas duas. Depois de mudar o `servidor.py`, rode
`systemctl --user restart horas.service`.

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

## Feriados, moeda e idioma

Tudo isso fica em Ajustes.

- **Feriados:** os nacionais do Brasil, mais os feriados extras. Os extras
  valem por cima dos nacionais: o feriado da cidade, um recesso, ou um dia
  que vira de trabalho.
- **Moeda da bolsa e "Mostrar em":** real ou dólar. A bolsa fica guardada na
  moeda em que se recebe. Com "Mostrar em" diferente, todos os valores
  aparecem convertidos pela cotação do dia. Quem busca a cotação é o
  servidor, uma vez por dia, em `open.er-api.com` (grátis, sem conta), e
  guarda em `cambio.json`. É a única ida do app à internet e não leva nada
  dos seus dados. Sem internet, vale a última cotação; sem cotação nenhuma,
  os valores ficam na moeda da bolsa. Meses passados também usam a cotação
  de hoje.
- **Idioma:** português ou inglês. Na primeira visita vale o do navegador.
  Datas, horários e dinheiro seguem o idioma (5:00 PM em inglês, 17:00 em
  português); o que fica guardado em `registro.json` não muda.
- **Duração do almoço:** dá para digitar `1h30`, `1:30`, `1,5`, `1.5 hours`
  ou `35 min`, nos dois idiomas.
- **CSV:** em português, separado por `;` com vírgula decimal; em inglês, por
  `,` com ponto.

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

## Fontes

A IBM Plex Sans vem junto em `fontes/`, com a licença OFL em `fontes/OFL.txt`.
