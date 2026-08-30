<script setup lang="ts">
withDefaults(defineProps<{ message: string | null; variant?: 'error' | 'success' | 'info' }>(), {
  variant: 'error',
});

const styles = {
  error: 'border-red-200 bg-red-50 text-red-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  info: 'border-brand-200 bg-brand-50 text-brand-700',
} as const;
</script>

<template>
  <p v-if="message" class="rounded-lg border px-3 py-2 text-sm" :class="styles[variant]" role="alert">
    {{ message }}
  </p>
</template>
