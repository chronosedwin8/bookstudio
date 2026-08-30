# Ensayo funcional de la Etapa 3 (texto inclusivo y trazos vectoriales).
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

Write-Host "`n== Etapa 3: ensayo funcional ==" -ForegroundColor Cyan

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 6)
$teacher = Invoke-Api POST '/auth/register' @{ email = "t3.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Profe Etapa3'; role = 'teacher' }
$tToken = $teacher.token
$lib = (Invoke-Api POST '/libraries' @{ name = "Arte $suffix" } -Token $tToken).library
$book = (Invoke-Api POST '/books' @{ title = 'Libro de dibujo'; libraryId = $lib.id } -Token $tToken).book
$pageId = ((Invoke-Api GET "/books/$($book.id)" -Token $tToken).book).pages[0].id

$elementsPath = "/books/$($book.id)/pages/$pageId/elements"
$box = @{ x = 10; y = 10; width = 30; height = 20; angle = 0 }

# --- Tipografias inclusivas ---
foreach ($font in @('OpenDyslexic', 'Cabin', 'Lato', 'Noto Sans')) {
    Test-Step "Acepta tipografia $font" {
        $r = Invoke-Api POST $elementsPath @{
            type = 'text'; transformMatrix = $box
            properties = @{ text = "Prueba $font"; fontFamily = $font; fontSize = 24 }
        } -Token $tToken
        if ($r.element.properties.fontFamily -ne $font) { throw 'No persistio la fuente' }
    }
}

Test-Step 'Rechaza tipografia no inclusiva -> 400' {
    Assert-Status {
        Invoke-Api POST $elementsPath @{
            type = 'text'; transformMatrix = $box
            properties = @{ text = 'Hola'; fontFamily = 'Comic Sans MS' }
        } -Token $tToken
    } 400
}

Test-Step 'Default: alineacion izquierda (no justificado)' {
    $r = Invoke-Api POST $elementsPath @{
        type = 'text'; transformMatrix = $box; properties = @{ text = 'Sin alinear' }
    } -Token $tToken
    if ($r.element.properties.textAlign -ne 'left') { throw "Alineacion por defecto: $($r.element.properties.textAlign)" }
}

Test-Step 'Rechaza alineacion justificada -> 400' {
    Assert-Status {
        Invoke-Api POST $elementsPath @{
            type = 'text'; transformMatrix = $box; properties = @{ text = 'X'; textAlign = 'justify' }
        } -Token $tToken
    } 400
}

Test-Step 'Acepta fondo suave hueso/opalo' {
    $r = Invoke-Api POST $elementsPath @{
        type = 'text'; transformMatrix = $box
        properties = @{ text = 'Fondo suave'; backgroundColor = '#F7F4EC' }
    } -Token $tToken
    if ($r.element.properties.backgroundColor -ne '#F7F4EC') { throw 'No persistio el fondo' }
}

Test-Step 'Formato enriquecido completo' {
    $r = Invoke-Api POST $elementsPath @{
        type = 'text'; transformMatrix = $box
        properties = @{
            text = 'Texto rico'; fontSize = 48; bold = $true; italic = $true
            underline = $true; strikethrough = $true; columns = 2; indent = 3
        }
    } -Token $tToken
    $p = $r.element.properties
    if (-not ($p.bold -and $p.italic -and $p.underline -and $p.strikethrough)) { throw 'Faltan estilos' }
    if ($p.columns -ne 2 -or $p.indent -ne 3) { throw 'Columnas o sangria incorrectas' }
}

Test-Step 'Rechaza mas de 3 columnas -> 400' {
    Assert-Status {
        Invoke-Api POST $elementsPath @{
            type = 'text'; transformMatrix = $box; properties = @{ text = 'X'; columns = 9 }
        } -Token $tToken
    } 400
}

# --- Pen tool: 4 estilos ---
$sample = 'M 10 10 Q 40 5 70 30 L 120 60'

foreach ($brush in @('pen', 'paintbrush', 'crayon', 'highlighter')) {
    Test-Step "Trazo con pincel $brush" {
        $r = Invoke-Api POST $elementsPath @{
            type = 'drawing'; transformMatrix = $box
            properties = @{
                svgPath = $sample; brushStyle = $brush
                strokeWidth = 8; strokeColor = '#2563EB'; viewBox = '0 0 200 100'
            }
        } -Token $tToken
        if ($r.element.properties.brushStyle -ne $brush) { throw 'No persistio el pincel' }
        if ($r.element.properties.svgPath -ne $sample) { throw 'Se altero el path SVG' }
    }
}

Test-Step 'Rechaza pincel desconocido -> 400' {
    Assert-Status {
        Invoke-Api POST $elementsPath @{
            type = 'drawing'; transformMatrix = $box
            properties = @{ svgPath = $sample; brushStyle = 'aerografo' }
        } -Token $tToken
    } 400
}

Test-Step 'Persiste extraPaths (textura de cerdas)' {
    $r = Invoke-Api POST $elementsPath @{
        type = 'drawing'; transformMatrix = $box
        properties = @{
            svgPath = $sample; brushStyle = 'paintbrush'
            extraPaths = @('M 11 11 L 71 31', 'M 9 9 L 69 29')
        }
    } -Token $tToken
    if ($r.element.properties.extraPaths.Count -ne 2) { throw "extraPaths: $($r.element.properties.extraPaths.Count)" }
}

Test-Step 'Rechaza mas de 6 extraPaths -> 400' {
    Assert-Status {
        Invoke-Api POST $elementsPath @{
            type = 'drawing'; transformMatrix = $box
            properties = @{ svgPath = $sample; extraPaths = @(1..8 | ForEach-Object { "M $_ $_ L 9 9" }) }
        } -Token $tToken
    } 400
}

Test-Step 'Trazo sin extraPaths recibe array vacio' {
    $r = Invoke-Api POST $elementsPath @{
        type = 'drawing'; transformMatrix = $box; properties = @{ svgPath = $sample }
    } -Token $tToken
    if ($null -eq $r.element.properties.extraPaths) { throw 'extraPaths deberia ser []' }
    if ($r.element.properties.brushStyle -ne 'pen') { throw 'Pincel por defecto incorrecto' }
}

Test-Step 'Preserva viewBox ajustado del trazo' {
    $r = Invoke-Api POST $elementsPath @{
        type = 'drawing'; transformMatrix = $box
        properties = @{ svgPath = $sample; viewBox = '0 0 347 218' }
    } -Token $tToken
    if ($r.element.properties.viewBox -ne '0 0 347 218') { throw 'viewBox alterado' }
}

Test-Step 'Rechaza grosor de trazo fuera de rango -> 400' {
    Assert-Status {
        Invoke-Api POST $elementsPath @{
            type = 'drawing'; transformMatrix = $box
            properties = @{ svgPath = $sample; strokeWidth = 500 }
        } -Token $tToken
    } 400
}

# --- Bote de pintura ---
$shape = Test-Step 'Bote de pintura sobre forma' {
    $created = (Invoke-Api POST $elementsPath @{
        type = 'shape'; transformMatrix = @{ x = 50; y = 50; width = 30; height = 30; angle = 0 }
        properties = @{ shape = 'ellipse'; fillColor = '#FFFFFF' }
    } -Token $tToken).element

    $r = Invoke-Api PATCH "$elementsPath/$($created.id)" @{
        properties = @{ shape = 'ellipse'; fillColor = '#16A34A' }
    } -Token $tToken
    if ($r.element.properties.fillColor -ne '#16A34A') { throw 'No se relleno' }
    $created
}

Test-Step 'Bote de pintura sobre el fondo de pagina' {
    $r = Invoke-Api PATCH "/books/$($book.id)/pages/$pageId" @{ backgroundColor = '#EDF2F0' } -Token $tToken
    if ($r.page.backgroundColor -ne '#EDF2F0') { throw 'No pinto el fondo' }
}

# --- Persistencia general ---
Test-Step 'Todos los elementos persisten y se recuperan ordenados' {
    $d = (Invoke-Api GET "/books/$($book.id)" -Token $tToken).book
    $page = $d.pages | Where-Object { $_.id -eq $pageId }
    $drawings = @($page.elements | Where-Object { $_.type -eq 'drawing' })
    $texts = @($page.elements | Where-Object { $_.type -eq 'text' })

    if ($drawings.Count -ne 7) { throw "Trazos esperados 7, hay $($drawings.Count)" }
    if ($texts.Count -ne 7) { throw "Textos esperados 7, hay $($texts.Count)" }

    $z = $page.elements | ForEach-Object { $_.zIndex }
    $sorted = $z | Sort-Object
    if ("$z" -ne "$sorted") { throw 'Los elementos no vienen ordenados por z_index' }
}

Test-Step 'Trazo bloqueado por docente rechaza edicion de alumno -> 403' {
    $student = Invoke-Api POST '/auth/students' @{ fullName = 'Dibujante Prueba'; libraryId = $lib.id } -Token $tToken
    $sToken = (Invoke-Api POST '/auth/login/qr' @{ token = $student.qrToken }).token
    Invoke-Api PATCH "$elementsPath/$($shape.id)" @{ isLocked = $true } -Token $tToken | Out-Null
    Assert-Status {
        Invoke-Api PATCH "$elementsPath/$($shape.id)" @{ properties = @{ shape = 'ellipse'; fillColor = '#000000' } } -Token $sToken
    } 403
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }
