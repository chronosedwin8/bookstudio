# Ensayo funcional de la comparticion por enlace y de las imagenes animadas.
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api'
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

Write-Host "`n== Compartir libros: ensayo funcional ==" -ForegroundColor Cyan

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 6)
$autor = Invoke-Api POST '/auth/register' @{ email = "cp.a.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Autora Compartir'; role = 'teacher' }
$aToken = $autor.token
$ajeno = Invoke-Api POST '/auth/register' @{ email = "cp.x.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Persona Ajena'; role = 'teacher' }
$xToken = $ajeno.token

$lib = (Invoke-Api POST '/libraries' @{ name = "Clase compartir $suffix" } -Token $aToken).library
$libro = (Invoke-Api POST '/books' @{ title = 'Libro de clase'; libraryId = $lib.id } -Token $aToken).book
$personal = (Invoke-Api POST '/books' @{ title = 'Libro personal' } -Token $aToken).book

# --- Estado inicial ---
Test-Step 'Un libro nace privado y sin enlace' {
    $d = (Invoke-Api GET "/books/$($libro.id)" -Token $aToken).book
    if ($d.shareVisibility -ne 'private') { throw "Visibilidad: $($d.shareVisibility)" }
    if ($d.shareToken) { throw 'No deberia tener token todavia' }
}

# --- Publico ---
$publico = Test-Step 'Compartir en publico devuelve un enlace' {
    $r = Invoke-Api PUT "/books/$($libro.id)/share" @{ visibility = 'public' } -Token $aToken
    if ($r.share.visibility -ne 'public') { throw 'Visibilidad no aplicada' }
    if (-not $r.share.token) { throw 'Sin token' }
    $r.share
}

Test-Step 'Un anonimo abre el libro publico' {
    $r = (Invoke-RestMethod -Uri "$base/public/books/$($publico.token)").book
    if ($r.title -ne 'Libro de clase') { throw "Titulo: $($r.title)" }
    if ($r.pages.Count -lt 1) { throw 'Sin paginas' }
}

Test-Step 'El enlace publico llega en solo lectura' {
    $r = (Invoke-RestMethod -Uri "$base/public/books/$($publico.token)").book
    if ($r.permissions.canEdit) { throw 'canEdit deberia ser falso' }
    if ($r.permissions.isManager) { throw 'isManager deberia ser falso' }
}

Test-Step 'El enlace publico incluye el nombre del autor' {
    $r = (Invoke-RestMethod -Uri "$base/public/books/$($publico.token)").book
    if ($r.authorName -ne 'Autora Compartir') { throw "Autor: $($r.authorName)" }
}

Test-Step 'Un token inventado -> 404' {
    Assert-Status { Invoke-RestMethod -Uri "$base/public/books/$([guid]::NewGuid())" } 404
}

Test-Step 'Un token con formato invalido -> 400' {
    Assert-Status { Invoke-RestMethod -Uri "$base/public/books/no-es-uuid" } 400
}

# --- Restringido a la clase ---
$clase = Test-Step 'Compartir solo con la clase' {
    $r = Invoke-Api PUT "/books/$($libro.id)/share" @{ visibility = 'library' } -Token $aToken
    if ($r.share.visibility -ne 'library') { throw 'Visibilidad no aplicada' }
    $r.share
}

Test-Step 'El enlace se conserva al cambiar de visibilidad' {
    if ($clase.token -ne $publico.token) { throw 'El token cambio sin pedirlo' }
}

Test-Step 'Un anonimo no abre el libro de clase -> 401' {
    Assert-Status { Invoke-RestMethod -Uri "$base/public/books/$($clase.token)" } 401
}

Test-Step 'Alguien de fuera de la clase -> 403' {
    Assert-Status {
        Invoke-RestMethod -Uri "$base/public/books/$($clase.token)" -Headers @{ Authorization = "Bearer $xToken" }
    } 403
}

Test-Step 'Un miembro de la clase si lo abre' {
    $alumno = Invoke-Api POST '/auth/students' @{ fullName = 'Alumna Lectora'; libraryId = $lib.id } -Token $aToken
    $sToken = (Invoke-Api POST '/auth/login/qr' @{ token = $alumno.qrToken }).token
    $r = (Invoke-RestMethod -Uri "$base/public/books/$($clase.token)" -Headers @{ Authorization = "Bearer $sToken" }).book
    if ($r.title -ne 'Libro de clase') { throw 'No pudo abrirlo' }
}

Test-Step 'Un token caducado no impide ver un libro publico' {
    $null = Invoke-Api PUT "/books/$($libro.id)/share" @{ visibility = 'public' } -Token $aToken
    $r = (Invoke-RestMethod -Uri "$base/public/books/$($publico.token)" -Headers @{ Authorization = 'Bearer token.basura.invalido' }).book
    if ($r.title -ne 'Libro de clase') { throw 'La cabecera invalida bloqueo el acceso' }
}

# --- Revocacion ---
Test-Step 'Volver a privado corta el acceso -> 404' {
    $null = Invoke-Api PUT "/books/$($libro.id)/share" @{ visibility = 'private' } -Token $aToken
    Assert-Status { Invoke-RestMethod -Uri "$base/public/books/$($publico.token)" } 404
}

Test-Step 'Rotar el enlace invalida el anterior' {
    $null = Invoke-Api PUT "/books/$($libro.id)/share" @{ visibility = 'public' } -Token $aToken
    $nuevo = (Invoke-Api POST "/books/$($libro.id)/share/rotate" -Token $aToken).share
    if ($nuevo.token -eq $publico.token) { throw 'El token no cambio' }
    Assert-Status { Invoke-RestMethod -Uri "$base/public/books/$($publico.token)" } 404
    $r = (Invoke-RestMethod -Uri "$base/public/books/$($nuevo.token)").book
    if ($r.title -ne 'Libro de clase') { throw 'El enlace nuevo no sirve' }
}

# --- Permisos de comparticion ---
Test-Step 'Alguien de fuera de la clase no puede compartir el libro -> 403' {
    # Un libro de biblioteca revela que existe: getAccess responde 403 al no ser miembro.
    Assert-Status { Invoke-Api PUT "/books/$($libro.id)/share" @{ visibility = 'public' } -Token $xToken } 403
}

Test-Step 'Un libro personal ajeno ni siquiera se reconoce -> 404' {
    Assert-Status { Invoke-Api PUT "/books/$($personal.id)/share" @{ visibility = 'public' } -Token $xToken } 404
}

Test-Step 'Un libro personal no admite visibilidad de clase -> 400' {
    Assert-Status { Invoke-Api PUT "/books/$($personal.id)/share" @{ visibility = 'library' } -Token $aToken } 400
}

Test-Step 'Un libro personal si se comparte en publico' {
    $r = Invoke-Api PUT "/books/$($personal.id)/share" @{ visibility = 'public' } -Token $aToken
    $p = (Invoke-RestMethod -Uri "$base/public/books/$($r.share.token)").book
    if ($p.title -ne 'Libro personal') { throw 'No se abrio' }
}

Test-Step 'Visibilidad no contemplada -> 400' {
    Assert-Status { Invoke-Api PUT "/books/$($libro.id)/share" @{ visibility = 'todo-el-mundo' } -Token $aToken } 400
}

Test-Step 'Un alumno sin permiso de publicar no puede hacerlo publico -> 403' {
    $null = Invoke-Api PATCH "/libraries/$($lib.id)" @{ studentPublishable = $false } -Token $aToken
    $alumno = Invoke-Api POST '/auth/students' @{ fullName = 'Alumno Limitado'; libraryId = $lib.id } -Token $aToken
    $sToken = (Invoke-Api POST '/auth/login/qr' @{ token = $alumno.qrToken }).token
    $suyo = (Invoke-Api POST '/books' @{ title = 'Trabajo del alumno'; libraryId = $lib.id } -Token $sToken).book
    Assert-Status { Invoke-Api PUT "/books/$($suyo.id)/share" @{ visibility = 'public' } -Token $sToken } 403
}

# --- Imagenes animadas ---
Write-Host "`n-- Imagenes animadas --" -ForegroundColor Cyan

Test-Step 'La busqueda de GIF devuelve solo animadas con licencia abierta' {
    $r = Invoke-Api GET '/media/search?q=cat&extension=gif&pageSize=6' -Token $aToken
    if ($r.results.Count -lt 1) { throw 'Sin resultados' }
    $permitidas = @('CC0', 'PDM', 'BY', 'BY-SA')
    foreach ($item in $r.results) {
        if ($item.url -notmatch '\.gif($|\?)') { throw "No es un gif: $($item.url)" }
        $codigo = ($item.licence -split ' ')[0]
        if ($codigo -notin $permitidas) { throw "Licencia no permitida: $($item.licence)" }
    }
}

Test-Step 'Una extension no contemplada -> 400' {
    Assert-Status { Invoke-Api GET '/media/search?q=cat&extension=exe' -Token $aToken } 400
}

Test-Step 'Un GIF se inserta como imagen en la pagina' {
    $r = Invoke-Api GET '/media/search?q=cat&extension=gif&pageSize=3' -Token $aToken
    $gif = $r.results[0]
    $d = (Invoke-Api GET "/books/$($personal.id)" -Token $aToken).book
    $el = Invoke-Api POST "/books/$($personal.id)/pages/$($d.pages[0].id)/elements" @{
        type = 'image'; transformMatrix = @{ x = 10; y = 10; width = 30; height = 25; angle = 0 }
        properties = @{
            fileUrl = $gif.url; altText = $gif.title
            attribution = @{ author = $gif.creator; licence = $gif.licence; text = $gif.attributionText }
        }
    } -Token $aToken
    if ($el.element.properties.fileUrl -ne $gif.url) { throw 'URL no persistida' }
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }
