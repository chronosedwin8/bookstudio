/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

/** El SDK de Mercado Pago se carga bajo demanda y se cuelga de window. */
declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => unknown;
  }
}

export {};
