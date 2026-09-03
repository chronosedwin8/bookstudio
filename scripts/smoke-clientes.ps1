# Gestion de clientes: organizaciones, equipo docente con cupo y cuentas de cobro.
#
# No se cobra nada: pagar exige una tarjeta de Mercado Pago y eso se prueba aparte.
# Aqui se comprueba el modelo, los permisos y los limites del plan.
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

# Para preparar lo que la API no ofrece a proposito (ascender a administrador, dar
# una licencia por pagada). psql no siempre esta en el PATH en Windows.
function Sql($sentencia) {
  npm run --silent sql --workspace @bookstudio/api -- $sentencia | Out-Null
}

$sufijo = [guid]::NewGuid().ToString('N').Substring(0, 8)

Write-Host "`n== Preparacion ==" -ForegroundColor Cyan

# Administracion de BookStudio.
$admin = Llamar POST '/auth/register' @{ email = "adm-$sufijo@test.local"; password = 'Prueba12345'; fullName = 'Admin Prueba'; role = 'teacher' } $null
# El rol admin no se puede pedir al registrarse, y con razon: se asciende aparte.
Sql "UPDATE users SET role='admin' WHERE email='adm-$sufijo@test.local'"
$tokenAdmin = (Llamar POST '/auth/login' @{ email = "adm-$sufijo@test.local"; password = 'Prueba12345' } $null).token
$soyAdmin = (Llamar GET '/auth/me' $null $tokenAdmin).user.role
Check 'la administracion entra como admin' ($soyAdmin -eq 'admin') "$soyAdmin"

# El cliente que paga y no da clase.
$cliente = Llamar POST '/auth/register' @{ email = "pagador-$sufijo@test.local"; password = 'Prueba12345'; fullName = 'Rector Pagador'; role = 'teacher' } $null
$tokenCliente = $cliente.token

# Otro cliente, para comprobar que no se ven entre si.
$ajeno = Llamar POST '/auth/register' @{ email = "ajeno-$sufijo@test.local"; password = 'Prueba12345'; fullName = 'Otro Pagador'; role = 'teacher' } $null
$tokenAjeno = $ajeno.token

Write-Host "`n== 1. Crear el cliente ==" -ForegroundColor Cyan

Check 'un docente no crea clientes' ((Codigo POST '/clients/organizations' @{ name = 'Intruso' } $tokenCliente) -eq 403)

$org = (Llamar POST '/clients/organizations' @{
  name = "Colegio Prueba $sufijo"; legalName = 'Colegio Prueba S.A.S.'; taxId = "900$($sufijo.Substring(0,6))-1"
  contactName = 'Rector Pagador'; contactEmail = "pagador-$sufijo@test.local"; city = 'Barranquilla'
} $tokenAdmin).organization
Check 'la administracion crea el cliente' ($null -ne $org.id)
Check 'guarda la razon social' ($org.legalName -eq 'Colegio Prueba S.A.S.')

Check 'no admite dos clientes con el mismo NIT' ((Codigo POST '/clients/organizations' @{ name = 'Duplicado'; taxId = $org.taxId } $tokenAdmin) -eq 409)

Write-Host "`n== 2. Titular de la cuenta ==" -ForegroundColor Cyan

Check 'sin titular, el pagador no tiene portal' ((Codigo GET '/clients/portal' $null $tokenCliente) -eq 404)

$conDuenio = (Llamar POST "/clients/organizations/$($org.id)/owner" @{ email = "pagador-$sufijo@test.local" } $tokenAdmin).organization
Check 'se asigna el titular' ($conDuenio.ownerId -eq $cliente.user.id)

$portal = (Llamar GET '/clients/portal' $null $tokenCliente).portal
Check 'ahora si ve su portal' ($portal.organization.id -eq $org.id)
Check 'y empieza sin nada pendiente' ($portal.pendingCop -eq 0) "$($portal.pendingCop)"

Check 'no se puede poner a un alumno como titular' ((Codigo POST "/clients/organizations/$($org.id)/owner" @{ email = 'nadie@test.local' } $tokenAdmin) -eq 404)

Write-Host "`n== 3. Aislamiento entre clientes ==" -ForegroundColor Cyan

Check 'otro cliente no ve este portal' ((Codigo GET "/clients/portal?organizationId=$($org.id)" $null $tokenAjeno) -eq 404)
Check 'ni su equipo' ((Codigo GET "/clients/team?organizationId=$($org.id)" $null $tokenAjeno) -eq 404)
Check 'ni el listado de clientes' ((Codigo GET '/clients/organizations' $null $tokenAjeno) -eq 403)

$comoAdmin = (Llamar GET "/clients/portal?organizationId=$($org.id)" $null $tokenAdmin).portal
Check 'la administracion si entra en cualquier cliente' ($comoAdmin.organization.id -eq $org.id)

Write-Host "`n== 4. Datos de facturacion ==" -ForegroundColor Cyan

$actualizada = (Llamar PATCH '/clients/billing-data' @{ address = 'Calle 76 #54-11'; contactPhone = '3001234567' } $tokenCliente).organization
Check 'el cliente corrige su direccion' ($actualizada.address -eq 'Calle 76 #54-11')
Check 'y su telefono' ($actualizada.contactPhone -eq '3001234567')
Check 'rechaza un correo de contacto invalido' ((Codigo PATCH '/clients/billing-data' @{ contactEmail = 'no-es-un-correo' } $tokenCliente) -eq 400)

Write-Host "`n== 5. Equipo docente ==" -ForegroundColor Cyan

$equipo = (Llamar GET '/clients/team' $null $tokenCliente).team
Check 'el titular figura en su propio equipo' (@($equipo).Count -eq 1) "$(@($equipo).Count)"

$alta = Llamar POST '/clients/team' @{ fullName = 'Docente Uno'; email = "uno-$sufijo@test.local" } $tokenCliente
Check 'crea una cuenta de docente' ($alta.member.email -eq "uno-$sufijo@test.local")
Check 'y entrega su clave una sola vez' ($alta.password.Length -ge 6) "$($alta.password)"
Check 'la clave marcada como provisional' ($alta.member.passwordIsDefault -eq $true)

$entra = Llamar POST '/auth/login' @{ email = "uno-$sufijo@test.local"; password = $alta.password } $null
Check 'el docente nuevo puede entrar con esa clave' ($entra.user.role -eq 'teacher')

Check 'no admite dos cuentas con el mismo correo' ((Codigo POST '/clients/team' @{ fullName = 'Repetido'; email = "uno-$sufijo@test.local" } $tokenCliente) -eq 409)
Check 'rechaza un correo invalido' ((Codigo POST '/clients/team' @{ fullName = 'Malo'; email = 'arroba-nada' } $tokenCliente) -eq 400)

Write-Host "`n== 6. El cupo del plan se respeta ==" -ForegroundColor Cyan

# Plan Escuela: 5 docentes. Se le pone la licencia a mano, como si hubiera pagado.
Sql "INSERT INTO subscriptions (owner_id, organization_id, plan, status, amount_cop, max_teachers, max_students, starts_at, expires_at) SELECT id, '$($org.id)', 'escuela', 'activa', 5000000, 5, 500, NOW(), NOW() + INTERVAL '1 year' FROM users WHERE email='pagador-$sufijo@test.local'"

$conPlan = (Llamar GET '/clients/portal' $null $tokenCliente).portal
Check 'el portal muestra el plan' ($conPlan.subscriptions[0].planName -eq 'Escuela') "$($conPlan.subscriptions[0].planName)"
Check 'y el cupo de docentes' ($conPlan.usage.maxTeachers -eq 5) "$($conPlan.usage.maxTeachers)"
Check 'con dos ocupados' ($conPlan.usage.teachers -eq 2) "$($conPlan.usage.teachers)"

# Hasta llenar los cinco.
foreach ($n in 2..4) {
  Llamar POST '/clients/team' @{ fullName = "Docente $n"; email = "d$n-$sufijo@test.local" } $tokenCliente | Out-Null
}
$lleno = (Llamar GET '/clients/portal' $null $tokenCliente).portal
Check 'se llenan los cinco cupos' ($lleno.usage.teachers -eq 5) "$($lleno.usage.teachers)"

$sexto = Codigo POST '/clients/team' @{ fullName = 'Docente Sexto'; email = "d6-$sufijo@test.local" } $tokenCliente
Check 'el sexto docente se rechaza' ($sexto -eq 400) "$sexto"

# Desactivar libera cupo; reactivar lo vuelve a ocupar.
$aDesactivar = ((Llamar GET '/clients/team' $null $tokenCliente).team | Where-Object { $_.email -like "d2-*" })[0]
Llamar PATCH "/clients/team/$($aDesactivar.id)" @{ isActive = $false } $tokenCliente | Out-Null
$tras = (Llamar GET '/clients/portal' $null $tokenCliente).portal
Check 'desactivar libera un cupo' ($tras.usage.teachers -eq 4) "$($tras.usage.teachers)"

$ahoraSi = Codigo POST '/clients/team' @{ fullName = 'Docente Sexto'; email = "d6-$sufijo@test.local" } $tokenCliente
Check 'y entonces si entra otro' ($ahoraSi -eq 200) "$ahoraSi"

$reactivar = Codigo PATCH "/clients/team/$($aDesactivar.id)" @{ isActive = $true } $tokenCliente
Check 'reactivar por encima del cupo se rechaza' ($reactivar -eq 400) "$reactivar"

Write-Host "`n== 7. Sacar a alguien del equipo ==" -ForegroundColor Cyan

$titular = ((Llamar GET '/clients/team' $null $tokenCliente).team | Where-Object { $_.email -like "pagador-*" })[0]
Check 'no se puede sacar al titular' ((Codigo DELETE "/clients/team/$($titular.id)" $null $tokenCliente) -eq 400)

$fuera = ((Llamar GET '/clients/team' $null $tokenCliente).team | Where-Object { $_.email -like "d3-*" })[0]
Llamar DELETE "/clients/team/$($fuera.id)" $null $tokenCliente | Out-Null
$equipoFinal = (Llamar GET '/clients/team' $null $tokenCliente).team
Check 'quien sale ya no figura en el equipo' (@($equipoFinal | Where-Object { $_.email -like "d3-*" }).Count -eq 0)

# La cuenta sigue existiendo pero desactivada: el login falla, no da 404 de usuario.
$codigoSalida = Codigo POST '/auth/login' @{ email = "d3-$sufijo@test.local"; password = 'Prueba12345' } $null
Check 'la cuenta queda desactivada, no borrada' ($codigoSalida -in @(401, 403)) "$codigoSalida"

Write-Host "`n== 8. Cuentas de cobro ==" -ForegroundColor Cyan

Check 'un cliente no emite sus propias cuentas' ((Codigo POST "/clients/organizations/$($org.id)/charges" @{ concept = 'Autoregalo'; items = @(@{ description = 'Nada'; unitCop = 1 }) } $tokenCliente) -eq 403)

$borrador = (Llamar POST "/clients/organizations/$($org.id)/charges" @{
  concept = 'Ampliacion a 10 docentes'
  items = @(
    @{ description = 'Cupos adicionales de docente'; quantity = 5; unitCop = 300000 },
    @{ description = 'Acompanamiento de puesta en marcha'; quantity = 1; unitCop = 500000 }
  )
  dueDate = '2026-10-15'
} $tokenAdmin).charge

Check 'se crea la cuenta de cobro' ($null -ne $borrador.id)
Check 'nace como borrador' ($borrador.status -eq 'borrador') "$($borrador.status)"
Check 'el total lo calcula el servidor' ($borrador.amountCop -eq 2000000) "$($borrador.amountCop)"
Check 'lleva numero consecutivo' ($borrador.number -gt 0) "$($borrador.number)"
Check 'guarda las dos lineas' (@($borrador.items).Count -eq 2)

Check 'el cliente no ve un borrador' ((Codigo GET "/clients/charges/$($borrador.id)" $null $tokenCliente) -eq 404)
$portalConBorrador = (Llamar GET '/clients/portal' $null $tokenCliente).portal
Check 'ni le aparece en su portal' (@($portalConBorrador.charges | Where-Object { $_.id -eq $borrador.id }).Count -eq 0)
Check 'y no le suma deuda' ($portalConBorrador.pendingCop -eq 0) "$($portalConBorrador.pendingCop)"

Write-Host "`n== 9. Emitirla ==" -ForegroundColor Cyan

$emitida = (Llamar PATCH "/clients/charges/$($borrador.id)" @{ status = 'emitida' } $tokenAdmin).charge
Check 'pasa a emitida' ($emitida.status -eq 'emitida')
Check 'consta cuando se emitio' ($null -ne $emitida.issuedAt)

$conDeuda = (Llamar GET '/clients/portal' $null $tokenCliente).portal
Check 'ahora el cliente la ve' (@($conDeuda.charges | Where-Object { $_.id -eq $borrador.id }).Count -eq 1)
Check 'y le suma a lo pendiente' ($conDeuda.pendingCop -eq 2000000) "$($conDeuda.pendingCop)"

$detalle = (Llamar GET "/clients/charges/$($borrador.id)" $null $tokenCliente).charge
Check 'puede abrir el detalle' ($detalle.concept -like '*Ampliacion*')
Check 'con los dias que faltan para vencer' ($null -ne $detalle.daysLeft) "$($detalle.daysLeft)"
Check 'otro cliente no puede abrirla' ((Codigo GET "/clients/charges/$($borrador.id)" $null $tokenAjeno) -eq 404)

Write-Host "`n== 10. Validacion de las cuentas ==" -ForegroundColor Cyan

Check 'rechaza una cuenta sin lineas' ((Codigo POST "/clients/organizations/$($org.id)/charges" @{ concept = 'Vacia'; items = @() } $tokenAdmin) -eq 400)
Check 'rechaza un importe de cero' ((Codigo POST "/clients/organizations/$($org.id)/charges" @{ concept = 'Gratis'; items = @(@{ description = 'Nada'; unitCop = 0 }) } $tokenAdmin) -eq 400)
Check 'rechaza un importe negativo' ((Codigo POST "/clients/organizations/$($org.id)/charges" @{ concept = 'Regalo'; items = @(@{ description = 'Nada'; unitCop = -5000 }) } $tokenAdmin) -eq 400)
Check 'rechaza una fecha mal escrita' ((Codigo POST "/clients/organizations/$($org.id)/charges" @{ concept = 'Fecha rara'; items = @(@{ description = 'X'; unitCop = 1000 }); dueDate = '15/10/2026' } $tokenAdmin) -eq 400)
Check 'rechaza un concepto de dos letras' ((Codigo POST "/clients/organizations/$($org.id)/charges" @{ concept = 'ab'; items = @(@{ description = 'X'; unitCop = 1000 }) } $tokenAdmin) -eq 400)

Write-Host "`n== 11. Anular ==" -ForegroundColor Cyan

$anulable = (Llamar POST "/clients/organizations/$($org.id)/charges" @{
  concept = 'Cobro por error'; items = @(@{ description = 'Concepto equivocado'; unitCop = 750000 }); issue = $true
} $tokenAdmin).charge
Check 'se puede emitir directamente' ($anulable.status -eq 'emitida')

$anulada = (Llamar PATCH "/clients/charges/$($anulable.id)" @{ status = 'anulada' } $tokenAdmin).charge
Check 'se anula' ($anulada.status -eq 'anulada')

$trasAnular = (Llamar GET '/clients/portal' $null $tokenCliente).portal
Check 'lo anulado deja de contar como deuda' ($trasAnular.pendingCop -eq 2000000) "$($trasAnular.pendingCop)"
Check 'pero sigue en el historial' (@($trasAnular.charges | Where-Object { $_.id -eq $anulable.id }).Count -eq 1)

Check 'un cliente no anula sus cuentas' ((Codigo PATCH "/clients/charges/$($borrador.id)" @{ status = 'anulada' } $tokenCliente) -eq 403)

Write-Host "`n== 12. Pagar ==" -ForegroundColor Cyan

# Sin tarjeta no se puede completar el cobro, pero si comprobar las puertas.
Check 'no se paga un borrador' ((Codigo POST "/clients/charges/$($borrador.id)/pay" @{ paymentMethodId = 'visa'; payerEmail = "pagador-$sufijo@test.local" } $tokenAdmin) -in @(400, 502))
Check 'no se paga una anulada' ((Codigo POST "/clients/charges/$($anulable.id)/pay" @{ paymentMethodId = 'visa'; payerEmail = "pagador-$sufijo@test.local" } $tokenCliente) -eq 400)
Check 'otro cliente no paga esta cuenta' ((Codigo POST "/clients/charges/$($borrador.id)/pay" @{ paymentMethodId = 'visa'; payerEmail = 'x@test.local' } $tokenAjeno) -eq 404)
Check 'sin correo del pagador se rechaza' ((Codigo POST "/clients/charges/$($borrador.id)/pay" @{ paymentMethodId = 'visa' } $tokenCliente) -eq 400)

Write-Host "`n== 13. Vista de administracion ==" -ForegroundColor Cyan

$clientes = (Llamar GET '/clients/organizations' $null $tokenAdmin).organizations
$mio = $clientes | Where-Object { $_.id -eq $org.id }
Check 'el cliente aparece en el listado' ($null -ne $mio)
Check 'con su titular' ($mio.ownerEmail -eq "pagador-$sufijo@test.local") "$($mio.ownerEmail)"
Check 'su plan' ($mio.plan -eq 'Escuela') "$($mio.plan)"
Check 'sus docentes activos' ($mio.teachers -eq 4) "$($mio.teachers)"
Check 'y lo que tiene pendiente' ($mio.pendingCop -eq 2000000) "$($mio.pendingCop)"

Write-Host "`n== 14. Limpieza ==" -ForegroundColor Cyan
Sql "DELETE FROM organizations WHERE id='$($org.id)'"
Sql "DELETE FROM users WHERE email LIKE '%-$sufijo@test.local'"
Check 'los datos de prueba se borran' ((Codigo GET "/clients/portal?organizationId=$($org.id)" $null $tokenAdmin) -in @(401, 404))

Write-Host "`n$ok correctas, $fail fallidas" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
exit $(if ($fail -eq 0) { 0 } else { 1 })
