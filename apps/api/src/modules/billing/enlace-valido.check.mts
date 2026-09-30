/** Solo se ofrecen a clientes enlaces de pago de Mercado Pago, por https. */
import assert from 'node:assert/strict';
import { esEnlaceDeMercadoPago } from './enlace-valido.ts';

let hechas = 0;
const prueba = (n: string, fn: () => void) => { fn(); hechas++; console.log('  ok', n); };

console.log('\n== Enlaces de pago ==');
prueba('los cuatro enlaces cargados son validos', () => {
  for (const u of ['https://mpago.li/1hazNmq', 'https://mpago.li/2SjtL4m', 'https://mpago.li/2gNNSZj', 'https://mpago.li/1PqweqL']) {
    assert.equal(esEnlaceDeMercadoPago(u), true, u);
  }
});
prueba('y los de la pagina de Mercado Pago Colombia', () => {
  assert.equal(esEnlaceDeMercadoPago('https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=1'), true);
  assert.equal(esEnlaceDeMercadoPago('https://link.mercadopago.com.co/bookstudio'), true);
});
prueba('sin https no', () => assert.equal(esEnlaceDeMercadoPago('http://mpago.li/1hazNmq'), false));
prueba('javascript: no, que en un enlace ejecutaria codigo', () => {
  assert.equal(esEnlaceDeMercadoPago('javascript:alert(1)'), false);
});
prueba('dominios que solo se parecen, no', () => {
  for (const u of ['https://mpago.li.evil.com/x', 'https://mercadopago.com.co.evil.com/x', 'https://evil.com/mpago.li', 'https://mercadopag0.com.co/x']) {
    assert.equal(esEnlaceDeMercadoPago(u), false, u);
  }
});
prueba('con usuario y clave en la direccion, no (truco para disfrazar el destino)', () => {
  assert.equal(esEnlaceDeMercadoPago('https://mpago.li@evil.com/x'), false);
  assert.equal(esEnlaceDeMercadoPago('https://user:pass@mpago.li/x'), false);
});
prueba('cualquier texto que no sea una direccion, no', () => {
  assert.equal(esEnlaceDeMercadoPago(''), false);
  assert.equal(esEnlaceDeMercadoPago('mpago.li/1hazNmq'), false);
});
console.log(`\n== ${hechas} comprobaciones, ninguna fallo ==`);
