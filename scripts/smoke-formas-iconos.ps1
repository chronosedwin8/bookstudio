# Ensayo funcional de formas ampliadas, iconos, emojis y tipos de hoja.
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
        # Se codifica a UTF-8 a mano: PowerShell 5.1 mandaria los emojis en ANSI.
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

Write-Host "`n== Formas, iconos y hojas: ensayo funcional ==" -ForegroundColor Cyan

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 6)
$user = Invoke-Api POST '/auth/register' @{ email = "fi.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Artista Prueba'; role = 'teacher' }
$token = $user.token
$book = (Invoke-Api POST '/books' @{ title = 'Libro de formas' } -Token $token).book
$pageId = ((Invoke-Api GET "/books/$($book.id)" -Token $token).book).pages[0].id
$path = "/books/$($book.id)/pages/$pageId/elements"
$box = @{ x = 10; y = 10; width = 20; height = 20; angle = 0 }

# --- Formas ---
$FORMAS = @(
    'rectangle', 'ellipse', 'triangle', 'right-triangle', 'diamond', 'pentagon', 'hexagon', 'octagon',
    'line', 'dashed-line', 'arrow', 'arrow-line', 'dashed-arrow', 'double-arrow', 'chevron',
    'speech-bubble', 'thought-bubble',
    'star', 'burst', 'heart', 'cloud', 'moon', 'lightning', 'cross', 'banner', 'bookmark'
)

Test-Step "El backend acepta las $($FORMAS.Count) formas del catalogo" {
    foreach ($forma in $FORMAS) {
        $r = Invoke-Api POST $path @{
            type = 'shape'; transformMatrix = $box
            properties = @{ shape = $forma; fillColor = '#59A1FF'; strokeColor = '#1549E1'; strokeWidth = 2 }
        } -Token $token
        if ($r.element.properties.shape -ne $forma) { throw "No persistio $forma" }
    }
}

Test-Step 'Rechaza una forma que no existe -> 400' {
    Assert-Status {
        Invoke-Api POST $path @{
            type = 'shape'; transformMatrix = $box; properties = @{ shape = 'trapecio-raro' }
        } -Token $token
    } 400
}

# --- Iconos ---
$icono = Test-Step 'POST elemento de icono con trazados' {
    $r = Invoke-Api POST $path @{
        type = 'icon'; transformMatrix = $box
        properties = @{
            source = 'library'; name = 'house'
            paths = @('M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8', 'M3 10a2 2 0 0 1 .709-1.528l7-6')
            viewBox = '0 0 24 24'; color = '#334155'; strokeWidth = 2; label = 'house'
        }
    } -Token $token
    if ($r.element.type -ne 'icon') { throw "Tipo incorrecto: $($r.element.type)" }
    if ($r.element.properties.paths.Count -ne 2) { throw 'Trazados no persistidos' }
    $r.element
}

Test-Step 'POST elemento de emoji' {
    # Por punto de codigo: el propio .ps1 lo lee en ANSI y mutilaria el literal.
    $zorro = [char]::ConvertFromUtf32(0x1F98A)
    $r = Invoke-Api POST $path @{
        type = 'icon'; transformMatrix = $box
        properties = @{ source = 'emoji'; char = $zorro; label = 'zorro' }
    } -Token $token
    if ($r.element.properties.char -ne $zorro) { throw "Emoji no persistido: $($r.element.properties.char)" }
    if ($r.element.properties.source -ne 'emoji') { throw 'Origen incorrecto' }
}

Test-Step 'Un emoji compuesto sobrevive el viaje completo' {
    # Familia con modificadores ZWJ: comprueba que no se trunca por bytes.
    $familia = [char]::ConvertFromUtf32(0x1F468) + [char]0x200D + [char]::ConvertFromUtf32(0x1F3EB)
    $r = Invoke-Api POST $path @{
        type = 'icon'; transformMatrix = $box
        properties = @{ source = 'emoji'; char = $familia; label = 'profesor' }
    } -Token $token
    if ($r.element.properties.char -ne $familia) { throw 'Emoji compuesto alterado' }
}

Test-Step 'Un icono sin trazados -> 400' {
    Assert-Status {
        Invoke-Api POST $path @{
            type = 'icon'; transformMatrix = $box; properties = @{ source = 'library'; name = 'vacio'; paths = @() }
        } -Token $token
    } 400
}

Test-Step 'Un emoji sin caracter -> 400' {
    Assert-Status {
        Invoke-Api POST $path @{
            type = 'icon'; transformMatrix = $box; properties = @{ source = 'emoji'; char = '' }
        } -Token $token
    } 400
}

Test-Step 'Rechaza un color de icono invalido -> 400' {
    Assert-Status {
        Invoke-Api POST $path @{
            type = 'icon'; transformMatrix = $box
            properties = @{ source = 'library'; paths = @('M0 0 L10 10'); color = 'rojo' }
        } -Token $token
    } 400
}

Test-Step 'El icono se puede recolorear' {
    $r = Invoke-Api PATCH "$path/$($icono.id)" @{
        properties = @{
            source = 'library'; name = 'house'
            paths = $icono.properties.paths; viewBox = '0 0 24 24'
            color = '#DC2626'; strokeWidth = 3; label = 'house'
        }
    } -Token $token
    if ($r.element.properties.color -ne '#DC2626') { throw 'Color no actualizado' }
    if ($r.element.properties.strokeWidth -ne 3) { throw 'Grosor no actualizado' }
}

# --- Tipos de hoja ---
$PAPELES = @(
    'grid-large', 'grid-medium', 'grid-small', 'ruled', 'ruled-narrow', 'ruled-margin',
    'dotted', 'dotted-fine', 'staff', 'handwriting',
    'comic-halftone', 'comic-burst', 'comic-speed',
    'stripes', 'checks', 'waves', 'border-simple', 'border-dashed', 'kraft', 'linen'
)

Test-Step "Los $($PAPELES.Count) tipos de hoja se guardan en la pagina" {
    foreach ($papel in $PAPELES) {
        $r = Invoke-Api PATCH "/books/$($book.id)/pages/$pageId" @{ backgroundPattern = $papel } -Token $token
        if ($r.page.backgroundPattern -ne $papel) { throw "No persistio $papel" }
    }
}

Test-Step 'La hoja se puede dejar lisa otra vez' {
    $r = Invoke-Api PATCH "/books/$($book.id)/pages/$pageId" @{ backgroundPattern = $null } -Token $token
    if ($null -ne $r.page.backgroundPattern) { throw 'Deberia quedar sin patron' }
}

Test-Step 'El patron viaja en la portada de la lista de libros' {
    $null = Invoke-Api PATCH "/books/$($book.id)/pages/$pageId" @{ backgroundPattern = 'staff' } -Token $token
    $b = (Invoke-Api GET '/books?scope=personal' -Token $token).books | Where-Object { $_.id -eq $book.id }
    if ($b.cover.backgroundPattern -ne 'staff') { throw "Portada sin patron: $($b.cover.backgroundPattern)" }
}

# --- Persistencia conjunta ---
Test-Step 'Formas, iconos y emojis conviven en la misma pagina' {
    $d = (Invoke-Api GET "/books/$($book.id)" -Token $token).book
    $page = $d.pages | Where-Object { $_.id -eq $pageId }
    $formas = ($page.elements | Where-Object { $_.type -eq 'shape' }).Count
    $iconos = ($page.elements | Where-Object { $_.type -eq 'icon' }).Count
    if ($formas -lt $FORMAS.Count) { throw "Solo $formas formas de $($FORMAS.Count)" }
    if ($iconos -lt 2) { throw "Solo $iconos iconos" }
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }
