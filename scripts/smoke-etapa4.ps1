# Ensayo funcional de la Etapa 4 (multimedia open source).
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
        $args['Body'] = ($Body | ConvertTo-Json -Depth 10 -Compress)
        $args['ContentType'] = 'application/json'
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

Write-Host "`n== Etapa 4: ensayo funcional ==" -ForegroundColor Cyan

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 6)
$teacher = Invoke-Api POST '/auth/register' @{ email = "t4.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Profe Etapa4'; role = 'teacher' }
$tToken = $teacher.token
$lib = (Invoke-Api POST '/libraries' @{ name = "Geografia $suffix" } -Token $tToken).library
$book = (Invoke-Api POST '/books' @{ title = 'Libro multimedia'; libraryId = $lib.id } -Token $tToken).book
$pageId = ((Invoke-Api GET "/books/$($book.id)" -Token $tToken).book).pages[0].id
$elementsPath = "/books/$($book.id)/pages/$pageId/elements"
$box = @{ x = 10; y = 10; width = 30; height = 25; angle = 0 }

# --- Autenticacion de los proxies ---
Test-Step 'GET /media/search sin token -> 401' {
    Assert-Status { Invoke-RestMethod -Uri "$base/media/search?q=gato" } 401
}

Test-Step 'GET /media/geocode sin token -> 401' {
    Assert-Status { Invoke-RestMethod -Uri "$base/media/geocode?q=Paris" } 401
}

Test-Step 'Query demasiado corta -> 400' {
    Assert-Status { Invoke-Api GET '/media/search?q=a' -Token $tToken } 400
}

Test-Step 'Tipo de medio invalido -> 400' {
    Assert-Status { Invoke-Api GET '/media/search?q=gato&type=modelos3d' -Token $tToken } 400
}

# --- Openverse ---
$search = Test-Step 'GET /media/search devuelve resultados con licencia' {
    $r = Invoke-Api GET '/media/search?q=volcano&pageSize=6' -Token $tToken
    if ($r.results.Count -lt 1) { throw 'Sin resultados' }
    $first = $r.results[0]
    foreach ($field in @('url', 'thumbnail', 'creator', 'licence', 'attributionText')) {
        if (-not $first.$field) { throw "Falta el campo $field" }
    }
    $r
}

Test-Step 'Todas las licencias son CC o dominio publico' {
    $allowed = @('CC0', 'PDM', 'BY', 'BY-SA')
    foreach ($item in $search.results) {
        $code = ($item.licence -split ' ')[0]
        if ($code -notin $allowed) { throw "Licencia no permitida: $($item.licence)" }
    }
}

Test-Step 'La atribucion incluye autor y licencia' {
    $t = $search.results[0].attributionText
    if ($t -notmatch 'de ') { throw "Atribucion sin autor: $t" }
    if ($t -notmatch 'licencia') { throw "Atribucion sin licencia: $t" }
}

# --- Nominatim ---
$geo = Test-Step 'GET /media/geocode localiza un lugar' {
    $r = Invoke-Api GET '/media/geocode?q=Machu%20Picchu&limit=3' -Token $tToken
    if ($r.results.Count -lt 1) { throw 'Sin resultados' }
    $first = $r.results[0]
    if ($first.latitude -lt -90 -or $first.latitude -gt 90) { throw "Latitud invalida: $($first.latitude)" }
    if ($first.longitude -lt -180 -or $first.longitude -gt 180) { throw "Longitud invalida: $($first.longitude)" }
    $first
}

Test-Step 'Coordenadas de Machu Picchu son plausibles' {
    if ([math]::Abs($geo.latitude - (-13.16)) -gt 1) { throw "Latitud inesperada: $($geo.latitude)" }
    if ([math]::Abs($geo.longitude - (-72.54)) -gt 1) { throw "Longitud inesperada: $($geo.longitude)" }
}

# --- Elemento de mapa ---
$mapEl = Test-Step 'POST elemento de mapa' {
    $r = Invoke-Api POST $elementsPath @{
        type = 'map'; transformMatrix = $box
        properties = @{ latitude = $geo.latitude; longitude = $geo.longitude; zoom = 14; label = 'Machu Picchu' }
    } -Token $tToken
    if ($r.element.type -ne 'map') { throw 'Tipo incorrecto' }
    if ($r.element.properties.zoom -ne 14) { throw 'Zoom no persistido' }
    if (-not $r.element.properties.showMarker) { throw 'showMarker deberia ser true por defecto' }
    $r.element
}

Test-Step 'Rechaza latitud fuera de rango -> 400' {
    Assert-Status {
        Invoke-Api POST $elementsPath @{
            type = 'map'; transformMatrix = $box; properties = @{ latitude = 200; longitude = 0 }
        } -Token $tToken
    } 400
}

Test-Step 'Rechaza zoom fuera de rango -> 400' {
    Assert-Status {
        Invoke-Api POST $elementsPath @{
            type = 'map'; transformMatrix = $box; properties = @{ latitude = 0; longitude = 0; zoom = 99 }
        } -Token $tToken
    } 400
}

# --- Imagen con atribucion ---
Test-Step 'POST imagen con atribucion CC' {
    $img = $search.results[0]
    $r = Invoke-Api POST $elementsPath @{
        type = 'image'; transformMatrix = $box
        properties = @{
            fileUrl = $img.url; altText = $img.title
            attribution = @{ author = $img.creator; licence = $img.licence; sourceUrl = $img.sourceUrl; text = $img.attributionText }
        }
    } -Token $tToken
    if ($r.element.properties.attribution.author -ne $img.creator) { throw 'Autor no persistido' }
    if (-not $r.element.properties.attribution.text) { throw 'Texto de atribucion vacio' }
}

Test-Step 'Rechaza fileUrl con esquema peligroso -> 400' {
    Assert-Status {
        Invoke-Api POST $elementsPath @{
            type = 'image'; transformMatrix = $box
            properties = @{ fileUrl = 'javascript:alert(1)' }
        } -Token $tToken
    } 400
}

# --- Subida de archivos ---
$pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

$upload = Test-Step 'POST /media/uploads acepta PNG valido' {
    $r = Invoke-Api POST '/media/uploads' @{ dataUrl = $pngDataUrl } -Token $tToken
    if ($r.kind -ne 'image') { throw "Tipo incorrecto: $($r.kind)" }
    if ($r.fileUrl -notlike '*/image/*') { throw "Ruta inesperada: $($r.fileUrl)" }
    $r
}

Test-Step 'El archivo subido se sirve por HTTP' {
    $r = Invoke-WebRequest -Uri "http://localhost:4000$($upload.fileUrl)" -UseBasicParsing
    if ($r.StatusCode -ne 200) { throw "Status $($r.StatusCode)" }
    if ($r.Headers['X-Content-Type-Options'] -ne 'nosniff') { throw 'Falta cabecera nosniff' }
}

Test-Step 'Cada usuario guarda en su propio directorio' {
    if ($upload.fileUrl -notlike "*/$($teacher.user.id)/*") { throw "No aisla por usuario: $($upload.fileUrl)" }
}

Test-Step 'Rechaza tipo MIME no permitido -> 400' {
    Assert-Status {
        Invoke-Api POST '/media/uploads' @{ dataUrl = 'data:application/x-msdownload;base64,TVqQAAMAAAAEAAAA' } -Token $tToken
    } 400
}

Test-Step 'Rechaza SVG (vector de XSS) -> 400' {
    $svg = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('<svg onload="alert(1)"/>'))
    Assert-Status { Invoke-Api POST '/media/uploads' @{ dataUrl = "data:image/svg+xml;base64,$svg" } -Token $tToken } 400
}

Test-Step 'Rechaza contenido que no coincide con el MIME declarado -> 400' {
    $fake = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('esto no es un png'))
    Assert-Status { Invoke-Api POST '/media/uploads' @{ dataUrl = "data:image/png;base64,$fake" } -Token $tToken } 400
}

Test-Step 'Rechaza data URL malformada -> 400' {
    Assert-Status { Invoke-Api POST '/media/uploads' @{ dataUrl = 'no-soy-una-data-url-pero-soy-larga-igual' } -Token $tToken } 400
}

Test-Step 'Acepta data URL con codecs (formato de MediaRecorder)' {
    # Cabecera EBML minima de WebM, tal como la emite MediaRecorder.
    $webm = [Convert]::ToBase64String([byte[]](0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00))
    $r = Invoke-Api POST '/media/uploads' @{ dataUrl = "data:audio/webm;codecs=opus;base64,$webm" } -Token $tToken
    if ($r.kind -ne 'audio') { throw "Tipo incorrecto: $($r.kind)" }
    if ($r.mimeType -ne 'audio/webm') { throw "MIME sin normalizar: $($r.mimeType)" }
}

$videoUpload = Test-Step 'Acepta data URL de video con codecs separados por coma' {
    # Regresion: "video/webm;codecs=vp9,opus" es el tipo que emite Chrome al grabar video.
    $webm = [Convert]::ToBase64String([byte[]](0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00))
    $r = Invoke-Api POST '/media/uploads' @{ dataUrl = "data:video/webm;codecs=vp9,opus;base64,$webm" } -Token $tToken
    if ($r.kind -ne 'video') { throw "Tipo incorrecto: $($r.kind)" }
    if ($r.mimeType -ne 'video/webm') { throw "MIME sin normalizar: $($r.mimeType)" }
    if ($r.fileUrl -notlike '*/video/*') { throw "Ruta inesperada: $($r.fileUrl)" }
    $r
}

Test-Step 'Rechaza grabacion vacia -> 400' {
    # Lo que llegaba cuando MediaRecorder no emitia chunks: cabecera sin carga util.
    Assert-Status { Invoke-Api POST '/media/uploads' @{ dataUrl = 'data:video/webm;codecs=vp9,opus;base64,' } -Token $tToken } 400
}

Test-Step 'Rechaza carga que no es base64 -> 400' {
    Assert-Status { Invoke-Api POST '/media/uploads' @{ dataUrl = 'data:image/png;base64,<<<no-es-base64-pero-es-largo>>>' } -Token $tToken } 400
}

Test-Step 'Subida sin token -> 401' {
    Assert-Status {
        Invoke-RestMethod -Method POST -Uri "$base/media/uploads" -Body (@{ dataUrl = $pngDataUrl } | ConvertTo-Json) -ContentType 'application/json'
    } 401
}

# --- Elementos multimedia con archivos locales ---
Test-Step 'POST elemento de audio con hotspot' {
    $r = Invoke-Api POST $elementsPath @{
        type = 'audio'; transformMatrix = @{ x = 60; y = 10; width = 12; height = 12; angle = 0 }
        properties = @{ fileUrl = $upload.fileUrl; durationSeconds = 12.5; hotspotColor = '#7C3AED' }
    } -Token $tToken
    if ($r.element.properties.hotspotColor -ne '#7C3AED') { throw 'Color del hotspot no persistido' }
    if ($r.element.properties.durationSeconds -ne 12.5) { throw 'Duracion no persistida' }
}

Test-Step 'POST elemento de video' {
    $r = Invoke-Api POST $elementsPath @{
        type = 'video'; transformMatrix = $box
        properties = @{ fileUrl = $videoUpload.fileUrl; durationSeconds = 2.5; captionsText = 'Subtitulos de prueba' }
    } -Token $tToken
    if ($r.element.properties.captionsText -ne 'Subtitulos de prueba') { throw 'Subtitulos no persistidos' }
    if ($r.element.properties.durationSeconds -ne 2.5) { throw 'Duracion fraccionaria no persistida' }
}

Test-Step 'Rechaza hotspotColor invalido -> 400' {
    Assert-Status {
        Invoke-Api POST $elementsPath @{
            type = 'audio'; transformMatrix = $box
            properties = @{ fileUrl = $upload.fileUrl; hotspotColor = 'morado' }
        } -Token $tToken
    } 400
}

Test-Step 'GET /media/limits expone la politica de subida' {
    $r = Invoke-Api GET '/media/limits' -Token $tToken
    if ($r.allowedMimeTypes -notcontains 'image/png') { throw 'Falta image/png' }
    if ($r.allowedMimeTypes -contains 'image/svg+xml') { throw 'SVG no deberia estar permitido' }
    if (-not $r.maxBytes.video) { throw 'Falta el limite de video' }
}

Test-Step 'Todos los elementos multimedia persisten' {
    $d = (Invoke-Api GET "/books/$($book.id)" -Token $tToken).book
    $page = $d.pages | Where-Object { $_.id -eq $pageId }
    foreach ($type in @('map', 'image', 'audio', 'video')) {
        if (-not ($page.elements | Where-Object { $_.type -eq $type })) { throw "Falta elemento de tipo $type" }
    }
}

Test-Step 'Alumno tambien puede buscar y subir' {
    $student = Invoke-Api POST '/auth/students' @{ fullName = 'Explorador Prueba'; libraryId = $lib.id } -Token $tToken
    $sToken = (Invoke-Api POST '/auth/login/qr' @{ token = $student.qrToken }).token
    $r = Invoke-Api POST '/media/uploads' @{ dataUrl = $pngDataUrl } -Token $sToken
    if ($r.fileUrl -notlike "*/$($student.user.id)/*") { throw 'El alumno no guarda en su propio directorio' }
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }
