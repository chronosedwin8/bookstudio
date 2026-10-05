-- Se retira Paddle como medio de pago (6 de octubre de 2026: Paddle rechazo la
-- cuenta). La migracion 034, que preparaba sus columnas, se aplico en produccion
-- el 5 de octubre y su fichero ya no existe; esto deja la base como antes.
--
-- Ninguna de estas columnas llego a tener datos: Paddle nunca llego a cobrar.
-- IF EXISTS: en una base creada despues de quitar la 034 no hay nada que borrar.

DROP INDEX IF EXISTS idx_payments_paddle;
ALTER TABLE payments DROP COLUMN IF EXISTS paddle_transaction_id;

DROP INDEX IF EXISTS idx_payment_intents_paddle;
ALTER TABLE payment_intents DROP COLUMN IF EXISTS paddle_status;
ALTER TABLE payment_intents DROP COLUMN IF EXISTS paddle_transaction_id;
ALTER TABLE payment_intents DROP COLUMN IF EXISTS provider;
