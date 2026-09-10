# Tablas del lienzo y catalogo ampliado de formas.

$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api'
$ok = 0; $fail = 0

function Check($nombre, $condicion, $detalle = '') {
  if ($condicion) { $script:ok++; Write-Host "  OK   $nombre" -ForegroundColor Green }
  else { $script:fail++; Write-Host "  FAIL $nombre$(if ($detalle) { " -> $detalle" })" -ForegroundColor Red }
}

function Llamar($metodo, $ruta, $cuerpo, $token) {
  $cabeceras = @{}
  if ($token) { $cabeceras['Authorization'] = "Bearer $token" }
  $args = @{ Uri = "$base$ruta"; Method = $metodo; Headers = $cabeceras; ContentType = 'application/json' }
  if ($null -ne $cuerpo) { $args['Body'] = ($cuerpo | ConvertTo-Json -Depth 12) }
  Invoke-RestMethod @args
}

function Codigo($metodo, $ruta, $cuerpo, $token) {
  try { Llamar $metodo $ruta $cuerpo $token | Out-Null; return 200 }
  catch { return [int]$_.Exception.Response.StatusCode }
}

$sufijo = -join ((1..6) | ForEach-Object { [char](97 + (Get-Random -Max 26)) })
$clave = 'Secreto12345'

$docente = Llamar POST '/auth/register' @{ email = "tf-$sufijo@test.local"; password = $clave; fullName = 'Docente Tablas'; role = 'teacher' } $null
$token = $docente.token
$biblioteca = (Llamar POST '/libraries' @{ name = "TF $sufijo" } $token).library
$libro = (Llamar POST '/books' @{ title = "TF $sufijo"; libraryId = $biblioteca.id } $token).book
$pagina = (Llamar GET "/books/$($libro.id)" $null $token).book.pages[0].id

Write-Host "`n== 1. Una tabla en la pagina ==" -ForegroundColor Cyan

$tabla = @{
  celdas = @(, @('Nombre', 'Nota') + , @('Ana', '9') + , @('Luis', '8'))
  filaCabecera = $true; columnaCabecera = $false; diseno = 'rayas'
  colorAcento = '#2563EB'; colorTexto = '#1E293B'; fontSize = 14; alineacion = 'left'
}
$elemento = (Llamar POST "/books/$($libro.id)/pages/$pagina/elements" @{
  type = 'table'
  transformMatrix = @{ x = 8; y = 10; width = 50; height = 34; angle = 0 }
  properties = $tabla
} $token).element

Check 'se inserta como elemento del lienzo' ($elemento.type -eq 'table')
Check 'con sus tres filas' (@($elemento.properties.celdas).Count -eq 3) "$(@($elemento.properties.celdas).Count)"
Check 'y sin ningun marcado dentro' (-not ("$($elemento.properties | ConvertTo-Json -Depth 8)" -match '<'))

Write-Host "`n== 2. Lo que no vale, no entra ==" -ForegroundColor Cyan

$malDiseno = $tabla.Clone(); $malDiseno.diseno = 'neon'
Check 'un diseno inventado se rechaza' ((Codigo POST "/books/$($libro.id)/pages/$pagina/elements" @{
  type = 'table'; transformMatrix = @{ x = 5; y = 60; width = 30; height = 20; angle = 0 }; properties = $malDiseno } $token) -eq 400)

$malaAlineacion = $tabla.Clone(); $malaAlineacion.alineacion = 'diagonal'
Check 'una alineacion inventada tambien' ((Codigo POST "/books/$($libro.id)/pages/$pagina/elements" @{
  type = 'table'; transformMatrix = @{ x = 5; y = 60; width = 30; height = 20; angle = 0 }; properties = $malaAlineacion } $token) -eq 400)

$gigante = $tabla.Clone()
$gigante.celdas = @(1..40 | ForEach-Object { , @('x') })
Check 'una tabla de 40 filas no cabe' ((Codigo POST "/books/$($libro.id)/pages/$pagina/elements" @{
  type = 'table'; transformMatrix = @{ x = 5; y = 60; width = 30; height = 20; angle = 0 }; properties = $gigante } $token) -eq 400)

$anchisima = $tabla.Clone()
$anchisima.celdas = @(, @(1..25 | ForEach-Object { 'x' }))
Check 'ni una de 25 columnas' ((Codigo POST "/books/$($libro.id)/pages/$pagina/elements" @{
  type = 'table'; transformMatrix = @{ x = 5; y = 60; width = 30; height = 20; angle = 0 }; properties = $anchisima } $token) -eq 400)

Write-Host "`n== 3. Se edita como cualquier elemento ==" -ForegroundColor Cyan

$editada = $tabla.Clone()
$editada.celdas = @(, @('Nombre', 'Nota') + , @('Marta', '10') + , @('Luis', '8'))
$editada.diseno = 'cuadricula'
Llamar PATCH "/books/$($libro.id)/pages/$pagina/elements/$($elemento.id)" @{ properties = $editada } $token | Out-Null

$leida = (Llamar GET "/books/$($libro.id)" $null $token).book.pages[0].elements | Where-Object { $_.id -eq $elemento.id }
Check 'se guarda lo escrito en una celda' ($leida.properties.celdas[1][0] -eq 'Marta') "$($leida.properties.celdas[1][0])"
Check 'y el diseno elegido' ($leida.properties.diseno -eq 'cuadricula')

Llamar PATCH "/books/$($libro.id)/pages/$pagina/elements/$($elemento.id)" @{
  transformMatrix = @{ x = 20; y = 20; width = 60; height = 40; angle = 10 }; opacity = 0.8; zIndex = 3 } $token | Out-Null
$movida = (Llamar GET "/books/$($libro.id)" $null $token).book.pages[0].elements | Where-Object { $_.id -eq $elemento.id }
Check 'se mueve, se gira y cambia de capa' (($movida.transformMatrix.angle -eq 10) -and ($movida.opacity -eq 0.8) -and ($movida.zIndex -eq 3))

Write-Host "`n== 4. Las formas nuevas ==" -ForegroundColor Cyan

$nuevas = @('flujo-decision', 'flujo-base-datos', 'disp-portatil', 'red-router',
            'mental-central', 'cubo', 'cilindro', 'senal-precaucion', 'clip-casa')
$puestas = 0
foreach ($forma in $nuevas) {
  $r = Codigo POST "/books/$($libro.id)/pages/$pagina/elements" @{
    type = 'shape'
    transformMatrix = @{ x = 5; y = 70; width = 10; height = 10; angle = 0 }
    properties = @{ shape = $forma; fillColor = '#59A1FF'; strokeColor = '#1549E1'; strokeWidth = 2 }
  } $token
  if ($r -eq 200) { $puestas++ } else { Write-Host "     $forma -> $r" -ForegroundColor DarkYellow }
}
Check 'las formas nuevas se aceptan' ($puestas -eq $nuevas.Count) "$puestas de $($nuevas.Count)"

Check 'una forma inventada se rechaza' ((Codigo POST "/books/$($libro.id)/pages/$pagina/elements" @{
  type = 'shape'; transformMatrix = @{ x = 5; y = 80; width = 10; height = 10; angle = 0 }
  properties = @{ shape = 'dodecaedro-magico'; fillColor = '#59A1FF'; strokeColor = '#1549E1'; strokeWidth = 2 } } $token) -eq 400)

Write-Host "`n== 5. El profesorado puede apagar las tablas ==" -ForegroundColor Cyan
$herramientas = Llamar GET '/libraries/tools' $null $token
Check 'la tabla figura entre las herramientas' (@($herramientas.tools | Where-Object { $_.id -eq 'table' }).Count -eq 1)

Write-Host "`n== 6. Limpieza ==" -ForegroundColor Cyan
Llamar DELETE "/libraries/$($biblioteca.id)" $null $token | Out-Null
Check 'los datos de prueba se borran' $true

Write-Host "`n$ok correctas, $fail fallidas" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }
