# Ensayo funcional de plantillas, contenido incrustado y enlaces en los elementos.
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
        $args['Body'] = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 12 -Compress))
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

Write-Host "`n== Plantillas, embeds y enlaces: ensayo funcional ==" -ForegroundColor Cyan

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 6)
$user = Invoke-Api POST '/auth/register' @{ email = "pe.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Docente Plantillas'; role = 'teacher' }
$token = $user.token
$book = (Invoke-Api POST '/books' @{ title = 'Libro de plantillas' } -Token $token).book
$pageId = ((Invoke-Api GET "/books/$($book.id)" -Token $token).book).pages[0].id
$path = "/books/$($book.id)/pages/$pageId/elements"
$box = @{ x = 10; y = 10; width = 40; height = 30; angle = 0 }

# --- Plantillas: pagina con contenido en una sola peticion ---
Test-Step 'Crear una pagina con sus elementos de golpe' {
    $elementos = @(
        @{ type = 'text'; transformMatrix = @{ x = 6; y = 4; width = 88; height = 10; angle = 0 }
           properties = @{ text = 'Lluvia de ideas'; fontFamily = 'Fredoka'; fontSize = 44; textAlign = 'center'; bold = $true } },
        @{ type = 'shape'; transformMatrix = @{ x = 36; y = 43; width = 28; height = 16; angle = 0 }
           properties = @{ shape = 'ellipse'; fillColor = '#1E293B'; strokeColor = '#1E293B'; strokeWidth = 0 } },
        @{ type = 'shape'; transformMatrix = @{ x = 4; y = 18; width = 26; height = 20; angle = 0 }
           properties = @{ shape = 'cloud'; fillColor = '#DBEAFE'; strokeColor = '#64748B'; strokeWidth = 2 } }
    )
    $r = Invoke-Api POST "/books/$($book.id)/pages" @{ backgroundColor = '#FFFFFF'; elements = $elementos } -Token $token
    if ($r.page.elements.Count -ne 3) { throw "Elementos: $($r.page.elements.Count)" }
    if ($r.page.elements[0].properties.text -ne 'Lluvia de ideas') { throw 'Texto no persistido' }
}

Test-Step 'Las capas de la plantilla respetan el orden recibido' {
    $d = (Invoke-Api GET "/books/$($book.id)" -Token $token).book
    $pagina = $d.pages | Where-Object { $_.pageNumber -eq 2 }
    $z = $pagina.elements | ForEach-Object { $_.zIndex }
    if ("$z" -ne "$(0..2)") { throw "z-index inesperado: $z" }
}

Test-Step 'Una plantilla con un elemento invalido no crea la pagina -> 400' {
    $antes = ((Invoke-Api GET "/books/$($book.id)" -Token $token).book).pages.Count
    Assert-Status {
        Invoke-Api POST "/books/$($book.id)/pages" @{
            backgroundColor = '#FFFFFF'
            elements = @(
                @{ type = 'shape'; transformMatrix = $box; properties = @{ shape = 'rectangle' } },
                @{ type = 'shape'; transformMatrix = $box; properties = @{ shape = 'forma-inventada' } }
            )
        } -Token $token
    } 400
    $despues = ((Invoke-Api GET "/books/$($book.id)" -Token $token).book).pages.Count
    if ($antes -ne $despues) { throw 'La pagina se creo pese al elemento invalido' }
}

# --- Contenido incrustado ---
Write-Host "`n-- Contenido incrustado --" -ForegroundColor Cyan

Test-Step 'YouTube se normaliza a youtube-nocookie' {
    $r = Invoke-Api POST $path @{
        type = 'embed'; transformMatrix = $box
        properties = @{ sourceUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42'; title = 'Video' }
    } -Token $token
    if ($r.element.properties.provider -ne 'youtube') { throw "Proveedor: $($r.element.properties.provider)" }
    if ($r.element.properties.embedUrl -ne 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ') {
        throw "URL: $($r.element.properties.embedUrl)"
    }
}

Test-Step 'Un documento de Google se incrusta en modo lectura' {
    $r = Invoke-Api POST $path @{
        type = 'embed'; transformMatrix = $box
        properties = @{ sourceUrl = 'https://docs.google.com/document/d/1AbC_dEfGhIjKlMnOpQrStUv/edit?usp=sharing' }
    } -Token $token
    if ($r.element.properties.provider -ne 'google-docs') { throw "Proveedor: $($r.element.properties.provider)" }
    if ($r.element.properties.embedUrl -notlike '*/preview') { throw "No es de solo lectura: $($r.element.properties.embedUrl)" }
}

Test-Step 'Internet Archive (libros gratis) se incrusta' {
    $r = Invoke-Api POST $path @{
        type = 'embed'; transformMatrix = $box
        properties = @{ sourceUrl = 'https://archive.org/details/donquijote00cerv' }
    } -Token $token
    if ($r.element.properties.provider -ne 'archive') { throw "Proveedor: $($r.element.properties.provider)" }
}

Test-Step 'Un dominio suplantado se rechaza -> 400' {
    Assert-Status {
        Invoke-Api POST $path @{
            type = 'embed'; transformMatrix = $box
            properties = @{ sourceUrl = 'https://youtube.com.malicioso.net/watch?v=dQw4w9WgXcQ' }
        } -Token $token
    } 400
}

Test-Step 'Un sitio cualquiera se rechaza -> 400' {
    Assert-Status {
        Invoke-Api POST $path @{
            type = 'embed'; transformMatrix = $box; properties = @{ sourceUrl = 'https://ejemplo-malicioso.com/pagina' }
        } -Token $token
    } 400
}

Test-Step 'Un enlace javascript: se rechaza -> 400' {
    Assert-Status {
        Invoke-Api POST $path @{
            type = 'embed'; transformMatrix = $box; properties = @{ sourceUrl = 'javascript:alert(document.cookie)' }
        } -Token $token
    } 400
}

Test-Step 'El cliente no puede imponer su propia embedUrl' {
    $r = Invoke-Api POST $path @{
        type = 'embed'; transformMatrix = $box
        properties = @{
            sourceUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
            provider = 'wikipedia'
            embedUrl = 'https://sitio-atacante.example/panel'
        }
    } -Token $token
    if ($r.element.properties.embedUrl -like '*atacante*') { throw 'Se acepto la URL del cliente' }
    if ($r.element.properties.provider -ne 'youtube') { throw 'Se acepto el proveedor del cliente' }
}

# --- Enlaces en los elementos ---
Write-Host "`n-- Enlaces --" -ForegroundColor Cyan

Test-Step 'Un texto admite enlace' {
    $r = Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box
        properties = @{ text = 'Visita la web'; linkUrl = 'https://es.wikipedia.org/wiki/Machu_Picchu' }
    } -Token $token
    if ($r.element.properties.linkUrl -ne 'https://es.wikipedia.org/wiki/Machu_Picchu') { throw 'No persistio' }
}

Test-Step 'Una imagen admite enlace' {
    $r = Invoke-Api POST $path @{
        type = 'image'; transformMatrix = $box
        properties = @{ fileUrl = 'https://ejemplo.org/foto.png'; linkUrl = 'https://ejemplo.org' }
    } -Token $token
    if ($r.element.properties.linkUrl -ne 'https://ejemplo.org') { throw 'No persistio' }
}

Test-Step 'Una forma admite enlace' {
    $r = Invoke-Api POST $path @{
        type = 'shape'; transformMatrix = $box
        properties = @{ shape = 'star'; linkUrl = 'https://ejemplo.org/estrella' }
    } -Token $token
    if ($r.element.properties.linkUrl -ne 'https://ejemplo.org/estrella') { throw 'No persistio' }
}

Test-Step 'Un icono admite enlace' {
    $r = Invoke-Api POST $path @{
        type = 'icon'; transformMatrix = $box
        properties = @{ source = 'library'; paths = @('M0 0 L10 10'); linkUrl = 'https://ejemplo.org/icono' }
    } -Token $token
    if ($r.element.properties.linkUrl -ne 'https://ejemplo.org/icono') { throw 'No persistio' }
}

Test-Step 'Un enlace javascript: en un texto se rechaza -> 400' {
    Assert-Status {
        Invoke-Api POST $path @{
            type = 'text'; transformMatrix = $box
            properties = @{ text = 'Trampa'; linkUrl = 'javascript:alert(document.cookie)' }
        } -Token $token
    } 400
}

Test-Step 'Un enlace data: en una imagen se rechaza -> 400' {
    Assert-Status {
        Invoke-Api POST $path @{
            type = 'image'; transformMatrix = $box
            properties = @{ fileUrl = 'https://ejemplo.org/foto.png'; linkUrl = 'data:text/html,<script>alert(1)</script>' }
        } -Token $token
    } 400
}

Test-Step 'Un elemento sin enlace queda con la cadena vacia' {
    $r = Invoke-Api POST $path @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'Sin enlace' }
    } -Token $token
    if ($r.element.properties.linkUrl -ne '') { throw "Valor inesperado: '$($r.element.properties.linkUrl)'" }
}

Test-Step 'Todo lo insertado persiste tras recargar el libro' {
    $d = (Invoke-Api GET "/books/$($book.id)" -Token $token).book
    $pagina = $d.pages | Where-Object { $_.id -eq $pageId }
    $embeds = ($pagina.elements | Where-Object { $_.type -eq 'embed' }).Count
    $enlaces = ($pagina.elements | Where-Object { $_.properties.linkUrl }).Count
    if ($embeds -lt 4) { throw "Solo $embeds embeds" }
    if ($enlaces -lt 4) { throw "Solo $enlaces elementos con enlace" }
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }
