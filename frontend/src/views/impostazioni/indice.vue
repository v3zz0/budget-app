<script setup>
import { computed } from "vue";
import { useAuthStore } from "@/stores/auth.js";
import { useWalletStore } from "@/stores/wallet.js";

const auth = useAuthStore();
const walletStore = useWalletStore();

const voci = computed(() => [
  {
    icona: "pi-user",
    titolo: "Profilo utente",
    sotto: auth.userInfo.username || "Nome, email e password",
    to: "/impostazioni/profilo",
  },
  {
    icona: "pi-wallet",
    titolo: "Portafogli e budget",
    sotto: walletStore.selectedWallet ? `Budget mensile di ${walletStore.selectedWallet.Nome}` : "Nessun portafoglio",
    to: "/impostazioni/portafogli",
  },
  { icona: "pi-tags", titolo: "Categorie di spesa", sotto: "Aggiungi, rinomina o elimina categorie", to: "/impostazioni/categorie" },
  { icona: "pi-download", titolo: "Esporta dati", sotto: "Tutte le transazioni in CSV, per anno o per mese", to: "/export" },
  { icona: "pi-replay", titolo: "Transazioni ricorrenti", sotto: "Cosa viene registrato in automatico ogni mese", to: "/ricorrenti" },
  { icona: "pi-bell", titolo: "Notifiche", sotto: "Promemoria di scadenza e avvisi sul budget", to: "/impostazioni/notifiche" },
  { icona: "pi-sparkles", titolo: "Analisi AI", sotto: "Quale modello analizza gli estratti conto", to: "/impostazioni/ai" },
]);
</script>

<template>
  <div class="flex max-w-2xl flex-col gap-3 px-4 pt-6">
    <div class="mb-3">
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-testo2">Configura</p>
      <h1 class="text-3xl font-bold text-testo">Impostazioni</h1>
    </div>

    <router-link
      v-for="v in voci"
      :key="v.to"
      :to="v.to"
      class="flex items-center gap-4 rounded-xl border border-bordo bg-card px-4 py-3.5 hover:bg-campo/50"
    >
      <i :class="['pi', v.icona, 'text-lg text-accent']" />
      <span class="min-w-0 flex-1">
        <span class="block font-semibold text-testo">{{ v.titolo }}</span>
        <span class="block truncate text-xs text-testo2">{{ v.sotto }}</span>
      </span>
      <i class="pi pi-chevron-right text-testo2" />
    </router-link>
  </div>
</template>
