<script setup>
import Wheader from "./components/Wheader.vue";
import MovimentoSheet from "./components/MovimentoSheet.vue";
import { useAuthStore } from "@/stores/auth.js";

const auth = useAuthStore();
</script>

<template>
  <Toast position="bottom-center" :pt="{ root: { style: 'width: 90vw; max-width: 25rem; bottom: 96px' } }" />
  <!-- Conferma nello stile del mockup: confirm.require({ header, message, acceptLabel, accept }) -->
  <ConfirmDialog :pt="{ root: { class: 'w-[min(440px,calc(100%-32px))]' } }">
    <template #container="{ message, acceptCallback, rejectCallback }">
      <div class="rounded-[28px] bg-card p-8 text-testo">
        <span class="mb-5 grid h-[52px] w-[52px] place-items-center rounded-full bg-arancio text-2xl text-inchiostro">
          <i class="ph-bold" :class="message.icon || 'ph-trash'" />
        </span>
        <h2 class="text-2xl leading-tight font-medium tracking-[-0.03em]">{{ message.header }}</h2>
        <p class="mt-3 text-[14.5px] leading-relaxed whitespace-pre-line text-testo2">{{ message.message }}</p>
        <div class="mt-6 flex flex-wrap justify-end gap-2">
          <button class="pill-btn pill-btn--ghost h-12!" @click="rejectCallback">{{ message.rejectLabel || "Annulla" }}</button>
          <button
            class="pill-btn h-12! bg-arancio text-inchiostro"
            :disabled="message.acceptDisabled"
            @click="acceptCallback"
          >
            {{ message.acceptLabel || "Elimina" }}
          </button>
        </div>
      </div>
    </template>
  </ConfirmDialog>
  <Wheader v-if="auth.isLoggedIn && $route.name !== 'Login'" />
  <!-- pb-40: spazio per la pillola di navigazione flottante -->
  <main class="mx-auto w-full max-w-[1200px] px-4 pt-8 pb-36 sm:px-6 sm:pt-12 sm:pb-40">
    <router-view />
  </main>
  <MovimentoSheet v-if="auth.isLoggedIn" />
</template>
