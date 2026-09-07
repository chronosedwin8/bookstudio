# Pasa todas las pruebas funcionales y resume el resultado.
#
# Mira el CODIGO DE SALIDA de cada guion, no solo las lineas OK y FAIL. El 7 de
# septiembre de 2026 un guion abortaba a mitad por un dato de prueba invalido:
# como al abortar no imprime ningun FAIL, contando lineas parecia aprobado. Un
# guion que se corta es un fallo, y aqui se ve como tal.
param([switch]$Rapido)

$ErrorActionPreference = 'Continue'
$raiz = Split-Path -Parent $PSScriptRoot

$suites = if ($Rapido) {
  @('smoke-etapa1', 'smoke-clientes', 'smoke-superusuario')
} else {
  Get-ChildItem "$raiz\scripts\smoke-*.ps1" | ForEach-Object { $_.BaseName } | Sort-Object
}

$totalOk = 0
$totalFail = 0
$rotos = @()

foreach ($suite in $suites) {
  $salida = & powershell -ExecutionPolicy Bypass -File "$raiz\scripts\$suite.ps1" 2>&1 |
    ForEach-Object { $_.ToString() }
  $codigo = $LASTEXITCODE

  $ok = @($salida | Where-Object { $_ -match '^\s+OK' }).Count
  $fallos = @($salida | Where-Object { $_ -match '^\s+FAIL' })
  $totalOk += $ok
  $totalFail += $fallos.Count

  $estado = if ($codigo -ne 0 -and $fallos.Count -eq 0) { 'ABORTADO' }
            elseif ($fallos.Count -gt 0) { 'FALLOS' }
            else { 'ok' }
  if ($estado -ne 'ok') { $rotos += $suite }

  $color = if ($estado -eq 'ok') { 'Green' } else { 'Red' }
  Write-Host ("{0,-32} {1,3} OK, {2} FAIL  [{3}]" -f $suite, $ok, $fallos.Count, $estado) -ForegroundColor $color
  foreach ($f in $fallos) { Write-Host "        $f" -ForegroundColor Red }

  if ($estado -eq 'ABORTADO') {
    # Las ultimas lineas dicen donde se corto, que es lo que hace falta.
    $salida | Select-Object -Last 4 | ForEach-Object { Write-Host "        $_" -ForegroundColor DarkYellow }
  }
}

Write-Host ""
Write-Host "TOTAL: $totalOk correctas, $totalFail fallidas" -ForegroundColor $(if ($rotos.Count) { 'Red' } else { 'Green' })
if ($rotos.Count) { Write-Host "Suites con problemas: $($rotos -join ', ')" -ForegroundColor Red }
exit $(if ($rotos.Count) { 1 } else { 0 })
