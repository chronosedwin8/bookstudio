# Valoraciones (escala 1.0-6.0, 1.0 la mejor) y bitacora de trabajo.
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

$doc = Api POST '/auth/register' @{ email = "doc-$sufijo@test.local"; password = 'Prueba12345'; fullName = 'Docente Notas'; role = 'teacher' } $null
$tokenDoc = $doc.token
$clase = Api POST '/libraries' @{ name = "Clase notas $sufijo" } $tokenDoc
$alumno = Api POST '/auth/students' @{ fullName = "Alumno Notas $sufijo"; libraryId = $clase.library.id } $tokenDoc
$sesAlumno = Api POST '/auth/login/qr' @{ token = $alumno.qrToken } $null
$tokenAlumno = $sesAlumno.token
Check 'docente, clase y alumno listos' ($null -ne $tokenAlumno)

$libro = Api POST '/books' @{ title = "Trabajo $sufijo"; libraryId = $clase.library.id } $tokenAlumno
$libroId = $libro.book.id
Check 'el alumno crea su libro' ($null -ne $libroId)

Write-Host "`n== 1. Poner notas ==" -ForegroundColor Cyan

$n1 = Api POST "/books/$libroId/grades" @{ title = 'Revision 1'; score = 2.5; description = 'Buen inicio, faltan fuentes.' } $tokenDoc
Check 'el docente pone una nota' ($n1.grade.score -eq 2.5) "$($n1.grade.score)"
Check 'guarda el titulo' ($n1.grade.title -eq 'Revision 1')
Check 'guarda el porque' ($n1.grade.description -like '*faltan fuentes*')
Check 'registra quien la puso' ($n1.grade.teacherName -eq 'Docente Notas')
Check 'y cuando' ($null -ne $n1.grade.createdAt)

$n2 = Api POST "/books/$libroId/grades" @{ title = 'Revision 2'; score = 1.5; description = 'Mucho mejor.' } $tokenDoc
Check 'se pueden poner varias a lo largo del curso' ($n2.grade.score -eq 1.5)

Write-Host "`n== 2. Limites de la escala ==" -ForegroundColor Cyan

foreach ($mala in @(0.9, 6.1, 7)) {
  $codigo = $null
  try { Api POST "/books/$libroId/grades" @{ title = 'Fuera'; score = $mala } $tokenDoc } catch { $codigo = $_.Exception.Response.StatusCode.value__ }
  Check "rechaza la nota $mala" ($codigo -eq 400) "$codigo"
}

$extremos = $true
foreach ($buena in @(1.0, 6.0)) {
  try { Api POST "/books/$libroId/grades" @{ title = "Limite $buena"; score = $buena } $tokenDoc | Out-Null } catch { $extremos = $false }
}
Check 'acepta los extremos 1.0 y 6.0' $extremos

$dosDecimales = $null
try { Api POST "/books/$libroId/grades" @{ title = 'Precisa'; score = 2.55 } $tokenDoc } catch { $dosDecimales = $_.Exception.Response.StatusCode.value__ }
Check 'rechaza mas de un decimal' ($dosDecimales -eq 400) "$dosDecimales"

Write-Host "`n== 3. Quien puede que ==" -ForegroundColor Cyan

$verAlumno = Api GET "/books/$libroId/grades" $null $tokenAlumno
Check 'el alumno ve las notas de su libro' ($verAlumno.grades.Count -ge 2) "$($verAlumno.grades.Count)"

$ponerAlumno = $null
try { Api POST "/books/$libroId/grades" @{ title = 'Me pongo un 1'; score = 1.0 } $tokenAlumno } catch { $ponerAlumno = $_.Exception.Response.StatusCode.value__ }
Check 'el alumno NO puede ponerse notas' ($ponerAlumno -eq 403) "$ponerAlumno"

$editarAlumno = $null
try { Api PATCH "/books/$libroId/grades/$($n1.grade.id)" @{ title = 'Cambiada'; score = 1.0 } $tokenAlumno } catch { $editarAlumno = $_.Exception.Response.StatusCode.value__ }
Check 'ni editarlas' ($editarAlumno -eq 403) "$editarAlumno"

$borrarAlumno = $null
try { Api DELETE "/books/$libroId/grades/$($n1.grade.id)" $null $tokenAlumno } catch { $borrarAlumno = $_.Exception.Response.StatusCode.value__ }
Check 'ni borrarlas' ($borrarAlumno -eq 403) "$borrarAlumno"

# Otro docente ajeno a la clase
$otro = Api POST '/auth/register' @{ email = "otro-$sufijo@test.local"; password = 'Prueba12345'; fullName = 'Docente Ajeno'; role = 'teacher' } $null
$ajeno = $null
try { Api GET "/books/$libroId/grades" $null $otro.token } catch { $ajeno = $_.Exception.Response.StatusCode.value__ }
Check 'un docente de fuera no ve las notas' ($ajeno -eq 403) "$ajeno"

Write-Host "`n== 4. Editar en cualquier momento ==" -ForegroundColor Cyan

$editada = Api PATCH "/books/$libroId/grades/$($n1.grade.id)" @{ title = 'Revision 1 (corregida)'; score = 2.0; description = 'Revisado de nuevo.' } $tokenDoc
Check 'la nota cambia' ($editada.grade.score -eq 2.0) "$($editada.grade.score)"
Check 'y el titulo tambien' ($editada.grade.title -eq 'Revision 1 (corregida)')
Check 'conserva la fecha de creacion' ($editada.grade.createdAt -eq $n1.grade.createdAt)
Check 'y anota la de modificacion' ($editada.grade.updatedAt -ne $editada.grade.createdAt)

Write-Host "`n== 5. Cuadricula del docente ==" -ForegroundColor Cyan

$cuadro = Api GET "/libraries/$($clase.library.id)/gradebook" $null $tokenDoc
Check 'la cuadricula responde' ($null -ne $cuadro.students)
Check 'lista los titulos como columnas' ($cuadro.titles -contains 'Revision 2') ($cuadro.titles -join ',')
$fila = $cuadro.students | Where-Object { $_.studentId -eq $alumno.user.id }
Check 'incluye al alumno' ($null -ne $fila)
Check 'con todas sus notas' ($fila.grades.Count -ge 4) "$($fila.grades.Count)"

# Promedio: 2.0 (editada) + 1.5 + 1.0 + 6.0 = 10.5 / 4 = 2.625 -> 2.63
# AwayFromZero a proposito: PowerShell redondea a la par por defecto (2.62) y el
# servidor redondea el medio hacia arriba, que es lo que se espera de una nota.
$suma = ($fila.grades | Measure-Object -Property score -Sum).Sum
$esperado = [math]::Round($suma / $fila.grades.Count, 2, [MidpointRounding]::AwayFromZero)
Check 'el promedio esta bien calculado' ([math]::Abs($fila.average - $esperado) -lt 0.01) "$($fila.average) vs $esperado"
Check 'trae la media de la clase' ($null -ne $cuadro.classAverage) "$($cuadro.classAverage)"

$cuadroAlumno = $null
try { Api GET "/libraries/$($clase.library.id)/gradebook" $null $tokenAlumno } catch { $cuadroAlumno = $_.Exception.Response.StatusCode.value__ }
Check 'el alumno no ve la cuadricula de la clase' ($cuadroAlumno -eq 403) "$cuadroAlumno"

Write-Host "`n== 6. Borrar una nota ==" -ForegroundColor Cyan

$antes = (Api GET "/books/$libroId/grades" $null $tokenDoc).grades.Count
Api DELETE "/books/$libroId/grades/$($n2.grade.id)" $null $tokenDoc | Out-Null
$despues = (Api GET "/books/$libroId/grades" $null $tokenDoc).grades.Count
Check 'la nota desaparece' ($despues -eq ($antes - 1)) "$antes -> $despues"

Write-Host "`n== 7. Bitacora de trabajo ==" -ForegroundColor Cyan

Api POST "/books/$libroId/activity" $null $tokenAlumno | Out-Null
$log1 = Api GET "/books/$libroId/activity" $null $tokenDoc
Check 'queda registrada la entrada del alumno' ($log1.sessions.Count -eq 1) "$($log1.sessions.Count)"
Check 'con su nombre' ($log1.sessions[0].userName -like '*Alumno Notas*')

Start-Sleep -Seconds 2
Api POST "/books/$libroId/activity" $null $tokenAlumno | Out-Null
$log2 = Api GET "/books/$libroId/activity" $null $tokenDoc
Check 'avisar de nuevo NO crea otra sesion' ($log2.sessions.Count -eq 1) "$($log2.sessions.Count)"
Check 'sino que alarga la que hay' ($log2.sessions[0].durationSeconds -ge 1) "$($log2.sessions[0].durationSeconds)s"

$resumen = $log2.people | Where-Object { $_.userId -eq $alumno.user.id }
Check 'el resumen cuenta una visita' ($resumen.sessions -eq 1) "$($resumen.sessions)"
Check 'y acumula el tiempo' ($resumen.totalSeconds -ge 1) "$($resumen.totalSeconds)s"

Api POST "/books/$libroId/activity" $null $tokenDoc | Out-Null
$log3 = Api GET "/books/$libroId/activity" $null $tokenDoc
Check 'tambien registra al docente' ($log3.people.Count -eq 2) "$($log3.people.Count)"

$logAlumno = Api GET "/books/$libroId/activity" $null $tokenAlumno
Check 'el alumno ve la bitacora de su propio libro' ($null -ne $logAlumno.sessions)

$logAjeno = $null
try { Api GET "/books/$libroId/activity" $null $otro.token } catch { $logAjeno = $_.Exception.Response.StatusCode.value__ }
Check 'un docente de fuera no ve la bitacora' ($logAjeno -eq 403) "$logAjeno"

Write-Host "`n== 8. Libros personales ==" -ForegroundColor Cyan

$personal = Api POST '/books' @{ title = "Personal $sufijo" } $tokenDoc
$notaPersonal = $null
try { Api POST "/books/$($personal.book.id)/grades" @{ title = 'X'; score = 1.0 } $tokenDoc } catch { $notaPersonal = $_.Exception.Response.StatusCode.value__ }
Check 'un libro personal no se valora' ($notaPersonal -eq 400) "$notaPersonal"

$logPersonal = $null
try { Api GET "/books/$($personal.book.id)/activity" $null $tokenDoc } catch { $logPersonal = $_.Exception.Response.StatusCode.value__ }
Check 'ni lleva bitacora' ($logPersonal -eq 400) "$logPersonal"

Write-Host "`n== Resultado: $ok OK / $fail FAIL ==" -ForegroundColor $(if ($fail) { 'Red' } else { 'Green' })
if ($fail) { exit 1 }
