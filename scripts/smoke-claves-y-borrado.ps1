# Claves al dar de alta, cambio de contrasena y borrado de usuarios con su contenido.
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api'
$ok = 0; $fail = 0

function Check($nombre, $condicion, $detalle = '') {
  if ($condicion) { $script:ok++; Write-Host "  OK   $nombre" -ForegroundColor Green }
  else { $script:fail++; Write-Host "  FAIL $nombre -> $detalle" -ForegroundColor Red }
}

function Api($metodo, $ruta, $cuerpo, $token) {
  $h = @{}
  if ($token) { $h['Authorization'] = "Bearer $token" }
  $p = @{ Uri = "$base$ruta"; Method = $metodo; Headers = $h; ContentType = 'application/json' }
  if ($null -ne $cuerpo) { $p['Body'] = ($cuerpo | ConvertTo-Json -Depth 8 -Compress) }
  Invoke-RestMethod @p
}

$sufijo = [guid]::NewGuid().ToString('N').Substring(0, 8)

Write-Host "`n== Preparacion ==" -ForegroundColor Cyan

$admin = Api POST '/auth/register' @{ email = "adm-$sufijo@test.local"; password = 'Prueba12345'; fullName = "Admin $sufijo"; role = 'teacher' } $null
$tokenAdmin = $admin.token
$clase = Api POST '/libraries' @{ name = "Clase claves $sufijo" } $tokenAdmin
Check 'docente y clase listos' ($null -ne $clase.library.id)

Write-Host "`n== 1. Cambio de contrasena por la propia persona ==" -ForegroundColor Cyan

$alumno = Api POST '/auth/students' @{ fullName = "Alumno QR $sufijo"; libraryId = $clase.library.id } $tokenAdmin
$sesQr = Api POST '/auth/login/qr' @{ token = $alumno.qrToken } $null
Check 'el alumno entra con QR' ($null -ne $sesQr.token)

# Sin contrasena previa no se le pide la actual
Api POST '/auth/password' @{ newPassword = 'MiClaveNueva1' } $sesQr.token | Out-Null
Check 'se pone contrasena por primera vez sin pedir la anterior' $true

$conClave = Api POST '/auth/login' @{ email = $alumno.user.email; password = 'MiClaveNueva1' } $null
Check 'ahora entra con usuario y contrasena' ($null -ne $conClave.token)

$sinActual = $null
try { Api POST '/auth/password' @{ newPassword = 'OtraMas12345' } $conClave.token } catch { $sinActual = $_.Exception.Response.StatusCode.value__ }
Check 'ya con contrasena, exige la anterior' ($sinActual -eq 400) "$sinActual"

$malActual = $null
try { Api POST '/auth/password' @{ currentPassword = 'equivocada'; newPassword = 'OtraMas12345' } $conClave.token } catch { $malActual = $_.Exception.Response.StatusCode.value__ }
Check 'y que sea la correcta' ($malActual -eq 401) "$malActual"

Api POST '/auth/password' @{ currentPassword = 'MiClaveNueva1'; newPassword = 'OtraMas12345' } $conClave.token | Out-Null
$cambiada = Api POST '/auth/login' @{ email = $alumno.user.email; password = 'OtraMas12345' } $null
Check 'la cambia con la actual correcta' ($null -ne $cambiada.token)

$corta = $null
try { Api POST '/auth/password' @{ currentPassword = 'OtraMas12345'; newPassword = 'corta' } $cambiada.token } catch { $corta = $_.Exception.Response.StatusCode.value__ }
Check 'rechaza contrasenas de menos de 8' ($corta -eq 400) "$corta"

Write-Host "`n== 2. Borrado de usuario con su contenido ==" -ForegroundColor Cyan

$libro = Api POST '/books' @{ title = "Libro de $sufijo"; libraryId = $clase.library.id } $cambiada.token
Api POST "/books/$($libro.book.id)/pages" @{} $cambiada.token | Out-Null
Api POST "/books/$($libro.book.id)/grades" @{ title = 'Revision 1'; score = 2.0; description = 'ok' } $tokenAdmin | Out-Null
Api POST "/books/$($libro.book.id)/activity" $null $cambiada.token | Out-Null

$antes = (Api GET "/books?libraryId=$($clase.library.id)" $null $tokenAdmin).books.Count
Check 'el alumno tiene contenido antes de borrarlo' ($antes -ge 1) "$antes libros"

$propia = $null
try { Api DELETE "/users/$($admin.user.id)" $null $tokenAdmin } catch { $propia = $_.Exception.Response.StatusCode.value__ }
Check 'nadie puede borrarse a si mismo' ($propia -eq 400) "$propia"

$borrado = Api DELETE "/users/$($alumno.user.id)" $null $tokenAdmin
Check 'el docente borra a su alumno' ($borrado.deleted.fullName -like "*Alumno QR*") "$($borrado.deleted.fullName)"
Check 'y se lleva sus libros' ($borrado.deleted.books -ge 1) "$($borrado.deleted.books)"
Check 'y sus paginas' ($borrado.deleted.pages -ge 2) "$($borrado.deleted.pages)"
Check 'y sus valoraciones' ($borrado.deleted.grades -ge 1) "$($borrado.deleted.grades)"
Check 'informa del almacenamiento usado' ($borrado.deleted.storage -in @('disco', 's3')) "$($borrado.deleted.storage)"

$despues = (Api GET "/books?libraryId=$($clase.library.id)" $null $tokenAdmin).books.Count
Check 'sus libros desaparecen de la biblioteca' ($despues -eq ($antes - $borrado.deleted.books)) "$antes -> $despues"

$yaNo = $null
try { Api POST '/auth/login' @{ email = $alumno.user.email; password = 'OtraMas12345' } $null } catch { $yaNo = $_.Exception.Response.StatusCode.value__ }
Check 'su cuenta ya no entra' ($yaNo -eq 401) "$yaNo"

Write-Host "`n== 3. Quien puede borrar a quien ==" -ForegroundColor Cyan

$otroDoc = Api POST '/auth/register' @{ email = "otro-$sufijo@test.local"; password = 'Prueba12345'; fullName = "Otro $sufijo"; role = 'teacher' } $null
$suClase = Api POST '/libraries' @{ name = "Clase ajena $sufijo" } $otroDoc.token
$suAlumno = Api POST '/auth/students' @{ fullName = "Ajeno $sufijo"; libraryId = $suClase.library.id } $otroDoc.token

$ajeno = $null
try { Api DELETE "/users/$($suAlumno.user.id)" $null $tokenAdmin } catch { $ajeno = $_.Exception.Response.StatusCode.value__ }
Check 'un docente no borra alumnado de otra clase' ($ajeno -eq 403) "$ajeno"

$aDocente = $null
try { Api DELETE "/users/$($otroDoc.user.id)" $null $tokenAdmin } catch { $aDocente = $_.Exception.Response.StatusCode.value__ }
Check 'un docente no borra a otro docente' ($aDocente -eq 403) "$aDocente"

$comoAlumno = $null
$suSesion = Api POST '/auth/login/qr' @{ token = $suAlumno.qrToken } $null
try { Api DELETE "/users/$($otroDoc.user.id)" $null $suSesion.token } catch { $comoAlumno = $_.Exception.Response.StatusCode.value__ }
Check 'un alumno no borra a nadie' ($comoAlumno -eq 403) "$comoAlumno"

Write-Host "`n== 4. Almacenamiento ==" -ForegroundColor Cyan

# El diagnostico revela el bucket y las rutas: solo para administradores.
$soloAdmin = $null
try { Api POST '/users/storage/prepare' $null $tokenAdmin } catch { $soloAdmin = $_.Exception.Response.StatusCode.value__ }
Check 'el diagnostico del almacenamiento es solo de administracion' ($soloAdmin -eq 403) "$soloAdmin"

Write-Host "`n== Resultado: $ok OK / $fail FAIL ==" -ForegroundColor $(if ($fail) { 'Red' } else { 'Green' })
if ($fail) { exit 1 }
