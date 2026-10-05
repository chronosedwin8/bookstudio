-- Paddle como segundo medio de pago, junto a los enlaces de Mercado Pago.
--
-- Se reutiliza payment_intents (creada en la 029 y sin uso desde el 30 de
-- septiembre de 2026): cada intento se apunta antes de abrir el pago y la
-- licencia o la cuenta de cobro se aplican solo cuando Paddle confirma el cobro.
--
-- Solo se AÑADEN columnas. Ninguna fila existente cambia: los intentos que
-- hubiera quedan marcados como de Mercado Pago, que es lo que fueron.

ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS provider VARCHAR(12) NOT NULL DEFAULT 'mercadopago';
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS paddle_transaction_id VARCHAR(60);
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS paddle_status VARCHAR(30);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_paddle
    ON payment_intents (paddle_transaction_id) WHERE paddle_transaction_id IS NOT NULL;

-- El cobro de Paddle en el historial de pagos; unico para que un aviso repetido
-- no apunte dos veces el mismo dinero.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paddle_transaction_id VARCHAR(60);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_paddle
    ON payments (paddle_transaction_id) WHERE paddle_transaction_id IS NOT NULL;
