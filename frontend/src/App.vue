<script setup>
import Wheader from "./components/Wheader.vue";
import { useAuthStore } from "@/stores/auth.js";

const auth = useAuthStore();
</script>

<template>
  <Toast position="bottom-center" :pt="{ root: { style: 'width: 90vw; max-width: 25rem' } }" />
  <ConfirmDialog />
  <Wheader v-if="auth.isLoggedIn && $route.name !== 'Login'" />
  <!-- pb-28: spazio per la bottom nav su mobile -->
  <main class="mx-auto w-full max-w-5xl pb-28 md:pb-10">
    <router-view />
  </main>
</template>
