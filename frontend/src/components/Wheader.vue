<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import { useAuthStore } from "@/stores/auth.js";
import { useWalletStore } from "@/stores/wallet.js";
import { erroreLeggibile } from "@/services/api.js";
import { temaChiaro } from "@/tema.js";
import Avatar from "./Avatar.vue";

const router = useRouter();
const toast = useToast();
const auth = useAuthStore();
const walletStore = useWalletStore();

// Quattro voci: sono anche quelle della pillola in basso.
const voci = [
  { label: "Home", icon: "ph-house", to: "/" },
  { label: "Transazioni", icon: "ph-arrows-left-right", to: "/transazioni" },
  { label: "Analisi", icon: "ph-file-magnifying-glass", to: "/analisi" },
  { label: "Impostazioni", icon: "ph-gear-six", to: "/impostazioni" },
];
const attiva = (to) => {
  const p = router.currentRoute.value.path;
  if (to === "/") return p === "/";
  if (to === "/impostazioni") return ["/impostazioni", "/ricorrenti", "/export", "/anno", "/consigli"].some((x) => p.startsWith(x));
  return p.startsWith(to);
};

const menuAperto = ref(false);
const menu = ref(null);
const io = computed(() => walletStore.io);
const sel = computed(() => walletStore.selectedWallet);

function sottotitolo(w) {
  if (w.condiviso && walletStore.partnerDi(w)) return `Condiviso con ${walletStore.partnerDi(w).nome}`;
  return w.escludiDaStatistiche ? "Fuori dalle statistiche" : "Personale";
}
function scegli(w) {
  if (w.documentId !== sel.value?.documentId) walletStore.setSelectedWallet(w);
  menuAperto.value = false;
}
const chiudi = (e) => {
  if (menu.value && !menu.value.contains(e.target)) menuAperto.value = false;
};
const esc = (e) => e.key === "Escape" && (menuAperto.value = false);

onMounted(async () => {
  document.addEventListener("click", chiudi);
  document.addEventListener("keydown", esc);
  try {
    await walletStore.carica();
  } catch (e) {
    toast.add({ severity: "error", summary: "Portafogli", detail: erroreLeggibile(e), life: 4000 });
  }
});
onBeforeUnmount(() => {
  document.removeEventListener("click", chiudi);
  document.removeEventListener("keydown", esc);
});

function cambiaTema() {
  auth.salvaTema(temaChiaro.value ? "notte" : "giorno");
}
function esci() {
  auth.logout();
  router.push("/login");
}
</script>

<template>
  <header class="mx-auto flex max-w-[1200px] items-center gap-1.5 px-4 pt-4 sm:gap-3 sm:px-6 sm:pt-6">
    <router-link to="/" class="grid h-10 w-10 flex-none place-items-center rounded-full bg-card" aria-label="Budget, home">
      <img src="/logo.svg" alt="" class="h-[22px] w-[22px]" />
    </router-link>

    <div ref="menu" class="relative min-w-0 flex-[0_1_auto]">
      <button
        class="flex h-10 max-w-full min-w-0 items-center gap-2 rounded-full bg-card pr-3 pl-4 text-[14.5px] font-medium hover:bg-campo sm:pr-4 sm:pl-5"
        aria-haspopup="menu"
        :aria-expanded="menuAperto"
        @click.stop="menuAperto = !menuAperto"
      >
        <span v-if="sel?.condiviso" class="-ml-2 flex flex-none max-[380px]:hidden">
          <Avatar :p="io" :size="22" />
          <Avatar :p="walletStore.partnerDi(sel)" :size="22" class="-ml-[7px] ring-2 ring-card" />
        </span>
        <span class="min-w-0 truncate">{{ sel?.Nome || "Portafoglio" }}</span>
        <i class="ph-bold ph-caret-down flex-none text-sm text-testo2" />
      </button>

      <div
        v-if="menuAperto"
        class="absolute top-[calc(100%+8px)] left-0 z-30 w-[min(300px,calc(100vw-32px))] rounded-[20px] bg-fondo-profondo p-1.5 shadow-pop"
        role="menu"
      >
        <div class="px-3 pt-2 pb-1.5 text-xs font-medium text-testo3">Portafogli</div>
        <button
          v-for="w in walletStore.wallets"
          :key="w.documentId"
          class="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left hover:bg-campo"
          role="menuitemradio"
          :aria-checked="w.documentId === sel?.documentId"
          @click="scegli(w)"
        >
          <span class="grid h-9 w-9 flex-none place-items-center rounded-full bg-campo text-[17px]">
            <span v-if="w.condiviso" class="flex">
              <Avatar :p="io" :size="22" />
              <Avatar :p="walletStore.partnerDi(w)" :size="22" class="-ml-[7px]" />
            </span>
            <i v-else class="ph-bold ph-wallet" />
          </span>
          <span class="min-w-0 flex-1">
            <b class="block truncate text-[14.5px] font-medium">{{ w.Nome }}</b>
            <small class="text-[12.5px] text-testo2">{{ sottotitolo(w) }}</small>
          </span>
          <i v-if="w.documentId === sel?.documentId" class="ph-bold ph-check text-lg text-fg-accento" />
        </button>
        <router-link
          to="/impostazioni#portafogli"
          class="mt-1 flex items-center gap-3 rounded-b-[14px] border-t border-bordo px-3 py-2.5 hover:bg-campo"
          @click="menuAperto = false"
        >
          <span class="grid h-9 w-9 place-items-center rounded-full bg-campo"><i class="ph-bold ph-gear-six" /></span>
          <b class="font-medium">Gestisci portafogli</b>
        </router-link>
      </div>
    </div>

    <div class="flex-1" />
    <button
      class="circle-btn"
      :aria-label="temaChiaro ? 'Passa alla modalità notte' : 'Passa alla modalità giorno'"
      :title="temaChiaro ? 'Passa alla modalità notte' : 'Passa alla modalità giorno'"
      @click="cambiaTema"
    >
      <i class="ph-bold" :class="temaChiaro ? 'ph-moon' : 'ph-sun'" />
    </button>
    <router-link
      to="/risparmio"
      class="circle-btn bg-crema! text-inchiostro! hover:bg-crema-scuro!"
      :class="{ 'ring-2 ring-anello ring-offset-2 ring-offset-fondo': $route.path === '/risparmio' }"
      aria-label="Salvadanaio"
      title="Salvadanaio"
    >
      <i class="ph-bold ph-piggy-bank" />
    </router-link>
    <router-link
      to="/impostazioni#profilo"
      class="grid h-11 w-11 flex-none place-items-center rounded-full max-[380px]:h-[38px] max-[380px]:w-[38px] hover:ring-2 hover:ring-bordo-forte"
      aria-label="Il tuo profilo"
      title="Il tuo profilo"
    >
      <Avatar :p="io" :size="40" class="max-[380px]:h-[38px]! max-[380px]:w-[38px]!" />
    </router-link>
    <button class="circle-btn" aria-label="Esci" title="Esci" @click="esci">
      <i class="ph-bold ph-sign-out" />
    </button>
  </header>

  <!-- Pillola di navigazione flottante: resta scura anche di giorno -->
  <nav
    class="fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-dock-fondo p-[5px] shadow-[0_12px_32px_rgba(0,0,0,.35)] sm:bottom-6 sm:gap-1.5 sm:p-1.5"
    aria-label="Navigazione principale"
  >
    <router-link
      v-for="v in voci"
      :key="v.to"
      :to="v.to"
      :aria-label="v.label"
      :aria-current="attiva(v.to) ? 'page' : undefined"
      class="dock-voce"
    >
      <i class="ph-bold" :class="v.icon" />
      <span v-if="attiva(v.to)">{{ v.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
/* Telefoni stretti: i cerchi si restringono un po' e la pillola del
   portafoglio accorcia il nome con i puntini (progetto.md §13) */
@media (max-width: 380px) {
  header :deep(.circle-btn) { width: 38px; height: 38px; font-size: 18px; }
  header > a:first-child { width: 36px; height: 36px; }
}
/* Colori fissi della pillola: è scura anche di giorno (progetto.md §14) */
.dock-voce {
  height: 52px; min-width: 52px; padding: 0 15px; border-radius: 999px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  color: var(--color-dock-testo); background: var(--color-dock-voce); font-size: 20px;
  transition: background 0.25s, color 0.25s;
}
.dock-voce:hover { color: var(--color-dock-testo-on); }
.dock-voce[aria-current="page"] { background: var(--color-dock-attiva); color: var(--color-inchiostro); padding: 0 20px 0 17px; }
.dock-voce span { font-size: 14.5px; font-weight: 500; }
@media (max-width: 640px) {
  .dock-voce { height: 48px; min-width: 48px; }
}
@media (max-width: 360px) {
  .dock-voce { height: 44px; min-width: 44px; padding: 0 12px; font-size: 18px; }
  .dock-voce[aria-current="page"] { padding: 0 14px 0 12px; }
  .dock-voce span { font-size: 13.5px; }
}
</style>
