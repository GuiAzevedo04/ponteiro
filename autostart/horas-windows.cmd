@echo off
rem Windows: abre o servidor de horas sem janela.
rem Para iniciar com o Windows: Win+R, shell:startup, e crie ali um atalho para este arquivo.
where pyw >nul 2>nul
if %errorlevel%==0 (
  start "" pyw -3 "%~dp0..\servidor.py"
) else (
  start "" pythonw "%~dp0..\servidor.py"
)
