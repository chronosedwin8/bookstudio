/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

/** imagetracerjs (dominio publico) no trae tipos; solo se usa imagedataToSVG. */
declare module 'imagetracerjs';
