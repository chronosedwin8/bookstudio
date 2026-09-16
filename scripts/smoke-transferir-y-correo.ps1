# Ensayo funcional: pasar libros de "Mis libros" a bibliotecas, y corregir el
# correo del alumnado.
#
# Lo que se vigila de la transferencia es que no quede NADA a medias: si una de
# las bibliotecas elegidas no admite el libro, no debe moverse ni copiarse en
# ninguna. Y del correo, los limites: un docente solo toca a su alumnado.
$ErrorActionPreference = 'Stop'
# BOOKSTUDIO_API cuando el 4000 lo ocupa otra aplicacion (pasa: ver trampas-pruebas-windows).
$base = if ($env:BOOKSTUDIO_API) { $env:BOOKSTUDIO_API } else { 'http://localhost:4000/api' }
$pass = 0; $fail = 0

function Test-Step {
    param([string]$Name, [scriptblock]$Body)
    try {
        $result = & $Body
        Write-Host "  OK   $Name" -ForegroundColor Green
        $script:pass++
        return $result
    } catch {
        Write-Host "  FAIL $Name -> $($_.Exception.Message)" -ForegroundColor Red
        $script:fail++
        return $null
    }
}

function Invoke-Api {
    param([string]$Method, [string]$Path, $Body, [string]$Token)
    $headers = @{}
    if ($Token) { $headers['Authorization'] = "Bearer $Token" }
    $args = @{ Method = $Method; Uri = "$base$Path"; Headers = $headers }
    if ($null -ne $Body) {
        $args['Body'] = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10 -Compress))
        $args['ContentType'] = 'application/json; charset=utf-8'
    }
    Invoke-RestMethod @args
}

function Assert-Status {
    param([scriptblock]$Body, [int]$Expected)
    try { & $Body; throw "No fallo (esperaba $Expected)" }
    catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -ne $Expected) { throw "Esperaba $Expected, llego $code" }
    }
}

# Devuelve el cuerpo del error, para comprobar que el mensaje ayuda.
function Error-De {
    param([scriptblock]$Body)
    try { & $Body; return $null }
    catch {
        $r = $_.ErrorDetails.Message
        if ($r) { return ($r | ConvertFrom-Json).error.message }
        return $_.Exception.Message
    }
}

function Sql($sentencia) {
    npm run --silent sql --workspace @bookstudio/api -- $sentencia | Out-Null
}

function Puede-Entrar {
    param([string]$Correo, [string]$Clave)
    try { $null = Invoke-Api POST '/auth/login' @{ email = $Correo; password = $Clave }; return $true }
    catch { return $false }
}

# Un libro personal con dos paginas y un texto, para comprobar que la copia lleva todo.
function Nuevo-Libro {
    param([string]$Titulo, [string]$Token)
    $libro = (Invoke-Api POST '/books' @{ title = $Titulo; layoutFormat = 'landscape' } -Token $Token).book
    $detalle = (Invoke-Api GET "/books/$($libro.id)" -Token $Token).book
    $null = Invoke-Api POST "/books/$($libro.id)/pages/$($detalle.pages[0].id)/elements" @{
        type = 'text'
        transformMatrix = @{ x = 10; y = 10; width = 40; height = 10; angle = 0 }
        properties = @{ text = "Hola $Titulo" }
    } -Token $Token
    $null = Invoke-Api POST "/books/$($libro.id)/pages" @{ backgroundColor = '#FFEEDD' } -Token $Token
    return $libro
}

Write-Host "`n== Transferir libros y corregir correos: ensayo funcional ==" -ForegroundColor Cyan

$sufijo = [guid]::NewGuid().ToString('N').Substring(0, 6)

$doc = Invoke-Api POST '/auth/register' @{ email = "tr.$sufijo@test.local"; password = 'Secreto12345'; fullName = 'Docente Transfiere'; role = 'teacher' }
$otro = Invoke-Api POST '/auth/register' @{ email = "tr2.$sufijo@test.local"; password = 'Secreto12345'; fullName = 'Docente Ajeno'; role = 'teacher' }

$lengua = (Invoke-Api POST '/libraries' @{ name = "Lengua $sufijo" } -Token $doc.token).library
$mates = (Invoke-Api POST '/libraries' @{ name = "Mates $sufijo" } -Token $doc.token).library
$ciencias = (Invoke-Api POST '/libraries' @{ name = "Ciencias $sufijo" } -Token $doc.token).library
$ajena = (Invoke-Api POST '/libraries' @{ name = "Ajena $sufijo" } -Token $otro.token).library

# ======================================================================
Write-Host "`n-- Pasar a una biblioteca --" -ForegroundColor Cyan

$uno = Nuevo-Libro "Uno $sufijo" $doc.token

$r1 = Test-Step 'Se pasa a una biblioteca' {
    $r = Invoke-Api POST "/books/$($uno.id)/transfer" @{ libraryIds = @($lengua.id) } -Token $doc.token
    if (-not $r.moved) { throw 'No dice que se haya movido' }
    if ($r.moved.libraryId -ne $lengua.id) { throw "Fue a $($r.moved.libraryName)" }
    if ($r.copies.Count -ne 0) { throw "Hizo $($r.copies.Count) copias sin pedirlas" }
    $r
}

Test-Step 'Es el MISMO libro, no una copia: conserva su id' {
    if ($r1.moved.bookId -ne $uno.id) { throw 'Cambio de id: se copio en vez de moverse' }
    $b = (Invoke-Api GET "/books/$($uno.id)" -Token $doc.token).book
    if ($b.libraryId -ne $lengua.id) { throw "Esta en $($b.libraryId)" }
    if ($b.pages.Count -ne 2) { throw "Paginas: $($b.pages.Count)" }
}

Test-Step 'Ya no aparece en Mis libros' {
    $personales = Invoke-Api GET '/books?scope=personal' -Token $doc.token
    if ($personales | Where-Object { $_.id -eq $uno.id }) { throw 'Sigue en Mis libros' }
    $personales2 = (Invoke-Api GET '/books?scope=personal' -Token $doc.token).books
    if ($personales2 | Where-Object { $_.id -eq $uno.id }) { throw 'Sigue en Mis libros' }
}

Test-Step 'Un libro que ya esta en una biblioteca no se transfiere -> 400' {
    Assert-Status { Invoke-Api POST "/books/$($uno.id)/transfer" @{ libraryIds = @($mates.id) } -Token $doc.token } 400
}

# ======================================================================
Write-Host "`n-- Pasar a varias --" -ForegroundColor Cyan

$varios = Nuevo-Libro "Varios $sufijo" $doc.token
# Publico con enlace ANTES de pasarlo: asi se puede comprobar que el original
# conserva el enlace y que las copias no lo heredan.
$compartido = (Invoke-Api PUT "/books/$($varios.id)/share" @{ visibility = 'public' } -Token $doc.token).share

$r2 = Test-Step 'Se pasa a tres bibliotecas: se mueve a la primera y se copia a las otras' {
    $r = Invoke-Api POST "/books/$($varios.id)/transfer" @{ libraryIds = @($mates.id, $lengua.id, $ciencias.id) } -Token $doc.token
    if ($r.moved.libraryId -ne $mates.id) { throw "El original fue a $($r.moved.libraryName), no a la primera" }
    if ($r.copies.Count -ne 2) { throw "Copias: $($r.copies.Count)" }
    $r
}

Test-Step 'Cada copia lleva todas las paginas, fondos y elementos' {
    foreach ($c in $r2.copies) {
        $b = (Invoke-Api GET "/books/$($c.bookId)" -Token $doc.token).book
        if ($b.libraryId -ne $c.libraryId) { throw "La copia de $($c.libraryName) esta en otro sitio" }
        if ($b.pages.Count -ne 2) { throw "$($c.libraryName): $($b.pages.Count) paginas" }
        if ($b.layoutFormat -ne 'landscape') { throw "$($c.libraryName): formato $($b.layoutFormat)" }
        $texto = $b.pages[0].elements | Where-Object { $_.type -eq 'text' }
        if (-not $texto -or $texto.properties.text -ne "Hola Varios $sufijo") { throw "$($c.libraryName): falta el texto" }
        if ($b.pages[1].backgroundColor -ne '#FFEEDD') { throw "$($c.libraryName): fondo $($b.pages[1].backgroundColor)" }
        if ($b.id -eq $varios.id) { throw 'La copia es el mismo libro' }
    }
}

Test-Step 'El original conserva su enlace publico tras moverse' {
    if (-not $compartido.token) { throw 'La preparacion no dejo el libro con enlace' }
    $o = (Invoke-Api GET "/books/$($varios.id)" -Token $doc.token).book
    if ($o.shareVisibility -ne 'public') { throw "Visibilidad del original: $($o.shareVisibility)" }
    if ($o.shareToken -ne $compartido.token) { throw 'El enlace del original cambio' }
}

Test-Step 'Las copias nacen privadas y sin enlace, aunque el original sea publico' {
    foreach ($c in $r2.copies) {
        $b = (Invoke-Api GET "/books/$($c.bookId)" -Token $doc.token).book
        if ($b.shareVisibility -ne 'private') { throw "$($c.libraryName): $($b.shareVisibility)" }
        if ($b.shareToken) { throw "$($c.libraryName) heredo un enlace" }
    }
}

Test-Step 'Editar una copia no toca el original' {
    $c = (Invoke-Api GET "/books/$($r2.copies[0].bookId)" -Token $doc.token).book
    $el = $c.pages[0].elements | Where-Object { $_.type -eq 'text' }
    $null = Invoke-Api PATCH "/books/$($c.id)/pages/$($c.pages[0].id)/elements/$($el.id)" @{ properties = @{ text = 'Cambiado' } } -Token $doc.token
    $o = (Invoke-Api GET "/books/$($varios.id)" -Token $doc.token).book
    $oel = $o.pages[0].elements | Where-Object { $_.type -eq 'text' }
    if ($oel.properties.text -ne "Hola Varios $sufijo") { throw 'El original tambien cambio: comparten elementos' }
}

# ======================================================================
Write-Host "`n-- Conservar en Mis libros --" -ForegroundColor Cyan

$conservado = Nuevo-Libro "Conservado $sufijo" $doc.token

Test-Step 'Con "conservar", todas son copias y el original se queda' {
    $r = Invoke-Api POST "/books/$($conservado.id)/transfer" @{ libraryIds = @($lengua.id, $mates.id); keepPersonal = $true } -Token $doc.token
    if ($r.moved) { throw 'Movio el original' }
    if ($r.copies.Count -ne 2) { throw "Copias: $($r.copies.Count)" }
    $b = (Invoke-Api GET "/books/$($conservado.id)" -Token $doc.token).book
    if ($b.libraryId) { throw 'El original ya no es personal' }
}

# ======================================================================
Write-Host "`n-- Todo o nada --" -ForegroundColor Cyan

$intacto = Nuevo-Libro "Intacto $sufijo" $doc.token

function Libros-En($libraryId, $token) {
    @((Invoke-Api GET "/books?libraryId=$libraryId" -Token $token)) | ForEach-Object { $_ } |
        ForEach-Object { if ($_.books) { $_.books } else { $_ } }
}

$antesCiencias = @(Libros-En $ciencias.id $doc.token | Where-Object { $_.title -eq "Intacto $sufijo" }).Count

Test-Step 'Si una biblioteca no es suya -> 403' {
    Assert-Status {
        Invoke-Api POST "/books/$($intacto.id)/transfer" @{ libraryIds = @($ciencias.id, $ajena.id) } -Token $doc.token
    } 403
}

Test-Step 'Y el aviso dice cual es la biblioteca problematica' {
    $m = Error-De { Invoke-Api POST "/books/$($intacto.id)/transfer" @{ libraryIds = @($ciencias.id, $ajena.id) } -Token $doc.token }
    if ($m -notmatch "Ajena $sufijo") { throw "Mensaje: $m" }
}

Test-Step 'No se ha movido ni copiado nada en ninguna' {
    $b = (Invoke-Api GET "/books/$($intacto.id)" -Token $doc.token).book
    if ($b.libraryId) { throw "Se movio a $($b.libraryId)" }
    $despues = @(Libros-En $ciencias.id $doc.token | Where-Object { $_.title -eq "Intacto $sufijo" }).Count
    if ($despues -ne $antesCiencias) { throw 'Quedo una copia en la biblioteca valida' }
}

Test-Step 'Una biblioteca inexistente -> 404' {
    Assert-Status {
        Invoke-Api POST "/books/$($intacto.id)/transfer" @{ libraryIds = @([guid]::NewGuid().ToString()) } -Token $doc.token
    } 404
}

Test-Step 'Sin elegir ninguna -> 400' {
    Assert-Status { Invoke-Api POST "/books/$($intacto.id)/transfer" @{ libraryIds = @() } -Token $doc.token } 400
}

Test-Step 'El libro personal de otra persona no se puede transferir -> 404' {
    Assert-Status {
        Invoke-Api POST "/books/$($intacto.id)/transfer" @{ libraryIds = @($ajena.id) } -Token $otro.token
    } 404
}

Test-Step 'Repetir la misma biblioteca no crea copias de mas' {
    $l = Nuevo-Libro "Repetido $sufijo" $doc.token
    $r = Invoke-Api POST "/books/$($l.id)/transfer" @{ libraryIds = @($ciencias.id, $ciencias.id) } -Token $doc.token
    if ($r.copies.Count -ne 0) { throw "Hizo $($r.copies.Count) copias en la misma biblioteca" }
}

# ======================================================================
Write-Host "`n-- Alumnado --" -ForegroundColor Cyan

$alu = Invoke-Api POST '/auth/students' @{ fullName = "Alumna Transfiere $sufijo"; libraryId = $lengua.id } -Token $doc.token
$null = Invoke-Api POST "/users/$($alu.user.id)/password" @{ password = 'ClaveAlumna123' } -Token $doc.token
$tAlu = (Invoke-Api POST '/auth/login' @{ email = $alu.user.email; password = 'ClaveAlumna123' }).token
$libroAlu = Nuevo-Libro "De la alumna $sufijo" $tAlu

Test-Step 'La alumna pasa su libro a su biblioteca' {
    $r = Invoke-Api POST "/books/$($libroAlu.id)/transfer" @{ libraryIds = @($lengua.id) } -Token $tAlu
    if ($r.moved.libraryId -ne $lengua.id) { throw 'No se movio' }
}

Test-Step 'Pero no a una donde el docente no deja crear libros -> 403' {
    $null = Invoke-Api PATCH "/libraries/$($lengua.id)" @{ studentEditable = $false } -Token $doc.token
    $l2 = Nuevo-Libro "Bloqueado $sufijo" $tAlu
    Assert-Status { Invoke-Api POST "/books/$($l2.id)/transfer" @{ libraryIds = @($lengua.id) } -Token $tAlu } 403
    $null = Invoke-Api PATCH "/libraries/$($lengua.id)" @{ studentEditable = $true } -Token $doc.token
}

Test-Step 'Ni a una biblioteca de la que no forma parte -> 403' {
    $l3 = Nuevo-Libro "Fuera $sufijo" $tAlu
    Assert-Status { Invoke-Api POST "/books/$($l3.id)/transfer" @{ libraryIds = @($ajena.id) } -Token $tAlu } 403
}

# ======================================================================
Write-Host "`n-- Corregir el correo --" -ForegroundColor Cyan

$ana = Invoke-Api POST '/auth/students' @{ fullName = "Ana Correo $sufijo"; libraryId = $mates.id } -Token $doc.token
$null = Invoke-Api POST "/users/$($ana.user.id)/password" @{ password = 'ClaveAna12345' } -Token $doc.token
$ajenoAlu = Invoke-Api POST '/auth/students' @{ fullName = "Beto Ajeno $sufijo"; libraryId = $ajena.id } -Token $otro.token

$nuevoCorreo = "ana.$sufijo@colegio.test"

Test-Step 'El docente corrige el correo de su alumna' {
    $u = (Invoke-Api PATCH "/users/$($ana.user.id)" @{ email = $nuevoCorreo } -Token $doc.token).user
    if ($u.email -ne $nuevoCorreo) { throw "Quedo $($u.email)" }
}

Test-Step 'Entra con el correo nuevo y la misma contrasena' {
    if (-not (Puede-Entrar $nuevoCorreo 'ClaveAna12345')) { throw 'No entra con el correo nuevo' }
}

Test-Step 'Y con el viejo ya no' {
    if (Puede-Entrar $ana.user.email 'ClaveAna12345') { throw 'Sigue entrando con el correo viejo' }
}

Test-Step 'Se guarda en minusculas y sin espacios' {
    $u = (Invoke-Api PATCH "/users/$($ana.user.id)" @{ email = "  ANA.$sufijo@Colegio.TEST " } -Token $doc.token).user
    if ($u.email -ne $nuevoCorreo) { throw "Quedo '$($u.email)'" }
}

Test-Step 'Tambien si la alumna viene de Phidias' {
    Sql "UPDATE users SET external_source='phidias', external_id='$(Get-Random -Minimum 800000000 -Maximum 899999999)' WHERE id='$($ana.user.id)'"
    $otroCorreo = "ana.phidias.$sufijo@colegio.test"
    $u = (Invoke-Api PATCH "/users/$($ana.user.id)" @{ email = $otroCorreo } -Token $doc.token).user
    if ($u.email -ne $otroCorreo) { throw "Quedo $($u.email)" }
    $null = Invoke-Api PATCH "/users/$($ana.user.id)" @{ email = $nuevoCorreo } -Token $doc.token
}

Test-Step 'No puede cambiarlo a alumnado de otro docente -> 403' {
    Assert-Status { Invoke-Api PATCH "/users/$($ajenoAlu.user.id)" @{ email = "x.$sufijo@colegio.test" } -Token $doc.token } 403
}

Test-Step 'Ni a otro docente -> 403' {
    Assert-Status { Invoke-Api PATCH "/users/$($otro.user.id)" @{ email = "x2.$sufijo@colegio.test" } -Token $doc.token } 403
}

Test-Step 'El alumnado no cambia correos -> 403' {
    Assert-Status { Invoke-Api PATCH "/users/$($ana.user.id)" @{ email = "x3.$sufijo@colegio.test" } -Token $tAlu } 403
}

Test-Step 'Un correo mal escrito -> 400' {
    Assert-Status { Invoke-Api PATCH "/users/$($ana.user.id)" @{ email = 'ana-sin-arroba' } -Token $doc.token } 400
}

Test-Step 'Un dominio reservado de la aplicacion -> 400' {
    Assert-Status { Invoke-Api PATCH "/users/$($ana.user.id)" @{ email = "ana.$sufijo@qr.local" } -Token $doc.token } 400
}

Test-Step 'Un correo que ya usa otra cuenta -> 409' {
    Assert-Status { Invoke-Api PATCH "/users/$($ana.user.id)" @{ email = $otro.user.email } -Token $doc.token } 409
}

Test-Step 'Si la otra cuenta esta vacia, el aviso explica que hacer' {
    # El caso tipico: entro con Microsoft antes de corregir el correo.
    $vacia = "vacia.$sufijo@colegio.test"
    $null = Invoke-Api POST '/auth/register' @{ email = $vacia; password = 'Secreto12345'; fullName = "Cuenta Vacia $sufijo"; role = 'student' }
    $m = Error-De { Invoke-Api PATCH "/users/$($ana.user.id)" @{ email = $vacia } -Token $doc.token }
    if ($m -notmatch 'vac') { throw "Mensaje: $m" }
    if ($m -notmatch "Cuenta Vacia $sufijo") { throw "No dice de quien es: $m" }
}

Invoke-Api POST '/auth/register' @{ email = "tradm.$sufijo@test.local"; password = 'Secreto12345'; fullName = 'Admin Correo'; role = 'teacher' } | Out-Null
Sql "UPDATE users SET role='admin' WHERE email='tradm.$sufijo@test.local'"
$tokenAdmin = (Invoke-Api POST '/auth/login' @{ email = "tradm.$sufijo@test.local"; password = 'Secreto12345' }).token

Test-Step 'La administracion cambia el correo de cualquier alumno' {
    $c = "beto.$sufijo@colegio.test"
    $u = (Invoke-Api PATCH "/users/$($ajenoAlu.user.id)" @{ email = $c } -Token $tokenAdmin).user
    if ($u.email -ne $c) { throw "Quedo $($u.email)" }
}

# ======================================================================
Write-Host "`n-- Phidias no duplica ni pisa el correo corregido --" -ForegroundColor Cyan

# Por npm y no con npx desde la raiz: asi arranca en apps/api y lee su .env. Y con
# los errores en "Continue": en PowerShell 5.1 cualquier linea a stderr de un
# programa externo aborta el guion entero si la preferencia es "Stop".
$preferencia = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$salida = npm run --silent check:db --workspace @bookstudio/api 2>&1 | Out-String
$codigoDb = $LASTEXITCODE
$ErrorActionPreference = $preferencia
foreach ($linea in ($salida -split "`n")) {
    if ($linea -match '^\s+OK\s+(.+)$') { Write-Host "  OK   $($Matches[1].Trim())" -ForegroundColor Green; $pass++ }
}
if ($codigoDb -ne 0) {
    Write-Host "  FAIL comprobacion de Phidias contra la base -> $(($salida -split "`n" | Select-Object -Last 6) -join ' ')" -ForegroundColor Red
    $fail++
}

# --- Limpieza ---
foreach ($lib in @($lengua, $mates, $ciencias)) {
    try { Invoke-Api DELETE "/libraries/$($lib.id)" -Token $doc.token | Out-Null } catch {}
}
try { Invoke-Api DELETE "/libraries/$($ajena.id)" -Token $otro.token | Out-Null } catch {}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }
