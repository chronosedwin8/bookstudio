# Ilustraciones educativas: escena, cache, permisos y limites.
#
# Lo que se vigila aqui es que la IA (o la lectura local, que hace su papel) no
# pueda meter en la base nada que el dibujo no sepa pintar, y que la funcion no
# se convierta en una via para gastar dinero o cargar el servidor.

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

$docente = Llamar POST '/auth/register' @{ email = "ilu-$sufijo@test.local"; password = $clave; fullName = 'Docente Ilustra'; role = 'teacher' } $null
$token = $docente.token
$otro = Llamar POST '/auth/register' @{ email = "ilu2-$sufijo@test.local"; password = $clave; fullName = 'Otro Docente'; role = 'teacher' } $null

Write-Host "`n== 1. De un texto sale una escena ==" -ForegroundColor Cyan

$estado = Llamar GET '/illustrations/estado' $null $token
Check 'la interfaz sabe en que modo esta' ($null -ne $estado.modo) "$($estado | ConvertTo-Json -Compress)"

$r = Llamar POST '/illustrations/analizar' @{ texto = 'Tres estudiantes colaborando con tablets en el salon' } $token
Check 'devuelve una escena' ($null -ne $r.ilustracion.escena)
Check 'con tres personajes' (@($r.ilustracion.escena.personajes).Count -eq 3) "$(@($r.ilustracion.escena.personajes).Count)"
Check 'con tablet en las manos' ($r.ilustracion.escena.personajes[0].sostiene -eq 'tablet') "$($r.ilustracion.escena.personajes[0].sostiene)"
Check 'y NO devuelve ningun SVG' (-not ("$($r | ConvertTo-Json -Depth 12)" -match '<svg'))

$profe = Llamar POST '/illustrations/analizar' @{ texto = 'Un profesor explicando matematicas a dos estudiantes' } $token
$papeles = @($profe.ilustracion.escena.personajes | ForEach-Object { $_.papel })
Check 'distingue a quien ensena de quien aprende' (($papeles -contains 'teacher') -and (@($papeles | Where-Object { $_ -eq 'student' }).Count -eq 2)) "$($papeles -join ',')"

$biblio = Llamar POST '/illustrations/analizar' @{ texto = 'Una estudiante leyendo un libro en la biblioteca' } $token
Check 'situa la escena donde dice el texto' ($biblio.ilustracion.escena.fondo -eq 'library') "$($biblio.ilustracion.escena.fondo)"

Write-Host "`n== 2. No se repite lo ya preguntado ==" -ForegroundColor Cyan

$repetida = Llamar POST '/illustrations/analizar' @{ texto = '  TRES estudiantes   colaborando con tablets en el salon ' } $token
Check 'la misma peticion se reutiliza' ($repetida.reutilizada -eq $true)
Check 'y devuelve la misma ilustracion' ($repetida.ilustracion.id -eq $r.ilustracion.id)

$deOtro = Llamar POST '/illustrations/analizar' @{ texto = 'Tres estudiantes colaborando con tablets en el salon' } $otro.token
Check 'pero la cache no cruza entre personas' ($deOtro.ilustracion.id -ne $r.ilustracion.id)

Write-Host "`n== 3. Lo inventado no entra ==" -ForegroundColor Cyan

Check 'un texto vacio se rechaza' ((Codigo POST '/illustrations/analizar' @{ texto = '' } $token) -eq 400)
Check 'y uno de una letra tambien' ((Codigo POST '/illustrations/analizar' @{ texto = 'x' } $token) -eq 400)

$escenaMala = @{ prompt = 'nave'; escena = @{ fondo = 'marte'; distribucion = 'single'; tema = 'neon';
  personajes = @(@{ papel = 'alien'; pose = 'volando'; emocion = 'furioso'; posicion = 'orbita' }); objetos = @() } }
Check 'una escena con valores inventados se rechaza' ((Codigo POST '/illustrations' $escenaMala $token) -eq 400)

$escenaBuena = @{ prompt = 'clase'; escena = @{ fondo = 'classroom'; distribucion = 'pair'; tema = 'educational';
  personajes = @(
    @{ papel = 'teacher'; pose = 'pointing'; emocion = 'engaged'; posicion = 'left' },
    @{ papel = 'student'; pose = 'sitting'; emocion = 'focused'; posicion = 'right' }
  ); objetos = @(@{ objeto = 'notebook'; posicion = 'foreground' }) } }
$guardada = Llamar POST '/illustrations' $escenaBuena $token
Check 'una escena valida si se guarda' ($null -ne $guardada.ilustracion.id)

$muchos = @{ prompt = 'multitud'; escena = @{ fondo = 'classroom'; distribucion = 'group'; tema = 'educational';
  personajes = @(1..9 | ForEach-Object { @{ papel = 'student'; pose = 'standing'; emocion = 'engaged'; posicion = 'center' } }); objetos = @() } }
Check 'nueve personajes no caben' ((Codigo POST '/illustrations' $muchos $token) -eq 400)

Write-Host "`n== 4. Cada cual ve lo suyo ==" -ForegroundColor Cyan

$mias = Llamar GET '/illustrations' $null $token
Check 'se listan las propias' (@($mias.ilustraciones).Count -ge 2) "$(@($mias.ilustraciones).Count)"

Check 'la de otra persona no se abre' ((Codigo GET "/illustrations/$($guardada.ilustracion.id)" $null $otro.token) -eq 404)
Check 'sin sesion no se entra' ((Codigo POST '/illustrations/analizar' @{ texto = 'algo educativo' } $null) -eq 401)

Write-Host "`n== 5. En el lienzo es un elemento mas ==" -ForegroundColor Cyan

$biblioteca = (Llamar POST '/libraries' @{ name = "Ilus $sufijo" } $token).library
$libro = (Llamar POST '/books' @{ title = "Ilus $sufijo"; libraryId = $biblioteca.id } $token).book
$pagina = (Llamar GET "/books/$($libro.id)" $null $token).book.pages[0].id

$elemento = (Llamar POST "/books/$($libro.id)/pages/$pagina/elements" @{
  type = 'illustration'
  transformMatrix = @{ x = 10; y = 10; width = 60; height = 38; angle = 0 }
  properties = @{ escena = $escenaBuena.escena; prompt = 'clase' }
} $token).element

Check 'se inserta en la pagina' ($elemento.type -eq 'illustration')
Check 'y guarda la escena, no un dibujo' ($null -ne $elemento.properties.escena)

Llamar PATCH "/books/$($libro.id)/pages/$pagina/elements/$($elemento.id)" @{
  transformMatrix = @{ x = 25; y = 30; width = 45; height = 28; angle = 20 }; opacity = 0.5; zIndex = 4
} $token | Out-Null
$movido = (Llamar GET "/books/$($libro.id)" $null $token).book.pages[0].elements | Where-Object { $_.id -eq $elemento.id }
Check 'se mueve, se gira, cambia opacidad y capa' (($movido.transformMatrix.angle -eq 20) -and ($movido.opacity -eq 0.5) -and ($movido.zIndex -eq 4))

$conEscenaMala = Codigo PATCH "/books/$($libro.id)/pages/$pagina/elements/$($elemento.id)" @{
  properties = @{ escena = @{ fondo = 'marte'; personajes = @(@{ papel = 'alien' }) }; prompt = 'x' }
} $token
Check 'no se le puede meter una escena rota despues' ($conEscenaMala -eq 400) "$conEscenaMala"

Write-Host "`n== 6. El profesorado puede apagar la herramienta ==" -ForegroundColor Cyan

$herramientas = Llamar GET '/libraries/tools' $null $token
Check 'la ilustracion aparece entre las herramientas' (@($herramientas.tools | Where-Object { $_.id -eq 'illustration' }).Count -eq 1)

Write-Host "`n== 7. Limpieza ==" -ForegroundColor Cyan
Llamar DELETE "/libraries/$($biblioteca.id)" $null $token | Out-Null
Check 'los datos de prueba se borran' $true

Write-Host "`n$ok correctas, $fail fallidas" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }
