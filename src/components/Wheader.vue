<script setup>
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import { useAuthStore } from "@/stores/auth.js";
import { useWalletStore } from "@/stores/wallet.js";
import { erroreLeggibile } from "@/services/api.js";

const router = useRouter();
const toast = useToast();
const auth = useAuthStore();
const walletStore = useWalletStore();

const voci = [
  { label: "Home", icon: "pi pi-home", to: "/" },
  { label: "Salvadanaio", icon: "pi pi-wallet", to: "/risparmio" },
  { label: "Ricorrenti", icon: "pi pi-replay", to: "/ricorrenti" },
  { label: "Impostazioni", icon: "pi pi-cog", to: "/impostazioni" },
];

const wallet = computed({
  get: () => walletStore.selectedWallet,
  set: (w) => w && walletStore.setSelectedWallet(w),
});

onMounted(async () => {
  try {
    await walletStore.carica();
  } catch (e) {
    toast.add({ severity: "error", summary: "Portafogli", detail: erroreLeggibile(e), life: 4000 });
  }
});

function esci() {
  auth.logout();
  router.push("/login");
}
</script>

<template>
  <!-- Barra alta: logo + portafoglio (+ nav e uscita da md in su) -->
  <header class="sticky top-0 z-20 border-b border-bordo bg-fondo/90 backdrop-blur">
    <div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
      <img src="/logo.svg" alt="Budget App" class="h-8 w-8" />
      <Select
        v-model="wallet"
        :options="walletStore.wallets"
        optionLabel="Nome"
        placeholder="Portafoglio"
        size="small"
        class="min-w-40"
      />

      <nav class="ml-4 hidden items-center gap-1 md:flex">
        <router-link
          v-for="v in voci"
          :key="v.to"
          :to="v.to"
          class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-testo2 hover:text-testo"
          active-class="bg-card text-testo!"
        >
          <i :class="v.icon" />{{ v.label }}
        </router-link>
      </nav>

      <div class="ml-auto flex items-center gap-2">
        <Button
          icon="pi pi-plus"
          label="Nuova"
          size="small"
          class="hidden md:inline-flex"
          @click="router.push('/transazioni')"
        />
        <Button icon="pi pi-sign-out" severity="secondary" text rounded aria-label="Esci" @click="esci" />
      </div>
    </div>
  </header>

  <!-- Bottom nav mobile, con il + al centro -->
  <nav
    class="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 items-center border-t border-bordo bg-card px-1 pb-2 pt-1 md:hidden"
  >
    <!-- 4 voci attorno al + (colonna 3): le prime due a sinistra, le altre a destra -->
    <router-link
      v-for="(v, i) in voci"
      :key="v.to"
      :to="v.to"
      class="flex flex-col items-center gap-1 py-2 text-[11px] text-testo2"
      :style="{ gridColumn: i < 2 ? i + 1 : i + 2, gridRow: 1 }"
      active-class="text-accent!"
    >
      <i :class="v.icon" class="text-lg" />{{ v.label }}
    </router-link>
    <Button
      icon="pi pi-plus"
      rounded
      size="large"
      aria-label="Nuova transazione"
      class="col-start-3 row-start-1 -mt-8 justify-self-center shadow-lg"
      style="grid-column: 3; grid-row: 1"
      @click="router.push('/transazioni')"
    />
  </nav>
</template>
