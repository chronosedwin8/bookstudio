<template>
  <div class="grid min-h-[60vh] place-items-center px-4 text-center">
    <div>
      <p class="text-5xl font-black text-slate-300">404</p>
      <h1 class="mt-2 text-xl font-bold text-slate-800">Página no encontrada</h1>
      <RouterLink :to="{ name: 'dashboard' }" class="btn-primary mt-4">Volver al inicio</RouterLink>
    </div>
  </div>
</template>
