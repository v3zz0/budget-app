<script setup>
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useWalletStore } from "@/stores/wallet.js";
import { eliminaTransazione, elencaRicorrenti } from "@/services/transazioni.js";
import { erroreLeggibile } from "@/services/api.js";
import { euro } from "@/utils/budget.js";
import { prossimaScadenza, quando } from "@/utils/ricorrenza.js";

const router = useRouter();
const confirm = useConfirm();
const toast = useToast();
const walletStore = useWalletStore();

const lista = ref([]);
const loading = ref(false);
const errore = ref(null);

// Le più vicine in cima
const voci = computed(() =>
  lista.value
    .map((t) => ({ t, prossima: prossimaScadenza(t) }))
    .sort((a, b) => a.prossima - b.prossima),
);

let ultima = 0; // solo l'ultima richiesta scrive (cambio portafoglio veloce)
async function carica(walletId = walletStore.walletId) {
  const n = ++ultima;
  errore.value = null;
  if (!walletId) {
    lista.value = [];
    return;
  }
  loading.value = true;
  try {
    const dati = await elencaRicorrenti(walletId);
    if (n === ultima) lista.value = dati;
  } catch (e) {
    if (n === ultima) errore.value = erroreLeggibile(e);
  } finally {
    if (n === ultima) loading.value = false;
  }
}
watch(() => walletStore.walletId, carica, { immediate: true });

function elimina(t) {
  confirm.require({
    header: "Eliminare la ricorrente?",
    message: "Non verrà più registrata automaticamente ogni mese. Le spese già registrate restano.",
    acceptLabel: "Elimina",
    rejectLabel: "Annulla",
    acceptProps: { severity: "danger" },
    rejectProps: { severity: "secondary", text: true },
    accept: async () => {
      try {
        await eliminaTransazione(t.documentId);
        await carica();
      } catch (e) {
        toast.add({ severity: "error", summary: "Errore", detail: erroreLeggibile(e), life: 4000 });
      }
    },
  });
}
</script>

<template>
  <div class="flex flex-col gap-4 px-4 pt-6">
    <div>
      <Indietro />
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-testo2">Ogni mese</p>
      <h1 class="text-3xl font-bold text-testo">Ricorrenti</h1>
    </div>

    <div v-if="errore" class="rounded-xl border border-errore/40 bg-errore/15 p-4 text-errore-testo">{{ errore }}</div>

    <template v-else-if="loading && !voci.length">
      <Skeleton v-for="i in 3" :key="i" height="4.5rem" borderRadius="12px" />
    </template>

    <div v-else-if="!voci.length" class="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <i class="pi pi-replay text-4xl text-testo2" />
      <p class="font-semibold text-testo">Nessuna transazione ricorrente</p>
      <p class="text-sm text-testo2">Quando salvi una transazione, attiva "Ricorrente" per farla ripetere ogni mese.</p>
    </div>

    <template v-else>
      <p class="px-1 text-sm text-testo2">
        Ogni mese queste spese vengono registrate automaticamente. Toccane una per modificarla.
      </p>
      <div
        v-for="{ t, prossima } in voci"
        :key="t.documentId"
        class="flex items-center gap-3 rounded-xl border border-bordo bg-card pr-2"
      >
        <button type="button" class="flex flex-1 items-center gap-3 p-4 text-left" @click="router.push(`/transazioni/${t.documentId}`)">
          <span v-if="t.categorie?.icona" class="text-xl">{{ t.categorie.icona }}</span>
          <span class="flex-1">
            <span class="block text-sm font-semibold text-testo">{{ t.Descrizione || t.categorie?.Nome }}</span>
            <span class="block text-xs text-testo2">{{ t.categorie?.Nome }} · {{ quando(prossima) }}</span>
          </span>
          <span class="font-bold text-testo">{{ euro(t.Importo, 2) }}</span>
        </button>
        <Button icon="pi pi-trash" severity="danger" text rounded aria-label="Elimina" @click="elimina(t)" />
      </div>
    </template>
  </div>
</template>
