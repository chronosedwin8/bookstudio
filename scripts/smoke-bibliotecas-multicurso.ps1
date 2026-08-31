# Bibliotecas con alumnado de varios cursos, entregas y visibilidad entre companeros.
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

# Docente y dos alumnos de "cursos" distintos
$doc = Api POST '/auth/register' @{ email = "doc-$sufijo@test.local"; password = 'Prueba12345'; fullName = 'Docente Multicurso'; role = 'teacher' } $null
$tokenDoc = $doc.token
Check 'el docente se registra' ($null -ne $tokenDoc)

$cursoA = Api POST '/libraries' @{ name = "Curso A $sufijo" } $tokenDoc
$cursoB = Api POST '/libraries' @{ name = "Curso B $sufijo" } $tokenDoc
$mixta  = Api POST '/libraries' @{ name = "Proyecto mixto $sufijo" } $tokenDoc
Check 'se crean tres bibliotecas' ($null -ne $mixta.library.id)
Check 'la nueva nace con visibilidad entre companeros' ($mixta.library.studentsSeePeers -eq $true)

# Un alumno en cada curso
$alumnoA = Api POST '/auth/students' @{ fullName = "Ana Alfa $sufijo"; libraryId = $cursoA.library.id } $tokenDoc
$alumnoB = Api POST '/auth/students' @{ fullName = "Beto Beta $sufijo"; libraryId = $cursoB.library.id } $tokenDoc
Check 'se crean dos alumnos en cursos distintos' ($null -ne $alumnoA.user.id -and $null -ne $alumnoB.user.id)

Write-Host "`n== 1. Alumnado de varios cursos en una biblioteca ==" -ForegroundColor Cyan

$busca = Api GET "/libraries/$($mixta.library.id)/students/search?q=Alfa" $null $tokenDoc
Check 'la busqueda encuentra alumnado de otro curso' ($busca.students.Count -ge 1) "$($busca.students.Count)"
$encontrada = $busca.students | Where-Object { $_.id -eq $alumnoA.user.id }
Check 'muestra en que cursos ya esta' ($encontrada.libraries -contains "Curso A $sufijo") ($encontrada.libraries -join ',')
Check 'marca que aun no esta en esta biblioteca' ($encontrada.alreadyIn -eq $false)

$corta = $null
try { Api GET "/libraries/$($mixta.library.id)/students/search?q=A" $null $tokenDoc } catch { $corta = $_.Exception.Response.StatusCode.value__ }
Check 'una sola letra no vale como busqueda' ($corta -eq 400) "$corta"

$alta = Api POST "/libraries/$($mixta.library.id)/students" @{ studentIds = @($alumnoA.user.id, $alumnoB.user.id) } $tokenDoc
Check 'se anaden los dos alumnos de cursos distintos' ($alta.added -eq 2) "$($alta.added)"

$repetido = Api POST "/libraries/$($mixta.library.id)/students" @{ studentIds = @($alumnoA.user.id) } $tokenDoc
Check 'repetir a alguien no da error ni lo duplica' ($repetido.added -eq 0) "$($repetido.added)"

$noDocente = $null
try { Api POST "/libraries/$($mixta.library.id)/students" @{ studentIds = @($doc.user.id) } $tokenDoc } catch { $noDocente = $_.Exception.Response.StatusCode.value__ }
Check 'no deja colar a un docente como alumno' ($noDocente -eq 400) "$noDocente"

Write-Host "`n== 2. Nombre y curso del autor ==" -ForegroundColor Cyan

$miembros = Api GET "/libraries/$($mixta.library.id)/members" $null $tokenDoc
Check 'la biblioteca mixta tiene dos alumnos' ($miembros.students.Count -eq 2) "$($miembros.students.Count)"

$libroA = Api POST '/books' @{ title = "Trabajo de Ana $sufijo"; libraryId = $mixta.library.id } $tokenDoc
$listado = Api GET "/books?libraryId=$($mixta.library.id)" $null $tokenDoc
$primero = $listado.books | Where-Object { $_.id -eq $libroA.book.id }
Check 'el listado trae el nombre del autor' ($null -ne $primero.creatorName) "$($primero.creatorName)"

Write-Host "`n== 3. Entregar material ==" -ForegroundColor Cyan

$material = Api POST '/books' @{ title = "Ficha de trabajo $sufijo"; libraryId = $mixta.library.id } $tokenDoc
$detalle = Api GET "/books/$($material.book.id)" $null $tokenDoc
$paginaUno = $detalle.book.pages[0].id
Api POST "/books/$($material.book.id)/pages" @{} $tokenDoc | Out-Null

$entrega = Api POST "/libraries/$($mixta.library.id)/distribute" @{ sourceBookId = $material.book.id } $tokenDoc
Check 'entrega el libro entero a los dos alumnos' ($entrega.delivered -eq 2) "$($entrega.delivered)"
Check 'crea un libro por alumno' ($entrega.created -eq 2) "$($entrega.created)"
Check 'copia las dos paginas a cada uno' ($entrega.pages -eq 4) "$($entrega.pages)"

$segunda = Api POST "/libraries/$($mixta.library.id)/distribute" @{ sourceBookId = $material.book.id; pageId = $paginaUno } $tokenDoc
Check 'la segunda entrega amplia el libro que ya tenian' ($segunda.updated -eq 2) "$($segunda.updated)"
Check 'no crea libros nuevos al reenviar' ($segunda.created -eq 0) "$($segunda.created)"

$soloUno = Api POST "/libraries/$($mixta.library.id)/distribute" @{ sourceBookId = $material.book.id; pageId = $paginaUno; studentIds = @($alumnoA.user.id) } $tokenDoc
Check 'se puede entregar a un solo alumno' ($soloUno.delivered -eq 1) "$($soloUno.delivered)"

$deOtro = $null
try { Api POST "/libraries/$($cursoA.library.id)/distribute" @{ sourceBookId = '00000000-0000-0000-0000-000000000000' } $tokenDoc } catch { $deOtro = $_.Exception.Response.StatusCode.value__ }
Check 'no se entrega un libro que no existe' ($deOtro -eq 404) "$deOtro"

Write-Host "`n== 4. Visibilidad entre companeros ==" -ForegroundColor Cyan

# Ana entra con su QR
$sesionA = Api POST '/auth/login/qr' @{ token = $alumnoA.qrToken } $null
$tokenA = $sesionA.token
Check 'la alumna entra con su QR' ($null -ne $tokenA)

$verTodo = Api GET "/books?libraryId=$($mixta.library.id)" $null $tokenA
$conVisibilidad = $verTodo.books.Count
Check 'con la visibilidad encendida ve mas que lo suyo' ($conVisibilidad -ge 3) "$conVisibilidad"

Api PATCH "/libraries/$($mixta.library.id)" @{ studentsSeePeers = $false } $tokenDoc | Out-Null
$verLimitado = Api GET "/books?libraryId=$($mixta.library.id)" $null $tokenA
$ajenos = @($verLimitado.books | Where-Object { $_.creatorId -ne $alumnoA.user.id -and $_.creatorId -ne $doc.user.id })
Check 'apagada, no ve libros de otros alumnos' ($ajenos.Count -eq 0) "$($ajenos.Count)"

$suyos = @($verLimitado.books | Where-Object { $_.creatorId -eq $alumnoA.user.id })
Check 'sigue viendo los suyos' ($suyos.Count -ge 1) "$($suyos.Count)"

$delDocente = @($verLimitado.books | Where-Object { $_.creatorId -eq $doc.user.id })
Check 'sigue viendo el material del docente' ($delDocente.Count -ge 1) "$($delDocente.Count)"

# El libro de Beto por URL directa
$libroBeto = $null
$todos = Api GET "/books?libraryId=$($mixta.library.id)" $null $tokenDoc
$libroBeto = ($todos.books | Where-Object { $_.creatorId -eq $alumnoB.user.id })[0]
$porUrl = $null
try { Api GET "/books/$($libroBeto.id)" $null $tokenA } catch { $porUrl = $_.Exception.Response.StatusCode.value__ }
Check 'conocer la URL del libro ajeno tampoco sirve' ($porUrl -eq 403) "$porUrl"

Api PATCH "/libraries/$($mixta.library.id)" @{ studentsSeePeers = $true } $tokenDoc | Out-Null
$reabierto = Api GET "/books/$($libroBeto.id)" $null $tokenA
Check 'al reactivarla vuelve a verlo' ($null -ne $reabierto.book.id)

Write-Host "`n== 5. Sacar alumnado ==" -ForegroundColor Cyan

$libroDeBeto = $libroBeto.id
Api DELETE "/libraries/$($mixta.library.id)/students/$($alumnoB.user.id)" $null $tokenDoc | Out-Null
$tras = Api GET "/libraries/$($mixta.library.id)/members" $null $tokenDoc
Check 'el alumno sale de la biblioteca' ($tras.students.Count -eq 1) "$($tras.students.Count)"

$librosTras = Api GET "/books?libraryId=$($mixta.library.id)" $null $tokenDoc
$sobrevive = $librosTras.books | Where-Object { $_.id -eq $libroDeBeto }
Check 'su trabajo NO se borra al sacarlo' ($null -ne $sobrevive)

$alumnoAjeno = $null
try { Api GET "/libraries/$($cursoB.library.id)/students/search?q=Alfa" $null $tokenA } catch { $alumnoAjeno = $_.Exception.Response.StatusCode.value__ }
Check 'un alumno no puede buscar en el listado del centro' ($alumnoAjeno -eq 403) "$alumnoAjeno"

Write-Host "`n== Resultado: $ok OK / $fail FAIL ==" -ForegroundColor $(if ($fail) { 'Red' } else { 'Green' })
if ($fail) { exit 1 }
