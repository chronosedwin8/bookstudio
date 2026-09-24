# Ensayo funcional de la tanda del 24 de septiembre de 2026:
#   formato del libro, copiar/pegar paginas entre libros, libros para el alumnado,
#   borrado masivo de la administracion, nombres por partes, "Entregar" solo para
#   docentes e ilustraciones variadas.
#
# Lo que mas se vigila: que nada quede a medias, que los permisos esten cerrados y
# que repetir una operacion no duplique.
$ErrorActionPreference = 'Stop'
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

function Sql($sentencia) {
    npm run --silent sql --workspace @bookstudio/api -- $sentencia | Out-Null
}

function Libros-De($libraryId, $token) {
    $r = Invoke-Api GET "/books?libraryId=$libraryId" -Token $token
    if ($r.books) { return @($r.books) } else { return @($r) }
}

# Libro con una caja de texto (con su tamano de letra) y un circulo cuadrado.
function Nuevo-Libro {
    param([string]$Titulo, [string]$Formato, [string]$Token, [string]$LibraryId)
    $cuerpo = @{ title = $Titulo; layoutFormat = $Formato }
    if ($LibraryId) { $cuerpo.libraryId = $LibraryId }
    $libro = (Invoke-Api POST '/books' $cuerpo -Token $Token).book
    $d = (Invoke-Api GET "/books/$($libro.id)" -Token $Token).book
    $null = Invoke-Api POST "/books/$($libro.id)/pages/$($d.pages[0].id)/elements" @{
        type = 'text'; transformMatrix = @{ x = 10; y = 10; width = 40; height = 20; angle = 0 }
        properties = @{ text = "Hola $Titulo"; fontSize = 48 }
    } -Token $Token
    $null = Invoke-Api POST "/books/$($libro.id)/pages/$($d.pages[0].id)/elements" @{
        type = 'shape'; transformMatrix = @{ x = 50; y = 50; width = 20; height = 20; angle = 0 }
        properties = @{ shape = 'ellipse' }
    } -Token $Token
    return $libro
}

Write-Host "`n== Bibliotecas, paginas y alumnado: ensayo funcional ==" -ForegroundColor Cyan

$sufijo = [guid]::NewGuid().ToString('N').Substring(0, 6)
$doc = Invoke-Api POST '/auth/register' @{ email = "bp.$sufijo@test.local"; password = 'Secreto12345'; fullName = 'Docente Paginas'; role = 'teacher' }
$otro = Invoke-Api POST '/auth/register' @{ email = "bp2.$sufijo@test.local"; password = 'Secreto12345'; fullName = 'Docente Ajeno'; role = 'teacher' }
$clase = (Invoke-Api POST '/libraries' @{ name = "Clase paginas $sufijo" } -Token $doc.token).library
$ajena = (Invoke-Api POST '/libraries' @{ name = "Ajena $sufijo" } -Token $otro.token).library

$ana = Invoke-Api POST '/auth/students' @{ fullName = "Ana Paginas $sufijo"; libraryId = $clase.id } -Token $doc.token
$beto = Invoke-Api POST '/auth/students' @{ fullName = "Beto Paginas $sufijo"; libraryId = $clase.id } -Token $doc.token
$null = Invoke-Api POST "/users/$($ana.user.id)/password" @{ password = 'ClaveAna12345' } -Token $doc.token
$tAna = (Invoke-Api POST '/auth/login' @{ email = $ana.user.email; password = 'ClaveAna12345' }).token

# ======================================================================
Write-Host "`n-- Cambiar el formato de un libro ya hecho --" -ForegroundColor Cyan

$apaisado = Nuevo-Libro "Formato $sufijo" 'landscape' $doc.token

# Tamano real de la forma en el lienzo (1000 de ancho; el alto depende del formato).
$ALTO = @{ square = 1000; portrait = 1000 / 0.75; landscape = 1000 / (4 / 3) }
function Proporcion-Real($bookId, $token) {
    $d = (Invoke-Api GET "/books/$bookId" -Token $token).book
    $c = $d.pages[0].elements | Where-Object { $_.type -eq 'shape' }
    return ($c.transformMatrix.width * 10) / ($c.transformMatrix.height * $ALTO[$d.layoutFormat] / 100)
}
$proporcionAntes = Proporcion-Real $apaisado.id $doc.token

Test-Step 'Se cambia de apaisado a vertical' {
    $b = (Invoke-Api PUT "/books/$($apaisado.id)/format" @{ layoutFormat = 'portrait' } -Token $doc.token).book
    if ($b.layoutFormat -ne 'portrait') { throw "Formato: $($b.layoutFormat)" }
}

Test-Step 'La forma conserva su proporcion real (no se estira)' {
    # Una caja del 20% x 20% en apaisado mide 200 x 150: no es un circulo, y
    # tiene que seguir midiendo lo mismo en proporcion despues del cambio.
    $despues = Proporcion-Real $apaisado.id $doc.token
    if ([math]::Abs($despues - $proporcionAntes) -gt 0.01) { throw "Antes $proporcionAntes, despues $despues" }
}

Test-Step 'Y de vuelta a apaisado, la letra se reduce con su caja sin bajar de 24' {
    $null = Invoke-Api PUT "/books/$($apaisado.id)/format" @{ layoutFormat = 'landscape' } -Token $doc.token
    $d = (Invoke-Api GET "/books/$($apaisado.id)" -Token $doc.token).book
    $t = $d.pages[0].elements | Where-Object { $_.type -eq 'text' }
    if ($t.properties.fontSize -ge 48) { throw "La letra no se redujo: $($t.properties.fontSize)" }
    if ($t.properties.fontSize -lt 24) { throw "Bajo del minimo accesible: $($t.properties.fontSize)" }
}

Test-Step 'Un formato inventado se rechaza -> 400' {
    Assert-Status { Invoke-Api PUT "/books/$($apaisado.id)/format" @{ layoutFormat = 'panoramico' } -Token $doc.token } 400
}

Test-Step 'Quien no puede editar el libro no le cambia el formato -> 403 o 404' {
    try { Invoke-Api PUT "/books/$($apaisado.id)/format" @{ layoutFormat = 'square' } -Token $otro.token; throw 'No fallo' }
    catch { $c = $_.Exception.Response.StatusCode.value__; if ($c -ne 403 -and $c -ne 404) { throw "Llego $c" } }
}

Test-Step 'El alumnado tambien puede cambiar el formato de su propio libro' {
    $suyo = (Invoke-Api POST '/books' @{ title = "De Ana $sufijo"; layoutFormat = 'square' } -Token $tAna).book
    $b = (Invoke-Api PUT "/books/$($suyo.id)/format" @{ layoutFormat = 'portrait' } -Token $tAna).book
    if ($b.layoutFormat -ne 'portrait') { throw "Formato: $($b.layoutFormat)" }
}

# ======================================================================
Write-Host "`n-- Copiar varias paginas y pegarlas en otro libro --" -ForegroundColor Cyan

$origen = Nuevo-Libro "Origen $sufijo" 'square' $doc.token
$null = Invoke-Api POST "/books/$($origen.id)/pages" @{ backgroundColor = '#FFEEDD' } -Token $doc.token
$null = Invoke-Api POST "/books/$($origen.id)/pages" @{ backgroundColor = '#DDEEFF' } -Token $doc.token
$o = (Invoke-Api GET "/books/$($origen.id)" -Token $doc.token).book

$destino = Nuevo-Libro "Destino $sufijo" 'square' $doc.token
$null = Invoke-Api POST "/books/$($destino.id)/pages" @{ backgroundColor = '#000000' } -Token $doc.token
$dAntes = (Invoke-Api GET "/books/$($destino.id)" -Token $doc.token).book

Test-Step 'Se pegan dos paginas detras de la primera del destino' {
    # Se mandan en orden inverso: deben pegarse en el orden de su libro.
    $r = Invoke-Api POST "/books/$($destino.id)/pages/paste" @{
        sourceBookId = $origen.id; pageIds = @($o.pages[2].id, $o.pages[0].id); afterPageId = $dAntes.pages[0].id
    } -Token $doc.token
    if ($r.pageIds.Count -ne 2) { throw "Pegadas: $($r.pageIds.Count)" }
}

Test-Step 'Quedan en su sitio, en su orden, con su contenido' {
    $d = (Invoke-Api GET "/books/$($destino.id)" -Token $doc.token).book
    if ($d.pages.Count -ne 4) { throw "Paginas: $($d.pages.Count)" }
    $numeros = $d.pages | ForEach-Object { $_.pageNumber }
    if (($numeros -join ',') -ne '1,2,3,4') { throw "Numeracion: $($numeros -join ',')" }
    # 1 = la suya, 2 = copia de la portada del origen, 3 = copia de la tercera, 4 = la suya negra
    $texto = $d.pages[1].elements | Where-Object { $_.type -eq 'text' }
    if ($texto.properties.text -ne "Hola Origen $sufijo") { throw 'La segunda no es la portada del origen' }
    if ($d.pages[2].backgroundColor -ne '#DDEEFF') { throw "Fondo de la tercera: $($d.pages[2].backgroundColor)" }
    if ($d.pages[3].backgroundColor -ne '#000000') { throw 'La ultima del destino se movio' }
}

Test-Step 'Sin pagina de destino, se pegan al final' {
    $r = Invoke-Api POST "/books/$($destino.id)/pages/paste" @{ sourceBookId = $origen.id; pageIds = @($o.pages[1].id) } -Token $doc.token
    $d = (Invoke-Api GET "/books/$($destino.id)" -Token $doc.token).book
    if ($d.pages[-1].id -ne $r.pageIds[0]) { throw 'No quedo la ultima' }
}

Test-Step 'Editar la copia no toca el original' {
    $d = (Invoke-Api GET "/books/$($destino.id)" -Token $doc.token).book
    $el = $d.pages[1].elements | Where-Object { $_.type -eq 'text' }
    $null = Invoke-Api PATCH "/books/$($destino.id)/pages/$($d.pages[1].id)/elements/$($el.id)" @{ properties = @{ text = 'Cambiado' } } -Token $doc.token
    $o2 = (Invoke-Api GET "/books/$($origen.id)" -Token $doc.token).book
    $oel = $o2.pages[0].elements | Where-Object { $_.type -eq 'text' }
    if ($oel.properties.text -ne "Hola Origen $sufijo") { throw 'El original cambio' }
}

Test-Step 'No se pegan paginas de un libro que no se puede ver -> 404' {
    Assert-Status {
        Invoke-Api POST "/books/$($destino.id)/pages/paste" @{ sourceBookId = $origen.id; pageIds = @($o.pages[0].id) } -Token $otro.token
    } 404
}

Test-Step 'Ni en un libro ajeno -> 403 o 404' {
    $suyo = (Invoke-Api POST '/books' @{ title = "Ajeno $sufijo" } -Token $otro.token).book
    try {
        Invoke-Api POST "/books/$($suyo.id)/pages/paste" @{ sourceBookId = $origen.id; pageIds = @($o.pages[0].id) } -Token $doc.token
        throw 'No fallo'
    } catch { $c = $_.Exception.Response.StatusCode.value__; if ($c -ne 403 -and $c -ne 404) { throw "Llego $c" } }
}

Test-Step 'Una pagina de destino de otro libro -> 400' {
    Assert-Status {
        Invoke-Api POST "/books/$($destino.id)/pages/paste" @{ sourceBookId = $origen.id; pageIds = @($o.pages[0].id); afterPageId = $o.pages[0].id } -Token $doc.token
    } 400
}

# ======================================================================
Write-Host "`n-- Un libro para cada alumno --" -ForegroundColor Cyan

Test-Step 'En blanco: uno por alumno' {
    $r = Invoke-Api POST "/libraries/$($clase.id)/student-books" @{ mode = 'blank'; title = "Diario $sufijo"; layoutFormat = 'portrait' } -Token $doc.token
    if ($r.created -ne 2) { throw "Creados: $($r.created)" }
}

Test-Step 'Cada libro es del alumno, con portada y el formato pedido' {
    $libros = @(Libros-De $clase.id $doc.token | Where-Object { $_.title -eq "Diario $sufijo" })
    if ($libros.Count -ne 2) { throw "Libros: $($libros.Count)" }
    $autores = $libros | ForEach-Object { $_.creatorId } | Sort-Object
    $esperados = @($ana.user.id, $beto.user.id) | Sort-Object
    if (($autores -join ',') -ne ($esperados -join ',')) { throw 'No son de cada alumno' }
    foreach ($l in $libros) {
        if ($l.layoutFormat -ne 'portrait') { throw "Formato $($l.layoutFormat)" }
        if ($l.pageCount -ne 1) { throw "Paginas $($l.pageCount)" }
    }
}

Test-Step 'Repetirlo no duplica: quien ya tiene libro se salta' {
    $r = Invoke-Api POST "/libraries/$($clase.id)/student-books" @{ mode = 'blank'; title = "Diario $sufijo" } -Token $doc.token
    if ($r.created -ne 0 -or $r.skipped -ne 2) { throw "Creados $($r.created), saltados $($r.skipped)" }
}

$modelo = Nuevo-Libro "Modelo $sufijo" 'landscape' $doc.token

Test-Step 'Copia de uno de Mis libros: uno por alumno' {
    $r = Invoke-Api POST "/libraries/$($clase.id)/student-books" @{ mode = 'copy'; sourceBookId = $modelo.id } -Token $doc.token
    if ($r.created -ne 2) { throw "Creados: $($r.created)" }
}

Test-Step 'Repetir la copia no duplica ni anade paginas' {
    $r = Invoke-Api POST "/libraries/$($clase.id)/student-books" @{ mode = 'copy'; sourceBookId = $modelo.id } -Token $doc.token
    if ($r.created -ne 0 -or $r.skipped -ne 2) { throw "Creados $($r.created), saltados $($r.skipped)" }
    $copias = @(Libros-De $clase.id $doc.token | Where-Object { $_.title -eq "Modelo $sufijo" })
    foreach ($c in $copias) { if ($c.pageCount -ne 1) { throw "Una copia tiene $($c.pageCount) paginas" } }
}

Test-Step 'Otro docente no crea libros en mi biblioteca -> 403' {
    Assert-Status { Invoke-Api POST "/libraries/$($clase.id)/student-books" @{ mode = 'blank'; title = 'X' } -Token $otro.token } 403
}

Test-Step 'Ni el alumnado -> 403' {
    Assert-Status { Invoke-Api POST "/libraries/$($clase.id)/student-books" @{ mode = 'blank'; title = 'X' } -Token $tAna } 403
}

Test-Step 'Una biblioteca sin alumnado lo dice -> 400' {
    Assert-Status { Invoke-Api POST "/libraries/$($ajena.id)/student-books" @{ mode = 'blank'; title = 'X' } -Token $otro.token } 400
}

# ======================================================================
Write-Host "`n-- Entregar es solo de docentes --" -ForegroundColor Cyan

Test-Step 'El alumnado no puede entregar -> 403' {
    $suyo = (Invoke-Api POST '/books' @{ title = "Para entregar $sufijo"; libraryId = $clase.id } -Token $tAna).book
    Assert-Status { Invoke-Api POST "/libraries/$($clase.id)/distribute" @{ sourceBookId = $suyo.id } -Token $tAna } 403
}

# ======================================================================
Write-Host "`n-- Nombres por partes --" -ForegroundColor Cyan

Test-Step 'El docente corrige apellidos y nombres: salen apellidos primero' {
    $u = (Invoke-Api PATCH "/users/$($ana.user.id)" @{ givenName = 'Ana Lucía'; familyName = "Pérez Gómez $sufijo" } -Token $doc.token).user
    if ($u.fullName -ne "Pérez Gómez $sufijo Ana Lucía") { throw "Quedo: $($u.fullName)" }
    if ($u.givenName -ne 'Ana Lucía' -or $u.familyName -ne "Pérez Gómez $sufijo") { throw 'No guardo las partes' }
}

Test-Step 'La biblioteca devuelve las partes para editarlo despues' {
    $m = Invoke-Api GET "/libraries/$($clase.id)/members" -Token $doc.token
    $a = $m.students | Where-Object { $_.id -eq $ana.user.id }
    if ($a.givenName -ne 'Ana Lucía') { throw "givenName: $($a.givenName)" }
}

Test-Step 'Sin apellidos no se guarda -> 400' {
    Assert-Status { Invoke-Api PATCH "/users/$($ana.user.id)" @{ givenName = 'Ana'; familyName = '   ' } -Token $doc.token } 400
}

Test-Step 'Ni a alumnado ajeno -> 403' {
    $ajeno = Invoke-Api POST '/auth/students' @{ fullName = "Carla Ajena $sufijo"; libraryId = $ajena.id } -Token $otro.token
    Assert-Status { Invoke-Api PATCH "/users/$($ajeno.user.id)" @{ givenName = 'X'; familyName = 'Y' } -Token $doc.token } 403
}

# ======================================================================
Write-Host "`n-- Borrado masivo de la administracion --" -ForegroundColor Cyan

Invoke-Api POST '/auth/register' @{ email = "bpadm.$sufijo@test.local"; password = 'Secreto12345'; fullName = 'Admin Paginas'; role = 'teacher' } | Out-Null
Sql "UPDATE users SET role='admin' WHERE email='bpadm.$sufijo@test.local'"
$tAdmin = (Invoke-Api POST '/auth/login' @{ email = "bpadm.$sufijo@test.local"; password = 'Secreto12345' }).token

Test-Step 'Un docente no ve el listado de todos los libros -> 403' {
    Assert-Status { Invoke-Api GET '/books/admin/all' -Token $doc.token } 403
}

Test-Step 'Ni borra en masa -> 403' {
    Assert-Status { Invoke-Api POST '/books/admin/bulk-delete' @{ bookIds = @($modelo.id) } -Token $doc.token } 403
}

$aBorrar = Test-Step 'La administracion encuentra libros de varias personas buscando' {
    $r = Invoke-Api GET "/books/admin/all?search=$sufijo&pageSize=200" -Token $tAdmin
    $ids = @($r.items | ForEach-Object { $_.id })
    if ($ids -notcontains $modelo.id) { throw 'No aparece el del docente' }
    $deAna = @($r.items | Where-Object { $_.creatorEmail -eq $ana.user.email })
    if (-not $deAna.Count) { throw 'No aparecen los de la alumna' }
    @($modelo.id, $deAna[0].id)
}

Test-Step 'Borra de una vez libros de personas distintas' {
    $r = Invoke-Api POST '/books/admin/bulk-delete' @{ bookIds = $aBorrar } -Token $tAdmin
    if ($r.deleted -ne 2) { throw "Borrados: $($r.deleted)" }
    Assert-Status { Invoke-Api GET "/books/$($modelo.id)" -Token $doc.token } 404
}

Test-Step 'Y no toca los demas' {
    $d = (Invoke-Api GET "/books/$($origen.id)" -Token $doc.token).book
    if (-not $d.id) { throw 'Borro de mas' }
}

# ======================================================================
Write-Host "`n-- Ilustraciones --" -ForegroundColor Cyan

Test-Step 'Pedir lo mismo dos veces da gente distinta (semilla nueva)' {
    $a = Invoke-Api POST '/illustrations/analizar' @{ texto = "Dos estudiantes leyendo $sufijo" } -Token $doc.token
    $b = Invoke-Api POST '/illustrations/analizar' @{ texto = "Dos estudiantes leyendo $sufijo" } -Token $doc.token
    if (-not $a.ilustracion.escena.semilla) { throw 'Sin semilla' }
    if ($a.ilustracion.escena.semilla -eq $b.ilustracion.escena.semilla) { throw 'La misma semilla dos veces' }
}

Test-Step 'Lo que no es una escena de clase se avisa' {
    $r = Invoke-Api POST '/illustrations/analizar' @{ texto = "Un volcán en erupción $sufijo" } -Token $doc.token
    if (-not $r.fueraDeAlcance) { throw 'No lo marca fuera de alcance' }
    if ($r.aviso -notmatch 'imagen con IA') { throw "Aviso: $($r.aviso)" }
}

Test-Step 'Y una escena de clase no lleva ese aviso' {
    $r = Invoke-Api POST '/illustrations/analizar' @{ texto = "Una profesora explicando a tres alumnos $sufijo" } -Token $doc.token
    if ($r.fueraDeAlcance) { throw 'La marco fuera de alcance' }
}

# --- Limpieza ---
foreach ($p in @(@($clase.id, $doc.token), @($ajena.id, $otro.token))) {
    try { Invoke-Api DELETE "/libraries/$($p[0])" -Token $p[1] | Out-Null } catch {}
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }
