<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import { useAuthStore } from "@/stores/auth.js";
import { useWalletStore } from "@/stores/wallet.js";
import { useConsigliStore } from "@/stores/consigli.js";
import { useMovimentoStore } from "@/stores/movimento.js";
import { erroreLeggibile } from "@/services/api.js";
import { temaChiaro } from "@/tema.js";
import Avatar from "./Avatar.vue";
import Feedback from "./Feedback.vue";

const router = useRouter();
const toast = useToast();
const auth = useAuthStore();
const walletStore = useWalletStore();
const consigli = useConsigliStore();
const mov = useMovimentoStore();
// pallino della campanella su ogni pagina (§21): i consigli da guardare del portafoglio scelto
const daGuardare = computed(() =>
  consigli.lista.filter((c) => (c.stato === "nuovo" || c.stato === "letto") && c.categorie?.wallet?.documentId === walletStore.walletId).length,
);
onMounted(() => consigli.carica());

// Pillola in basso (§21). Impostazioni si apre solo dal menu della foto profilo.
const voci = [
  { label: "Home", icon: "ph-house", to: "/" },
  { label: "Transazioni", icon: "ph-arrows-left-right", to: "/transazioni" },
  { label: "Salvadanaio", icon: "ph-piggy-bank", to: "/risparmio" },
  { label: "Analisi", icon: "ph-file-magnifying-glass", to: "/analisi" },
];
const inImpostazioni = computed(() => router.currentRoute.value.path.startsWith("/impostazioni"));
const attiva = (to) => {
  const p = router.currentRoute.value.path;
  // Anno si apre dalla Home; Consigli ha la campanella nell'header
  if (to === "/") return p === "/" || p.startsWith("/anno");
  return p.startsWith(to);
};

// Un menu alla volta: "portafogli" o "account" (progetto.md §20)
const aperto = ref(null);
const menuAperto = computed({ get: () => aperto.value === "portafogli", set: (v) => (aperto.value = v ? "portafogli" : null) });
const menu = ref(null);
const menuAccount = ref(null);
const btnAccount = ref(null);
const feedback = ref(false);
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
  if (!menu.value?.contains(e.target) && !menuAccount.value?.contains(e.target)) aperto.value = null;
};
const esc = (e) => {
  if (e.key !== "Escape" || !aperto.value) return;
  if (aperto.value === "account") btnAccount.value?.focus();
  aperto.value = null;
};

// Menu dell'account da tastiera: frecce, Home e Fine tra le voci
async function apriAccount() {
  aperto.value = aperto.value === "account" ? null : "account";
  if (aperto.value) {
    await nextTick();
    menuAccount.value?.querySelector("[role=menuitem]")?.focus();
  }
}
function tastiAccount(e) {
  const voci = [...menuAccount.value.querySelectorAll("[role=menuitem]")];
  const i = voci.indexOf(document.activeElement);
  const vai = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: voci.length - 1 }[e.key];
  if (vai === undefined) return;
  e.preventDefault();
  voci[(vai + voci.length) % voci.length]?.focus();
}
function apriFeedback() {
  aperto.value = null;
  feedback.value = true;
}

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
    <router-link
      to="/consigli"
      class="circle-btn relative"
      :class="{ 'ring-2 ring-anello ring-offset-2 ring-offset-fondo': $route.path.startsWith('/consigli') }"
      :aria-current="$route.path.startsWith('/consigli') ? 'page' : undefined"
      :aria-label="daGuardare ? `Consigli sul budget, ${daGuardare} da guardare` : 'Consigli sul budget'"
      :title="daGuardare ? `Consigli sul budget, ${daGuardare} da guardare` : 'Consigli sul budget'"
    >
      <i class="ph-bold ph-bell" />
      <span v-if="daGuardare" class="num absolute -top-[3px] -right-[3px] h-5 min-w-5 rounded-full bg-arancio px-[5px] text-center text-[11.5px] leading-5 font-semibold text-inchiostro ring-[3px] ring-fondo">{{ daGuardare }}</span>
    </router-link>
    <!-- Menu dell'account: dalla foto profilo (Esci sta qui dentro) -->
    <div ref="menuAccount" class="relative flex-none" @keydown="aperto === 'account' && tastiAccount($event)">
      <button
        ref="btnAccount"
        class="grid h-11 w-11 place-items-center rounded-full transition-shadow max-[380px]:h-[38px] max-[380px]:w-[38px] hover:ring-2 hover:ring-bordo-forte"
        :class="{ 'ring-2 ring-anello ring-offset-2 ring-offset-fondo': aperto === 'account' || inImpostazioni }"
        aria-haspopup="menu"
        :aria-expanded="aperto === 'account'"
        aria-label="Il tuo account"
        title="Il tuo account"
        @click.stop="apriAccount"
      >
        <Avatar :p="io" :size="40" class="max-[380px]:h-[38px]! max-[380px]:w-[38px]!" />
      </button>
      <div
        v-if="aperto === 'account'"
        class="absolute top-[calc(100%+8px)] right-0 z-30 w-[min(270px,calc(100vw-32px))] rounded-[20px] bg-fondo-profondo p-1.5 shadow-pop"
        role="menu"
        aria-label="Il tuo account"
      >
        <div class="mb-1 flex items-center gap-3 border-b border-bordo px-3 pt-2.5 pb-3">
          <Avatar :p="io" :size="40" />
          <span class="min-w-0">
            <b class="block truncate text-[14.5px] font-medium">{{ io?.nome }}</b>
            <small class="block truncate text-[12.5px] text-testo2">{{ auth.userInfo.email }}</small>
          </span>
        </div>
        <router-link
          v-for="v in [{ to: '/impostazioni#profilo', l: 'Modifica profilo', i: 'ph-user' }, { to: '/impostazioni', l: 'Impostazioni', i: 'ph-gear-six' }]"
          :key="v.l"
          :to="v.to"
          role="menuitem"
          class="flex items-center gap-3 rounded-[14px] px-3 py-2.5 hover:bg-campo focus-visible:bg-campo"
          @click="aperto = null"
        >
          <span class="grid h-9 w-9 place-items-center rounded-full bg-campo text-[17px]"><i class="ph-bold" :class="v.i" /></span><b class="font-medium">{{ v.l }}</b>
          <span v-if="v.to === '/impostazioni' && inImpostazioni" class="ml-auto h-2 w-2 rounded-full bg-fg-accento" aria-label="pagina attuale" />
        </router-link>
        <button role="menuitem" class="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left hover:bg-campo focus-visible:bg-campo" @click="apriFeedback">
          <span class="grid h-9 w-9 place-items-center rounded-full bg-campo text-[17px]"><i class="ph-bold ph-chat-circle-text" /></span><b class="font-medium">Invia feedback</b>
        </button>
        <button role="menuitem" class="mt-1 flex w-full items-center gap-3 rounded-b-[14px] border-t border-bordo px-3 py-2.5 text-left text-fg-avviso hover:bg-campo focus-visible:bg-campo" @click="esci">
          <span class="grid h-9 w-9 place-items-center rounded-full bg-campo text-[17px]"><i class="ph-bold ph-sign-out" /></span><b class="font-medium">Esci</b>
        </button>
      </div>
    </div>
  </header>

  <!-- Pillola di navigazione flottante: resta scura anche di giorno -->
  <nav
    class="fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-dock-fondo p-[5px] shadow-[0_12px_32px_rgba(0,0,0,.35)] sm:bottom-6 sm:gap-1.5 sm:p-1.5"
    aria-label="Navigazione principale"
  >
    <template v-for="(v, i) in voci" :key="v.to">
      <!-- Su telefono, al centro: "+" per segnare subito un'uscita (progetto.md §17) -->
      <button v-if="i === 2" type="button" class="dock-piu" aria-label="Nuova uscita" title="Nuova uscita" @click="mov.apri({ tipo: 'uscita' })">
        <i class="ph-bold ph-plus" />
      </button>
      <router-link :to="v.to" :aria-label="v.label" :aria-current="attiva(v.to) ? 'page' : undefined" class="dock-voce">
        <i class="ph-bold" :class="v.icon" />
        <span v-if="attiva(v.to)">{{ v.label }}</span>
      </router-link>
    </template>
  </nav>

  <!-- Giorno / notte: cerchio fisso in basso a destra, scuro come la pillola.
       Su telefono non c'è: il tema si cambia da Impostazioni → Aspetto -->
  <button
    class="tema-fab"
    :aria-label="temaChiaro ? 'Passa alla modalità notte' : 'Passa alla modalità giorno'"
    :title="temaChiaro ? 'Passa alla modalità notte' : 'Passa alla modalità giorno'"
    @click="cambiaTema"
  >
    <i class="ph-bold" :class="temaChiaro ? 'ph-moon' : 'ph-sun'" />
  </button>

  <Feedback v-model="feedback" />
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
/* "+" della barra, su telefono e al computer: apre il foglio Nuovo movimento (§23) */
.dock-piu {
  display: grid; place-items: center; width: 60px; height: 60px; margin: -10px 2px; border-radius: 999px;
  background: var(--color-arancio); color: var(--color-inchiostro); font-size: 24px;
  box-shadow: 0 0 0 5px var(--color-dock-fondo); transition: transform 0.15s;
}
.dock-piu:hover { transform: scale(1.05); }
.dock-piu:active { transform: scale(0.94); }
@media (max-width: 640px) {
  .dock-voce { height: 48px; min-width: 48px; }
  /* Cinque posti: la pagina attiva resta crema, senza scritta */
  .dock-voce[aria-current="page"] { padding: 0 15px; }
  .dock-voce span { display: none; }
}
@media (max-width: 360px) {
  .dock-voce { height: 44px; min-width: 44px; padding: 0 12px; font-size: 18px; }
  .dock-voce[aria-current="page"] { padding: 0 12px; }
  .dock-piu { width: 54px; height: 54px; margin: -8px 0; font-size: 22px; }
}
.tema-fab {
  position: fixed; right: 24px; bottom: 24px; z-index: 20; width: 52px; height: 52px; border-radius: 50%;
  display: grid; place-items: center; font-size: 21px;
  background: var(--color-dock-fondo); color: var(--color-dock-testo-on);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.06);
  transition: transform 0.2s, background 0.2s;
}
.tema-fab:hover { background: var(--color-dock-voce); }
.tema-fab:active { transform: scale(0.94); }
.tema-fab i { transition: transform 0.45s; }
.tema-fab:hover i { transform: rotate(-20deg); }
@media (max-width: 640px) { .tema-fab { display: none; } }
</style>
