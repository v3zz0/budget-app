<script setup>
import { reactive, ref, watch } from "vue";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useWalletStore } from "@/stores/wallet.js";
import { aggiornaCategoria, creaCategoria, elencaCategorie, eliminaCategoria } from "@/services/impostazioni.js";
import { erroreLeggibile } from "@/services/api.js";
import { euro } from "@/utils/budget.js";

const confirm = useConfirm();
const toast = useToast();
const walletStore = useWalletStore();

const EMOJI = ["🛒", "🍔", "🏠", "🚗", "⛽", "💊", "🎬", "🏖️", "👕", "📱", "💡", "🎁", "📚", "🐾", "☕", "💰"];

const categorie = ref([]);
const loading = ref(false);
const errore = ref(null);
const selezionate = reactive(new Set());
// id = null → nuova categoria
const dialogo = reactive({ aperto: false, id: null, nome: "", budget: 0, icona: "", salvando: false });

const avviso = (severity, summary, detail) => toast.add({ severity, summary, detail, life: 3500 });

let ultima = 0; // solo l'ultima richiesta scrive (cambio portafoglio veloce)
async function carica() {
  const n = ++ultima;
  errore.value = null;
  const id = walletStore.walletId;
  if (!id) {
    categorie.value = [];
    return;
  }
  loading.value = true;
  try {
    const lista = await elencaCategorie(id);
    if (n === ultima) categorie.value = lista;
  } catch (e) {
    if (n === ultima) errore.value = erroreLeggibile(e);
  } finally {
    if (n === ultima) loading.value = false;
  }
}
// Cambiando portafoglio le spunte non hanno più senso: si azzerano.
watch(
  () => walletStore.walletId,
  () => {
    selezionate.clear();
    carica();
  },
  { immediate: true },
);

const toggle = (id) => (selezionate.has(id) ? selezionate.delete(id) : selezionate.add(id));

function apri(c = null) {
  Object.assign(dialogo, {
    aperto: true,
    id: c?.documentId ?? null,
    nome: c?.Nome ?? "",
    budget: c?.Budget_categoria ?? null, // null per le nuove: si digita subito
    icona: c?.icona ?? "",
  });
}

async function salva() {
  const dati = { nome: dialogo.nome.trim(), budget: dialogo.budget ?? 0, icona: dialogo.icona.trim() };
  dialogo.salvando = true;
  try {
    if (dialogo.id) await aggiornaCategoria(dialogo.id, dati);
    else await creaCategoria(walletStore.walletId, dati);
    dialogo.aperto = false;
    await carica();
  } catch (e) {
    avviso("error", "Categoria non salvata", erroreLeggibile(e));
  } finally {
    dialogo.salvando = false;
  }
}

function eliminaSelezionate() {
  const ids = [...selezionate];
  confirm.require({
    header: "Eliminare le categorie?",
    message: `Stai per eliminare ${ids.length} ${ids.length === 1 ? "categoria" : "categorie"} con le transazioni e i consigli collegati: verranno eliminati definitivamente e non si possono recuperare.`,
    acceptLabel: "Elimina",
    rejectLabel: "Annulla",
    acceptProps: { severity: "danger" },
    rejectProps: { severity: "secondary", text: true },
    accept: async () => {
      const esiti = await Promise.allSettled(ids.map(eliminaCategoria));
      const fallite = esiti.filter((e) => e.status === "rejected");
      selezionate.clear();
      await carica();
      // Le eliminazioni riuscite restano tali: si dice quante non sono andate.
      if (fallite.length) avviso("error", `${fallite.length} su ${ids.length} non eliminate`, erroreLeggibile(fallite[0].reason));
      else avviso("success", ids.length === 1 ? "Categoria eliminata" : "Categorie eliminate");
    },
  });
}
</script>

<template>
  <div class="flex max-w-lg flex-col gap-4 px-4 pt-6">
    <div>
      <Indietro />
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-testo2">
        {{ walletStore.selectedWallet?.Nome || "Portafoglio" }}
      </p>
      <h1 class="text-3xl font-bold text-testo">Categorie di spesa</h1>
    </div>

    <div class="flex items-center justify-between gap-2">
      <p class="font-semibold text-testo">Categorie ({{ categorie.length }})</p>
      <div class="flex items-center gap-2">
        <Button
          v-if="selezionate.size"
          :label="`Elimina (${selezionate.size})`"
          icon="pi pi-trash"
          severity="danger"
          text
          size="small"
          @click="eliminaSelezionate"
        />
        <Button label="Nuova" icon="pi pi-plus" size="small" :disabled="!walletStore.walletId" @click="apri()" />
      </div>
    </div>

    <div v-if="errore" class="rounded-xl border border-errore/40 bg-errore/15 p-4 text-errore-testo">{{ errore }}</div>

    <template v-else-if="loading && !categorie.length">
      <Skeleton v-for="i in 4" :key="i" height="3.5rem" borderRadius="12px" />
    </template>

    <p v-else-if="!walletStore.walletId" class="py-8 text-center text-testo2">Nessun portafoglio. Creane uno in Portafogli e budget.</p>
    <p v-else-if="!categorie.length" class="py-8 text-center text-testo2">Nessuna categoria.<br />Premi "Nuova" per aggiungerne una.</p>

    <ul v-else class="flex flex-col gap-2" :class="{ 'opacity-60': loading }">
      <li v-for="c in categorie" :key="c.documentId" class="flex items-center gap-3 rounded-xl border border-bordo bg-card px-4 py-2.5">
        <input
          type="checkbox"
          class="h-4 w-4 accent-[var(--color-accent)]"
          :checked="selezionate.has(c.documentId)"
          :aria-label="`Seleziona ${c.Nome}`"
          @change="toggle(c.documentId)"
        />
        <span v-if="c.icona" class="text-lg">{{ c.icona }}</span>
        <span class="min-w-0 flex-1 truncate font-semibold text-testo">{{ c.Nome }}</span>
        <span class="text-sm text-testo2">{{ euro(c.Budget_categoria || 0) }}</span>
        <Button icon="pi pi-pencil" text rounded size="small" severity="secondary" :aria-label="`Modifica ${c.Nome}`" @click="apri(c)" />
      </li>
    </ul>

    <Dialog
      v-model:visible="dialogo.aperto"
      modal
      :header="dialogo.id ? 'Modifica categoria' : 'Nuova categoria'"
      :style="{ width: '24rem', maxWidth: '92vw' }"
    >
      <form id="form-categoria" class="flex flex-col gap-4" @submit.prevent="salva">
        <div class="flex flex-col gap-2">
          <label for="icona" class="text-sm text-testo2">Icona (emoji)</label>
          <!-- maxlength 8: le emoji composte (famiglia 👨‍👩‍👧‍👦) occupano fino a 7-8 unità UTF-16 -->
          <InputText id="icona" v-model="dialogo.icona" maxlength="8" placeholder="🛒" class="text-center text-xl" fluid />
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="e in EMOJI"
              :key="e"
              type="button"
              class="grid h-10 w-10 place-items-center rounded-lg border text-xl"
              :class="dialogo.icona === e ? 'border-accent bg-accent' : 'border-bordo bg-campo'"
              :aria-label="`Icona ${e}`"
              @click="dialogo.icona = e"
            >
              {{ e }}
            </button>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <label for="cat-nome" class="text-sm text-testo2">Nome</label>
          <InputText id="cat-nome" v-model="dialogo.nome" fluid />
        </div>
        <div class="flex flex-col gap-2">
          <label for="cat-budget" class="text-sm text-testo2">Budget mensile</label>
          <InputNumber v-model="dialogo.budget" inputId="cat-budget" mode="currency" currency="EUR" locale="it-IT" :min="0" fluid />
        </div>
      </form>
      <template #footer>
        <Button label="Annulla" severity="secondary" text @click="dialogo.aperto = false" />
        <Button type="submit" form="form-categoria" label="Salva" :loading="dialogo.salvando" :disabled="!dialogo.nome.trim()" />
      </template>
    </Dialog>
  </div>
</template>
