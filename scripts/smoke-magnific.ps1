# Imagenes generadas con Magnific: permisos, validacion y el viaje completo.
#
# Por defecto NO genera ninguna imagen, porque cada una cuesta creditos reales.
# Para probar el viaje entero de punta a punta:  .\smoke-magnific.ps1 -Generar
param([switch]$Generar)

$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api'
$ok = 0; $fail = 0

function Check($nombre, $condicion, $detalle = '') {
  if ($condicion) { $script:ok++; Write-Host "  OK   $nombre" -ForegroundColor Green }
  else { $script:fail++; Write-Host "  FAIL $nombre -> $detalle" -ForegroundColor Red }
}

function Llamar($metodo, $ruta, $cuerpo, $token) {
  $h = @{}
  if ($token) { $h['Authorization'] = "Bearer $token" }
  $p = @{ Uri = "$base$ruta"; Method = $metodo; Headers = $h; ContentType = 'application/json' }
  if ($null -ne $cuerpo) { $p['Body'] = ($cuerpo | ConvertTo-Json -Depth 8 -Compress) }
  Invoke-RestMethod @p
}

function Codigo($metodo, $ruta, $cuerpo, $token) {
  try { Llamar $metodo $ruta $cuerpo $token | Out-Null; return 200 }
  catch { return $_.Exception.Response.StatusCode.value__ }
}

$sufijo = [guid]::NewGuid().ToString('N').Substring(0, 8)

Write-Host "`n== Preparacion ==" -ForegroundColor Cyan

$doc = Llamar POST '/auth/register' @{ email = "doc-$sufijo@test.local"; password = 'Prueba12345'; fullName = 'Docente Imagenes'; role = 'teacher' } $null
$tokenDoc = $doc.token
$clase = Llamar POST '/libraries' @{ name = "Clase imagenes $sufijo" } $tokenDoc
$alumno = Llamar POST '/auth/students' @{ fullName = "Alumno Imagenes $sufijo"; libraryId = $clase.library.id } $tokenDoc
$tokenAlumno = (Llamar POST '/auth/login/qr' @{ token = $alumno.qrToken } $null).token
Check 'docente y alumno listos' ($null -ne $tokenAlumno)

Write-Host "`n== 1. Disponibilidad ==" -ForegroundColor Cyan

$cfgDoc = Llamar GET '/magnific/config' $null $tokenDoc
Check 'la funcion esta configurada' ($cfgDoc.enabled -eq $true) "$($cfgDoc.enabled)"
Check 'el docente puede generar' ($cfgDoc.canGenerate -eq $true)

$cfgAlumno = Llamar GET '/magnific/config' $null $tokenAlumno
Check 'el alumnado no puede, por defecto' ($cfgAlumno.canGenerate -eq $false) "$($cfgAlumno.canGenerate)"
Check 'pero si ve que la funcion existe' ($cfgAlumno.enabled -eq $true)

Check 'sin sesion no se consulta' ((Codigo GET '/magnific/config' $null $null) -eq 401)

Write-Host "`n== 2. Permisos ==" -ForegroundColor Cyan

$peticion = @{ prompt = 'un gato azul de dibujos animados'; aspectRatio = 'square_1_1'; model = 'fluid'; resolution = '1k' }
Check 'un alumno no gasta creditos' ((Codigo POST '/magnific/images' $peticion $tokenAlumno) -eq 403)
Check 'sin sesion tampoco' ((Codigo POST '/magnific/images' $peticion $null) -eq 401)

Write-Host "`n== 3. Validacion, antes de pagar nada ==" -ForegroundColor Cyan

Check 'rechaza una descripcion vacia' ((Codigo POST '/magnific/images' @{ prompt = '' } $tokenDoc) -eq 400)
Check 'rechaza una descripcion de dos letras' ((Codigo POST '/magnific/images' @{ prompt = 'ab' } $tokenDoc) -eq 400)
Check 'rechaza una forma inventada' ((Codigo POST '/magnific/images' @{ prompt = 'un paisaje'; aspectRatio = 'triangulo' } $tokenDoc) -eq 400)
Check 'rechaza un estilo inventado' ((Codigo POST '/magnific/images' @{ prompt = 'un paisaje'; model = 'picasso' } $tokenDoc) -eq 400)
Check 'rechaza 4k, que no cabe en el almacen' ((Codigo POST '/magnific/images' @{ prompt = 'un paisaje'; resolution = '4k' } $tokenDoc) -eq 400)
$largo = 'a' * 1200
Check 'rechaza una descripcion desmedida' ((Codigo POST '/magnific/images' @{ prompt = $largo } $tokenDoc) -eq 400)

Write-Host "`n== 4. Consultar tareas ajenas o inventadas ==" -ForegroundColor Cyan

$inventada = [guid]::NewGuid().ToString()
Check 'una tarea inventada no existe' ((Codigo GET "/magnific/images/$inventada" $null $tokenDoc) -eq 404)
Check 'un identificador que no es uuid se rechaza' ((Codigo GET '/magnific/images/pepito' $null $tokenDoc) -eq 400)

if (-not $Generar) {
  Write-Host "`n(omitido el viaje completo: se lanza con -Generar y gasta creditos)" -ForegroundColor Yellow
  Write-Host "`n$ok correctas, $fail fallidas" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
  exit $(if ($fail -eq 0) { 0 } else { 1 })
}

Write-Host "`n== 5. Viaje completo (gasta una imagen) ==" -ForegroundColor Cyan

$tarea = Llamar POST '/magnific/images' @{ prompt = 'una manzana roja en acuarela sobre fondo blanco'; resolution = '1k'; model = 'fluid' } $tokenDoc
Check 'se crea la tarea' ($null -ne $tarea.taskId) "$($tarea | ConvertTo-Json -Compress)"
Check 'empieza sin terminar' ($tarea.status -in @('CREATED', 'IN_PROGRESS'))

$otro = Llamar POST '/auth/register' @{ email = "otro-$sufijo@test.local"; password = 'Prueba12345'; fullName = 'Otro Docente'; role = 'teacher' } $null
Check 'otra persona no consulta mi tarea' ((Codigo GET "/magnific/images/$($tarea.taskId)" $null $otro.token) -eq 404)

$estado = $null
$inicio = Get-Date
while (((Get-Date) - $inicio).TotalSeconds -lt 180) {
  Start-Sleep -Seconds 3
  $estado = Llamar GET "/magnific/images/$($tarea.taskId)" $null $tokenDoc
  Write-Host "     $([int]((Get-Date) - $inicio).TotalSeconds)s $($estado.status)" -ForegroundColor DarkGray
  if ($estado.status -in @('COMPLETED', 'FAILED')) { break }
}

Check 'la imagen termina bien' ($estado.status -eq 'COMPLETED') "$($estado.status) $($estado.error)"
Check 'devuelve una direccion nuestra' ($estado.fileUrl -and ($estado.fileUrl -like '/storage/*' -or $estado.fileUrl -like 'https://*')) "$($estado.fileUrl)"
Check 'no devuelve la direccion de Magnific, que caduca' ($estado.fileUrl -notlike '*magnific*') "$($estado.fileUrl)"

$url = if ($estado.fileUrl -like 'http*') { $estado.fileUrl } else { "http://localhost:4000$($estado.fileUrl)" }
$imagen = Invoke-WebRequest -Uri $url -UseBasicParsing
Check 'la imagen se descarga de nuestro almacen' ($imagen.StatusCode -eq 200)
Check 'y pesa lo que pesa una imagen' ($imagen.RawContentLength -gt 10000) "$($imagen.RawContentLength) bytes"

$repetida = Llamar GET "/magnific/images/$($tarea.taskId)" $null $tokenDoc
Check 'consultar dos veces no guarda dos copias' ($repetida.fileUrl -eq $estado.fileUrl)

Write-Host "`n== 6. Limpieza ==" -ForegroundColor Cyan
Invoke-RestMethod -Uri "$base/libraries/$($clase.library.id)" -Method Delete -Headers @{ Authorization = "Bearer $tokenDoc" } | Out-Null
Check 'la clase de prueba se borra' $true

Write-Host "`n$ok correctas, $fail fallidas" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
exit $(if ($fail -eq 0) { 0 } else { 1 })
