<script setup>
import Wheader from "./components/Wheader.vue";
import { useAuthStore } from "@/stores/auth.js";

const auth = useAuthStore();
</script>

<template>
  <Toast position="bottom-center" :pt="{ root: { style: 'width: 90vw; max-width: 25rem; bottom: 96px' } }" />
  <ConfirmDialog />
  <Wheader v-if="auth.isLoggedIn && $route.name !== 'Login'" />
  <!-- pb-40: spazio per la pillola di navigazione flottante -->
  <main class="mx-auto w-full max-w-[1200px] px-4 pt-8 pb-36 sm:px-6 sm:pt-12 sm:pb-40">
    <router-view />
  </main>
</template>
