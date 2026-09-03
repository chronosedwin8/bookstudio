# Administracion total, herramientas por biblioteca y licencias otorgadas.
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api'
$ok = 0; $fail = 0

function Check($nombre, $condicion, $detalle = '') {
  if ($condicion) { $script:ok++; Write-Host "  OK   $nombre" -ForegroundColor Green }
  else { $script:fail++; Write-Host "  FAIL $nombre -> $detalle" -ForegroundColor Red }
}

function Llamar($metodo, $ruta, $cuerpo, $token) {
  $h = @{}
  if ($token) { $h['Authorization'] = "Bearer $token" }
  $p = @{ Uri = "$base$ruta"; Method = $metodo; Headers = $h; ContentType = 'application/json' }
  if ($null -ne $cuerpo) { $p['Body'] = ($cuerpo | ConvertTo-Json -Depth 8 -Compress) }
  Invoke-RestMethod @p
}

function Codigo($metodo, $ruta, $cuerpo, $token) {
  try { Llamar $metodo $ruta $cuerpo $token | Out-Null; return 200 }
  catch { return $_.Exception.Response.StatusCode.value__ }
}

function Sql($sentencia) {
  npm run --silent sql --workspace @bookstudio/api -- $sentencia | Out-Null
}

$sufijo = [guid]::NewGuid().ToString('N').Substring(0, 8)

Write-Host "`n== Preparacion ==" -ForegroundColor Cyan

Llamar POST '/auth/register' @{ email = "adm-$sufijo@test.local"; password = 'Prueba12345'; fullName = 'Admin Total'; role = 'teacher' } $null | Out-Null
Sql "UPDATE users SET role='admin' WHERE email='adm-$sufijo@test.local'"
$tokenAdmin = (Llamar POST '/auth/login' @{ email = "adm-$sufijo@test.local"; password = 'Prueba12345' } $null).token

# Una docente ajena a la administracion, con su clase y su alumnado.
$docente = Llamar POST '/auth/register' @{ email = "doc-$sufijo@test.local"; password = 'Prueba12345'; fullName = 'Docente Ajena'; role = 'teacher' } $null
$tokenDoc = $docente.token
$clase = (Llamar POST '/libraries' @{ name = "Clase ajena $sufijo" } $tokenDoc).library
$alumno = Llamar POST '/auth/students' @{ fullName = "Alumno $sufijo"; libraryId = $clase.id } $tokenDoc
$tokenAlumno = (Llamar POST '/auth/login/qr' @{ token = $alumno.qrToken } $null).token

# Una tercera persona sin relacion, para comprobar que a ella no se le abre nada.
$extrano = Llamar POST '/auth/register' @{ email = "ext-$sufijo@test.local"; password = 'Prueba12345'; fullName = 'Extrano'; role = 'teacher' } $null
$tokenExtrano = $extrano.token

Check 'administracion, docente ajena y alumno listos' ($null -ne $tokenAlumno)

Write-Host "`n== 1. La administracion entra donde no es miembro ==" -ForegroundColor Cyan

Check 'un docente cualquiera NO entra en la clase ajena' ((Codigo GET "/libraries/$($clase.id)" $null $tokenExtrano) -eq 403) "$(Codigo GET "/libraries/$($clase.id)" $null $tokenExtrano)"

$vista = Llamar GET "/libraries/$($clase.id)" $null $tokenAdmin
Check 'la administracion si entra' ($vista.library.id -eq $clase.id)

$miembros = Llamar GET "/libraries/$($clase.id)/members" $null $tokenAdmin
Check 'y ve a sus miembros' (@($miembros.students).Count -eq 1) "$(@($miembros.students).Count)"

$ajustes = Llamar PATCH "/libraries/$($clase.id)" @{ name = "Clase renombrada $sufijo" } $tokenAdmin
Check 'puede cambiar sus ajustes' ($ajustes.library.name -eq "Clase renombrada $sufijo")

Write-Host "`n== 2. Manda sobre los libros de otros ==" -ForegroundColor Cyan

$libroAlumno = (Llamar POST '/books' @{ title = "Trabajo $sufijo"; libraryId = $clase.id } $tokenAlumno).book
$detalle = Llamar GET "/books/$($libroAlumno.id)" $null $tokenAdmin
Check 'abre el libro de un alumno' ($detalle.book.id -eq $libroAlumno.id)
Check 'y con permiso de edicion' ($detalle.book.permissions.canEdit -eq $true)

$renombrado = Llamar PATCH "/books/$($libroAlumno.id)" @{ title = "Arreglado por soporte $sufijo" } $tokenAdmin
Check 'puede corregirlo' ($renombrado.book.title -like '*Arreglado por soporte*')

# Un libro personal, que ni siquiera pertenece a una biblioteca.
$personal = (Llamar POST '/books' @{ title = "Personal $sufijo" } $tokenDoc).book
Check 'un extrano no ve un libro personal ajeno' ((Codigo GET "/books/$($personal.id)" $null $tokenExtrano) -eq 404)
$verPersonal = Llamar GET "/books/$($personal.id)" $null $tokenAdmin
Check 'la administracion si ve el libro personal ajeno' ($verPersonal.book.id -eq $personal.id)

Write-Host "`n== 3. Saca a alguien de una biblioteca que no es suya ==" -ForegroundColor Cyan

$idAlumno = $miembros.students[0].id
Llamar DELETE "/libraries/$($clase.id)/students/$idAlumno" $null $tokenAdmin | Out-Null
$trasSacar = Llamar GET "/libraries/$($clase.id)/members" $null $tokenAdmin
Check 'el alumno sale de la biblioteca' (@($trasSacar.students).Count -eq 0) "$(@($trasSacar.students).Count)"

Write-Host "`n== 4. Cambia contrasenas de cualquiera ==" -ForegroundColor Cyan

Llamar POST "/users/$($docente.user.id)/password" @{ password = 'NuevaClave987' } $tokenAdmin | Out-Null
$entraConNueva = Llamar POST '/auth/login' @{ email = "doc-$sufijo@test.local"; password = 'NuevaClave987' } $null
Check 'la docente entra con la clave nueva' ($entraConNueva.user.id -eq $docente.user.id)
Check 'un docente no cambia la clave de otro' ((Codigo POST "/users/$($extrano.user.id)/password" @{ password = 'Intruso12345' } $tokenDoc) -eq 403)

Write-Host "`n== 5. El interruptor de ver todo ==" -ForegroundColor Cyan

$suyas = (Llamar GET '/libraries' $null $tokenAdmin).libraries
$conTodo = (Llamar GET '/libraries?all=true' $null $tokenAdmin).libraries
Check 'por defecto solo ve las suyas' (@($suyas | Where-Object { $_.id -eq $clase.id }).Count -eq 0)
Check 'con el interruptor ve la ajena' (@($conTodo | Where-Object { $_.id -eq $clase.id }).Count -eq 1)

$extranoTodo = (Llamar GET '/libraries?all=true' $null $tokenExtrano).libraries
Check 'el interruptor no abre nada a quien no es administracion' (@($extranoTodo | Where-Object { $_.id -eq $clase.id }).Count -eq 0)

$librosTodo = (Llamar GET '/books?all=true' $null $tokenAdmin).books
Check 've los libros de todos con el interruptor' (@($librosTodo | Where-Object { $_.id -eq $libroAlumno.id }).Count -eq 1)
$librosExtrano = (Llamar GET '/books?all=true' $null $tokenExtrano).books
Check 'y un extrano sigue sin verlos' (@($librosExtrano | Where-Object { $_.id -eq $libroAlumno.id }).Count -eq 0)

Write-Host "`n== 6. Herramientas del editor por biblioteca ==" -ForegroundColor Cyan

$catalogo = (Llamar GET '/libraries/tools' $null $tokenDoc).tools
Check 'hay catalogo de herramientas' (@($catalogo).Count -ge 10) "$(@($catalogo).Count)"

$claseB = (Llamar POST '/libraries' @{ name = "Clase herramientas $sufijo" } $tokenDoc).library
Check 'una biblioteca nueva nace con todo habilitado' (@($claseB.disabledTools).Count -eq 0) "$(@($claseB.disabledTools).Count)"

$alumnoB = Llamar POST '/auth/students' @{ fullName = "AlumnoB $sufijo"; libraryId = $claseB.id } $tokenDoc
$tokenAlumnoB = (Llamar POST '/auth/login/qr' @{ token = $alumnoB.qrToken } $null).token
$libroB = (Llamar POST '/books' @{ title = "Libro B $sufijo"; libraryId = $claseB.id } $tokenAlumnoB).book
$paginaB = (Llamar GET "/books/$($libroB.id)" $null $tokenAlumnoB).book.pages[0]

$marco = @{ x = 10; y = 10; width = 30; height = 20; angle = 0 }
$elementoVideo = @{ type = 'embed'; transformMatrix = $marco; properties = @{ sourceUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; title = 'Video de prueba' } }

Check 'con todo habilitado el alumno inserta' ((Codigo POST "/books/$($libroB.id)/pages/$($paginaB.id)/elements" $elementoVideo $tokenAlumnoB) -in @(200, 201))

$conVeto = (Llamar PATCH "/libraries/$($claseB.id)" @{ disabledTools = @('embed', 'chart') } $tokenDoc).library
Check 'la docente veta dos herramientas' (@($conVeto.disabledTools).Count -eq 2) "$($conVeto.disabledTools -join ',')"

$vetado = Codigo POST "/books/$($libroB.id)/pages/$($paginaB.id)/elements" $elementoVideo $tokenAlumnoB
Check 'el alumno ya no puede insertarla' ($vetado -eq 403) "$vetado"

$texto = @{ type = 'text'; transformMatrix = $marco; properties = @{ content = 'Hola' } }
Check 'lo no vetado sigue funcionando' ((Codigo POST "/books/$($libroB.id)/pages/$($paginaB.id)/elements" $texto $tokenAlumnoB) -in @(200, 201))

# La docente no se limita a si misma.
$libroDocente = (Llamar POST '/books' @{ title = "De la docente $sufijo"; libraryId = $claseB.id } $tokenDoc).book
$paginaDoc = (Llamar GET "/books/$($libroDocente.id)" $null $tokenDoc).book.pages[0]
Check 'a la docente el veto no le afecta' ((Codigo POST "/books/$($libroDocente.id)/pages/$($paginaDoc.id)/elements" $elementoVideo $tokenDoc) -in @(200, 201))

$vistaAlumno = Llamar GET "/books/$($libroB.id)" $null $tokenAlumnoB
Check 'al alumno le llega la lista de vetadas' (@($vistaAlumno.book.disabledTools).Count -eq 2) "$($vistaAlumno.book.disabledTools -join ',')"
$vistaDocente = Llamar GET "/books/$($libroB.id)" $null $tokenDoc
Check 'a la docente le llega vacia' (@($vistaDocente.book.disabledTools).Count -eq 0)

Check 'rechaza una herramienta inventada' ((Codigo PATCH "/libraries/$($claseB.id)" @{ disabledTools = @('teletransporte') } $tokenDoc) -eq 400)

$sinVeto = (Llamar PATCH "/libraries/$($claseB.id)" @{ disabledTools = @() } $tokenDoc).library
Check 'se pueden volver a habilitar todas' (@($sinVeto.disabledTools).Count -eq 0)
Check 'y el alumno vuelve a insertar' ((Codigo POST "/books/$($libroB.id)/pages/$($paginaB.id)/elements" $elementoVideo $tokenAlumnoB) -in @(200, 201))

Write-Host "`n== 7. Licencia otorgada con cupos ilimitados ==" -ForegroundColor Cyan

$org = (Llamar POST '/clients/organizations' @{ name = "Colegio Ilimitado $sufijo" } $tokenAdmin).organization
Check 'sin titular no se puede otorgar licencia' ((Codigo POST "/clients/organizations/$($org.id)/plan" @{ plan = 'institucional' } $tokenAdmin) -eq 400)

Llamar POST "/clients/organizations/$($org.id)/owner" @{ email = "doc-$sufijo@test.local" } $tokenAdmin | Out-Null
# Caso real del Colegio Aleman: cupos ilimitados y cobro, emitido a la vez.
$otorgada = Llamar POST "/clients/organizations/$($org.id)/plan" @{
  plan = 'institucional'; months = 12; amountCop = 20000000; issueCharge = $true; dueDays = 30
} $tokenAdmin
$licencia = $otorgada.subscription
Check 'se otorga la licencia' ($licencia.planName -eq 'Institucional y empresas') "$($licencia.planName)"
Check 'con el importe acordado' ($licencia.amountCop -eq 20000000) "$($licencia.amountCop)"
Check 'y un anio de vigencia' ($licencia.daysLeft -gt 300) "$($licencia.daysLeft)"

Check 'se emite su cuenta de cobro a la vez' ($null -ne $otorgada.charge) "$($otorgada.charge)"
Check 'por el mismo importe' ($otorgada.charge.amountCop -eq 20000000) "$($otorgada.charge.amountCop)"
Check 'ya emitida, no en borrador' ($otorgada.charge.status -eq 'emitida') "$($otorgada.charge.status)"
Check 'con fecha de vencimiento' ($null -ne $otorgada.charge.dueDate)
Check 'atada a la licencia' ($otorgada.charge.subscriptionId -eq $licencia.id)

# Una cortesia no genera cuenta de cobro: una de cero pesos no significa nada.
$org2 = (Llamar POST '/clients/organizations' @{ name = "Cortesia $sufijo" } $tokenAdmin).organization
Llamar POST "/clients/organizations/$($org2.id)/owner" @{ email = "ext-$sufijo@test.local" } $tokenAdmin | Out-Null
$gratis = Llamar POST "/clients/organizations/$($org2.id)/plan" @{ plan = 'escuela'; amountCop = 0; issueCharge = $true } $tokenAdmin
Check 'con importe cero no se emite cuenta' ($null -eq $gratis.charge)

$portalOrg = (Llamar GET "/clients/portal?organizationId=$($org.id)" $null $tokenAdmin).portal
Check 'los cupos quedan ilimitados' (($null -eq $portalOrg.usage.maxTeachers) -and ($null -eq $portalOrg.usage.maxStudents)) "$($portalOrg.usage.maxTeachers)/$($portalOrg.usage.maxStudents)"

# Con cupo ilimitado se pueden crear docentes sin tope.
$creados = 0
foreach ($n in 1..6) {
  if ((Codigo POST "/clients/team?organizationId=$($org.id)" @{ fullName = "Profe $n"; email = "p$n-$sufijo@test.local" } $tokenAdmin) -eq 200) { $creados++ }
}
Check 'se crean seis docentes sin tope' ($creados -eq 6) "$creados"

Check 'un docente no otorga licencias' ((Codigo POST "/clients/organizations/$($org.id)/plan" @{ plan = 'institucional' } $tokenDoc) -eq 403)

Write-Host "`n== 8. Limpieza ==" -ForegroundColor Cyan
Sql "DELETE FROM organizations WHERE id IN ('$($org.id)','$($org2.id)')"
Sql "DELETE FROM libraries WHERE id IN ('$($clase.id)','$($claseB.id)')"
Sql "DELETE FROM users WHERE email LIKE '%-$sufijo@test.local' OR full_name LIKE '%$sufijo'"
Check 'los datos de prueba se borran' ((Codigo GET "/libraries/$($clase.id)" $null $tokenAdmin) -in @(401, 404))

Write-Host "`n$ok correctas, $fail fallidas" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
exit $(if ($fail -eq 0) { 0 } else { 1 })
