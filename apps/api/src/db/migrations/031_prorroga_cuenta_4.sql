-- Prorroga de 15 dias para la cuenta de cobro 4 del Colegio Aleman de Barranquilla
-- ("Licencias Iniciales", 3.600.000 COP), acordada el 30 de septiembre de 2026:
-- vencia ese mismo dia y pasa a vencer el 15 de octubre.
--
-- Se ata a la fecha que tenia y a que siga por pagar: si alguien ya la hubiera
-- movido o cobrado a mano, esto no la toca. En una base sin esa cuenta no hace
-- nada.

UPDATE charges c
SET due_date = c.due_date + 15
FROM organizations o
WHERE o.id = c.organization_id
  AND c.number = 4
  AND c.status = 'emitida'
  AND c.due_date = DATE '2026-09-30'
  AND o.name ILIKE '%Alem%n%Barranquilla%';
