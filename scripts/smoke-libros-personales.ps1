# Ensayo funcional de los libros personales (fuera de clase) y de la subida desde el equipo.
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

function To-DataUrl {
    param([string]$Mime, [byte[]]$Bytes)
    "data:$Mime;base64,$([Convert]::ToBase64String($Bytes))"
}

Write-Host "`n== Libros personales: ensayo funcional ==" -ForegroundColor Cyan

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 6)
$teacher = Invoke-Api POST '/auth/register' @{ email = "lp.doc.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Docente Personal'; role = 'teacher' }
$tToken = $teacher.token
# Alumno con email propio: no pertenece a ninguna biblioteca.
$student = Invoke-Api POST '/auth/register' @{ email = "lp.alu.$suffix@test.local"; password = 'Secreto12345'; fullName = 'Alumno Suelto'; role = 'student' }
$sToken = $student.token

# --- Creacion sin biblioteca ---
$docBook = Test-Step 'El docente crea un libro personal sin libraryId' {
    $r = Invoke-Api POST '/books' @{ title = 'Mi libro del docente'; layoutFormat = 'portrait' } -Token $tToken
    if ($null -ne $r.book.libraryId) { throw "libraryId deberia ser null: $($r.book.libraryId)" }
    if ($r.book.creatorId -ne $teacher.user.id) { throw 'Autor incorrecto' }
    $r.book
}

$stuBook = Test-Step 'Un alumno sin clase crea su libro personal' {
    $r = Invoke-Api POST '/books' @{ title = 'Mi diario' } -Token $sToken
    if ($null -ne $r.book.libraryId) { throw 'No deberia tener biblioteca' }
    $r.book
}

Test-Step 'El libro personal nace con una pagina' {
    $d = (Invoke-Api GET "/books/$($stuBook.id)" -Token $sToken).book
    if ($d.pages.Count -ne 1) { throw "Paginas: $($d.pages.Count)" }
}

Test-Step 'El autor tiene permisos totales sobre su libro personal' {
    $d = (Invoke-Api GET "/books/$($stuBook.id)" -Token $sToken).book
    foreach ($p in @('canView', 'canEdit', 'canPublish', 'isManager')) {
        if (-not $d.permissions.$p) { throw "Falta permiso $p" }
    }
}

Test-Step 'Se guarda en el portafolio del autor' {
    if (-not $stuBook.portfolioId) { throw 'portfolioId vacio' }
}

# --- Aislamiento entre autores ---
Test-Step 'Otro usuario no puede leer un libro personal ajeno -> 404' {
    Assert-Status { Invoke-Api GET "/books/$($stuBook.id)" -Token $tToken } 404
}

Test-Step 'Otro usuario no puede editarlo -> 404' {
    Assert-Status { Invoke-Api PATCH "/books/$($stuBook.id)" @{ title = 'Secuestrado' } -Token $tToken } 404
}

Test-Step 'Otro usuario no puede borrarlo -> 404' {
    Assert-Status {
        Invoke-RestMethod -Method DELETE -Uri "$base/books/$($stuBook.id)" -Headers @{ Authorization = "Bearer $tToken" }
    } 404
}

Test-Step 'Un libro personal no aparece en la lista de otro usuario' {
    $books = (Invoke-Api GET '/books?scope=personal' -Token $tToken).books
    if ($books | Where-Object { $_.id -eq $stuBook.id }) { throw 'Se filtro un libro ajeno' }
}

# --- Edicion completa del lienzo ---
Test-Step 'El autor edita paginas y elementos de su libro personal' {
    $d = (Invoke-Api GET "/books/$($stuBook.id)" -Token $sToken).book
    $pageId = $d.pages[0].id
    $el = Invoke-Api POST "/books/$($stuBook.id)/pages/$pageId/elements" @{
        type = 'text'; transformMatrix = @{ x = 10; y = 10; width = 40; height = 20; angle = 0 }
        properties = @{ text = 'Hola'; fontFamily = 'Caveat'; fontSize = 32 }
    } -Token $sToken
    if ($el.element.properties.fontFamily -ne 'Caveat') { throw 'Tipografia no persistida' }
    $null = Invoke-Api POST "/books/$($stuBook.id)/pages" @{ backgroundColor = '#FFEEDD' } -Token $sToken
}

Test-Step 'El autor renombra y publica su libro personal' {
    $r = Invoke-Api PATCH "/books/$($stuBook.id)" @{ title = 'Mi diario secreto'; isPublished = $true } -Token $sToken
    if ($r.book.title -ne 'Mi diario secreto') { throw 'Titulo no persistido' }
    if (-not $r.book.isPublished) { throw 'No se publico' }
}

# --- Filtros de alcance ---
$lib = (Invoke-Api POST '/libraries' @{ name = "Clase $suffix" } -Token $tToken).library
$classBook = (Invoke-Api POST '/books' @{ title = 'Libro de clase'; libraryId = $lib.id } -Token $tToken).book

Test-Step 'scope=personal solo devuelve libros sin biblioteca' {
    $books = (Invoke-Api GET '/books?scope=personal' -Token $tToken).books
    if (-not ($books | Where-Object { $_.id -eq $docBook.id })) { throw 'Falta el libro personal' }
    if ($books | Where-Object { $_.id -eq $classBook.id }) { throw 'Se colo un libro de clase' }
    foreach ($b in $books) { if ($null -ne $b.libraryId) { throw 'Libro con biblioteca en scope personal' } }
}

Test-Step 'scope=library solo devuelve libros de bibliotecas' {
    $books = (Invoke-Api GET '/books?scope=library' -Token $tToken).books
    if (-not ($books | Where-Object { $_.id -eq $classBook.id })) { throw 'Falta el libro de clase' }
    if ($books | Where-Object { $_.id -eq $docBook.id }) { throw 'Se colo un libro personal' }
}

Test-Step 'Sin scope se devuelven ambos' {
    $books = (Invoke-Api GET '/books' -Token $tToken).books
    if (-not ($books | Where-Object { $_.id -eq $classBook.id })) { throw 'Falta el de clase' }
    if (-not ($books | Where-Object { $_.id -eq $docBook.id })) { throw 'Falta el personal' }
}

Test-Step 'Los libros personales no salen en la vista de clase' {
    $cv = Invoke-Api GET "/libraries/$($lib.id)/class-view" -Token $tToken
    foreach ($entry in $cv.items) {
        if ($entry.books | Where-Object { $_.id -eq $stuBook.id }) { throw 'Un libro personal aparece en la vista de clase' }
    }
}

Test-Step 'El alumno sin clase no ve ninguna biblioteca' {
    $libs = (Invoke-Api GET '/libraries' -Token $sToken).libraries
    if ($libs.Count -ne 0) { throw "Bibliotecas inesperadas: $($libs.Count)" }
}

Test-Step 'Un alumno no puede crear plantillas personales -> 403' {
    Assert-Status { Invoke-Api POST '/books' @{ title = 'Plantilla'; isTemplate = $true } -Token $sToken } 403
}

Test-Step 'Un docente si puede crear una plantilla personal' {
    $r = Invoke-Api POST '/books' @{ title = 'Plantilla base'; isTemplate = $true } -Token $tToken
    if (-not $r.book.isTemplate) { throw 'No quedo marcada como plantilla' }
}

Test-Step 'libraryId invalido -> 400' {
    Assert-Status { Invoke-Api POST '/books' @{ title = 'Malo'; libraryId = 'no-es-uuid' } -Token $tToken } 400
}

Test-Step 'El autor elimina su libro personal' {
    $extra = (Invoke-Api POST '/books' @{ title = 'Descartable' } -Token $sToken).book
    Invoke-RestMethod -Method DELETE -Uri "$base/books/$($extra.id)" -Headers @{ Authorization = "Bearer $sToken" } | Out-Null
    Assert-Status { Invoke-Api GET "/books/$($extra.id)" -Token $sToken } 404
}

# --- Subida desde el equipo ---
Write-Host "`n-- Subida de archivos desde el equipo --" -ForegroundColor Cyan

Test-Step 'Acepta un MP3 con etiqueta ID3' {
    $url = To-DataUrl 'audio/mpeg' ([byte[]](0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00))
    $r = Invoke-Api POST '/media/uploads' @{ dataUrl = $url } -Token $sToken
    if ($r.kind -ne 'audio') { throw "Tipo incorrecto: $($r.kind)" }
    if ($r.fileUrl -notlike '*.mp3') { throw "Extension inesperada: $($r.fileUrl)" }
}

Test-Step 'Acepta un MP3 sin ID3 (frame sync)' {
    $url = To-DataUrl 'audio/mpeg' ([byte[]](0xFF, 0xFB, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00))
    $r = Invoke-Api POST '/media/uploads' @{ dataUrl = $url } -Token $sToken
    if ($r.kind -ne 'audio') { throw "Tipo incorrecto: $($r.kind)" }
}

Test-Step 'Rechaza un falso MP3 -> 400' {
    $url = To-DataUrl 'audio/mpeg' ([Text.Encoding]::UTF8.GetBytes('esto no es un mp3 en absoluto'))
    Assert-Status { Invoke-Api POST '/media/uploads' @{ dataUrl = $url } -Token $sToken } 400
}

Test-Step 'Acepta un M4A (ftyp en el offset 4)' {
    $url = To-DataUrl 'audio/mp4' ([byte[]](0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4D, 0x34, 0x41, 0x20))
    $r = Invoke-Api POST '/media/uploads' @{ dataUrl = $url } -Token $sToken
    if ($r.fileUrl -notlike '*.m4a') { throw "Extension inesperada: $($r.fileUrl)" }
}

Test-Step 'Acepta un GIF' {
    $url = To-DataUrl 'image/gif' ([byte[]](0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00))
    $r = Invoke-Api POST '/media/uploads' @{ dataUrl = $url } -Token $sToken
    if ($r.kind -ne 'image') { throw "Tipo incorrecto: $($r.kind)" }
}

$upload = Test-Step 'El audio subido se sirve por HTTP' {
    $url = To-DataUrl 'audio/mpeg' ([byte[]](0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00))
    $r = Invoke-Api POST '/media/uploads' @{ dataUrl = $url } -Token $sToken
    $web = Invoke-WebRequest -Uri "http://localhost:4000$($r.fileUrl)" -UseBasicParsing
    if ($web.StatusCode -ne 200) { throw "Status $($web.StatusCode)" }
    $r
}

Test-Step 'El audio del equipo se inserta en un libro personal' {
    $d = (Invoke-Api GET "/books/$($stuBook.id)" -Token $sToken).book
    $r = Invoke-Api POST "/books/$($stuBook.id)/pages/$($d.pages[0].id)/elements" @{
        type = 'audio'; transformMatrix = @{ x = 30; y = 30; width = 12; height = 12; angle = 0 }
        properties = @{ fileUrl = $upload.fileUrl; durationSeconds = 8.4; hotspotColor = '#7C3AED' }
    } -Token $sToken
    if ($r.element.properties.durationSeconds -ne 8.4) { throw 'Duracion no persistida' }
}

Test-Step 'GET /media/limits incluye los formatos del equipo' {
    $r = Invoke-Api GET '/media/limits' -Token $sToken
    foreach ($mime in @('audio/mpeg', 'audio/mp4', 'image/gif')) {
        if ($r.allowedMimeTypes -notcontains $mime) { throw "Falta $mime" }
    }
}

# --- Portadas en las listas ---
Write-Host "`n-- Portadas y paginas --" -ForegroundColor Cyan

Test-Step 'La lista de libros incluye la portada' {
    $b = (Invoke-Api GET '/books?scope=personal' -Token $sToken).books | Where-Object { $_.id -eq $stuBook.id }
    if (-not $b) { throw 'No se encontro el libro' }
    if ($null -eq $b.cover) { throw 'Falta la portada' }
    if (-not $b.cover.backgroundColor) { throw 'Falta el color de fondo' }
}

Test-Step 'La portada trae los elementos de la primera pagina' {
    $b = (Invoke-Api GET '/books?scope=personal' -Token $sToken).books | Where-Object { $_.id -eq $stuBook.id }
    $detalle = (Invoke-Api GET "/books/$($stuBook.id)" -Token $sToken).book
    $esperados = $detalle.pages[0].elements.Count
    if ($b.cover.elements.Count -ne $esperados) {
        throw "La portada trae $($b.cover.elements.Count) elementos y la pagina 1 tiene $esperados"
    }
}

Test-Step 'Los elementos de la portada llegan en camelCase y ordenados' {
    $b = (Invoke-Api GET '/books?scope=personal' -Token $sToken).books | Where-Object { $_.id -eq $stuBook.id }
    $primero = $b.cover.elements[0]
    foreach ($campo in @('id', 'type', 'zIndex', 'transformMatrix', 'properties', 'opacity')) {
        if ($null -eq $primero.$campo) { throw "Falta el campo $campo" }
    }
    $z = $b.cover.elements | ForEach-Object { $_.zIndex }
    $ordenado = $z | Sort-Object
    if ("$z" -ne "$ordenado") { throw "z-index desordenado: $z" }
}

Test-Step 'La portada de un libro recien creado llega vacia, no nula' {
    $nuevo = (Invoke-Api POST '/books' @{ title = 'Recien nacido' } -Token $sToken).book
    $b = (Invoke-Api GET '/books?scope=personal' -Token $sToken).books | Where-Object { $_.id -eq $nuevo.id }
    if ($null -eq $b.cover) { throw 'La portada no deberia ser nula' }
    if ($b.cover.elements.Count -ne 0) { throw 'Deberia venir sin elementos' }
    Invoke-RestMethod -Method DELETE -Uri "$base/books/$($nuevo.id)" -Headers @{ Authorization = "Bearer $sToken" } | Out-Null
}

Test-Step 'Reordenar paginas devuelve el libro completo' {
    $d = (Invoke-Api GET "/books/$($stuBook.id)" -Token $sToken).book
    if ($d.pages.Count -lt 2) { throw 'Hacen falta dos paginas' }
    $invertido = @($d.pages[1].id, $d.pages[0].id)
    $r = Invoke-Api PATCH "/books/$($stuBook.id)/pages/reorder" @{ pageIds = $invertido } -Token $sToken
    if ($r.book.pages[0].id -ne $invertido[0]) { throw 'El orden no se aplico' }
    if ($r.book.pages[0].pageNumber -ne 1) { throw 'La numeracion no se recalculo' }
    # Se deja como estaba para no alterar el resto del ensayo.
    $null = Invoke-Api PATCH "/books/$($stuBook.id)/pages/reorder" @{ pageIds = @($d.pages[0].id, $d.pages[1].id) } -Token $sToken
}

Test-Step 'La portada refleja la primera pagina tras reordenar' {
    $d = (Invoke-Api GET "/books/$($stuBook.id)" -Token $sToken).book
    $b = (Invoke-Api GET '/books?scope=personal' -Token $sToken).books | Where-Object { $_.id -eq $stuBook.id }
    if ($b.cover.backgroundColor -ne $d.pages[0].backgroundColor) {
        throw "Portada $($b.cover.backgroundColor) vs pagina 1 $($d.pages[0].backgroundColor)"
    }
}

# --- Tipografias ---
Write-Host "`n-- Catalogo tipografico --" -ForegroundColor Cyan

Test-Step 'El backend acepta las tipografias nuevas de Google Fonts' {
    $d = (Invoke-Api GET "/books/$($docBook.id)" -Token $tToken).book
    foreach ($font in @('Nunito', 'Poppins', 'Merriweather', 'Baloo 2', 'Luckiest Guy', 'Atkinson Hyperlegible')) {
        $r = Invoke-Api POST "/books/$($docBook.id)/pages/$($d.pages[0].id)/elements" @{
            type = 'text'; transformMatrix = @{ x = 5; y = 5; width = 30; height = 10; angle = 0 }
            properties = @{ text = $font; fontFamily = $font; fontSize = 28 }
        } -Token $tToken
        if ($r.element.properties.fontFamily -ne $font) { throw "No persistio $font" }
    }
}

Test-Step 'Rechaza una tipografia fuera del catalogo -> 400' {
    $d = (Invoke-Api GET "/books/$($docBook.id)" -Token $tToken).book
    Assert-Status {
        Invoke-Api POST "/books/$($docBook.id)/pages/$($d.pages[0].id)/elements" @{
            type = 'text'; transformMatrix = @{ x = 5; y = 5; width = 30; height = 10; angle = 0 }
            properties = @{ text = 'x'; fontFamily = 'Comic Sans MS' }
        } -Token $tToken
    } 400
}

Write-Host "`n== Resultado: $pass OK / $fail FAIL ==" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -gt 0) { exit 1 }
