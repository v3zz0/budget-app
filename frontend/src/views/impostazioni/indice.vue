<script setup>
import { computed, onBeforeUnmount, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth.js";
import { useWalletStore } from "@/stores/wallet.js";
import { preferenzaTema } from "@/tema.js";
import Avatar from "@/components/Avatar.vue";
import Profilo from "./profilo.vue";
import Portafogli from "./portafogli.vue";
import Categorie from "./categorie.vue";
import Ricorrenti from "./ricorrenti.vue";
import Aspetto from "./aspetto.vue";
import Esporta from "./export.vue";
import Notifiche from "./notifiche.vue";
import Ai from "./ai.vue";

// Una pagina sola (progetto.md §11): elenco delle sezioni e sezione aperta,
// ognuna col suo indirizzo (#profilo, #ai...). Su telefono l'elenco sta sopra.
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const walletStore = useWalletStore();

const MOTORI = { ollama: "Server Ollama", llamacpp: "llama.cpp", openrouter: "OpenRouter" };
const TEMI = { sistema: "Segue il dispositivo", giorno: "Giorno", notte: "Notte" };

const sezioni = computed(() => [
  { id: "profilo", icona: "ph-user", titolo: "Profilo utente", sotto: auth.userInfo.email || "Nome, email e password", comp: Profilo },
  {
    id: "portafogli",
    icona: "ph-wallet",
    titolo: "Portafogli e budget",
    sotto: walletStore.selectedWallet ? `Budget mensile di ${walletStore.selectedWallet.Nome}` : "Nessun portafoglio",
    comp: Portafogli,
  },
  { id: "categorie", icona: "ph-tag", titolo: "Categorie", sotto: "Spese ed entrate", comp: Categorie },
  { id: "ricorrenti", icona: "ph-repeat", titolo: "Transazioni ricorrenti", sotto: "Registrate in automatico ogni mese", comp: Ricorrenti },
  { id: "aspetto", icona: "ph-circle-half", titolo: "Aspetto", sotto: TEMI[preferenzaTema.value], comp: Aspetto },
  { id: "export", icona: "ph-download-simple", titolo: "Esporta dati", sotto: "CSV per anno o per mese", comp: Esporta },
  { id: "notifiche", icona: "ph-bell", titolo: "Notifiche", sotto: "Scadenze e avvisi sul budget", comp: Notifiche },
  { id: "ai", icona: "ph-sparkle", titolo: "Analisi AI", sotto: MOTORI[auth.userInfo.aiMotore] || "Quale modello analizza gli estratti", comp: Ai },
]);

// Schermi stretti: o l'elenco o la sezione, come due pagine (con "indietro").
// Su schermo largo restano le due colonne del mockup.
const mq = matchMedia("(max-width: 1060px)");
const stretto = ref(mq.matches);
const aggiorna = () => (stretto.value = mq.matches);
mq.addEventListener("change", aggiorna);
onBeforeUnmount(() => mq.removeEventListener("change", aggiorna));

const scelta = computed(() => sezioni.value.find((s) => s.id === route.hash.slice(1)) || null);
// Da largo senza hash si apre il Profilo; da stretto senza hash si vede l'elenco
const aperta = computed(() => scelta.value || (stretto.value ? null : sezioni.value[0]));
const mostraElenco = computed(() => !stretto.value || !aperta.value);

// push (non replace): così "indietro" del browser e del telefono torna all'elenco
function apri(id) {
  router.push({ hash: `#${id}`, query: {} });
  if (stretto.value) scrollTo(0, 0);
}
function indietro() {
  if (history.state?.back?.startsWith("/impostazioni")) router.back();
  else router.replace({ hash: "" });
  scrollTo(0, 0);
}
</script>

<template>
  <div>
    <div v-if="mostraElenco" class="mb-8 sm:mb-10">
      <div class="eyebrow">Configura</div>
      <h1 class="display">Impostazioni</h1>
    </div>
    <button v-else class="mb-6 inline-flex h-10 items-center gap-2 rounded-full bg-card pr-4 pl-3 text-sm font-medium text-testo2 hover:text-testo" @click="indietro">
      <i class="ph-bold ph-arrow-left" />Impostazioni
    </button>

    <div class="grid grid-cols-[minmax(0,1fr)] items-start gap-3 min-[1061px]:grid-cols-[340px_minmax(0,1fr)]">
      <nav
        v-if="mostraElenco"
        class="reveal grid min-w-0 grid-cols-[minmax(0,1fr)] content-start self-start gap-1.5 min-[761px]:max-[1060px]:grid-cols-2 min-[1061px]:sticky min-[1061px]:top-6"
        aria-label="Sezioni delle impostazioni"
      >
        <a
          v-for="s in sezioni"
          :key="s.id"
          :href="`#${s.id}`"
          class="group flex items-center gap-4 rounded-[20px] p-4 hover:bg-card"
          :class="{ 'bg-card': aperta?.id === s.id }"
          :aria-current="aperta?.id === s.id"
          @click.prevent="apri(s.id)"
        >
          <span
            class="grid h-11 w-11 flex-none place-items-center rounded-full text-xl"
            :class="aperta?.id === s.id ? 'bg-crema text-inchiostro' : 'bg-card group-hover:bg-campo'"
          >
            <Avatar v-if="s.id === 'profilo' && walletStore.io?.foto" :p="walletStore.io" :size="44" />
            <i v-else class="ph-bold" :class="s.icona" />
          </span>
          <span class="min-w-0 flex-1">
            <b class="block text-[15px] font-medium">{{ s.titolo }}</b>
            <small class="block truncate text-[13px] text-testo2">{{ s.sotto }}</small>
          </span>
          <i class="ph-bold ph-caret-right text-testo3" />
        </a>
      </nav>

      <div v-if="aperta" class="flex min-w-0 flex-col gap-3">
        <component :is="aperta.comp" :key="aperta.id" />
      </div>
    </div>
  </div>
</template>
