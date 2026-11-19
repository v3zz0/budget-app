<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import { useDashboardStore } from "@/stores/dashboard.js";
import { useWalletStore } from "@/stores/wallet.js";
import { aggiornaTransazione, creaTransazione, trovaTransazione } from "@/services/transazioni.js";
import { erroreLeggibile } from "@/services/api.js";
import { dataDaIso, isoDaData } from "@/utils/budget.js";

// id presente (dalla route) = modifica, assente = nuova
const props = defineProps({ id: { type: String, default: null } });

const router = useRouter();
const toast = useToast();
const dashboard = useDashboardStore();
const walletStore = useWalletStore();

const form = reactive({
  categoriaId: null,
  descrizione: "",
  importo: null,
  data: new Date(),
  ricorrente: false,
  contanti: false,
});
const caricamento = ref(true);
const salvataggio = ref(false);

const categorie = computed(() =>
  dashboard.categorie.map((c) => ({ value: c.documentId, label: `${c.icona || ""} ${c.Nome}`.trim() })),
);
const valido = computed(() => form.categoriaId && form.importo !== null);

const errore = (detail) => toast.add({ severity: "error", summary: "Errore", detail, life: 4000 });

onMounted(async () => {
  try {
    // Le categorie non dipendono dal mese, ma stanno nello store della
    // dashboard: se si arriva qui a freddo (link diretto) vanno caricate.
    if (walletStore.walletId && dashboard.walletId !== walletStore.walletId) {
      await dashboard.carica(walletStore.walletId);
    }
    if (props.id) {
      const t = await trovaTransazione(props.id);
      Object.assign(form, {
        categoriaId: t.categorie?.documentId ?? null,
        descrizione: t.Descrizione ?? "",
        importo: t.Importo,
        data: dataDaIso(t.Data),
        ricorrente: !!t.TransazioneRicorrente,
        contanti: !!t.Contanti,
      });
    }
  } catch (e) {
    errore(erroreLeggibile(e));
  } finally {
    caricamento.value = false;
  }
});

async function salva() {
  salvataggio.value = true;
  try {
    const t = { ...form, data: isoDaData(form.data) };
    await (props.id ? aggiornaTransazione(props.id, t) : creaTransazione(t));
    toast.add({ severity: "success", summary: "Transazione salvata", life: 2500 });
    router.push("/");
  } catch (e) {
    errore(erroreLeggibile(e));
  } finally {
    salvataggio.value = false;
  }
}
</script>

<template>
  <div class="px-4 pt-6">
    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-testo2">
      {{ props.id ? "Modifica" : "Nuova" }}
    </p>
    <h1 class="mb-6 mt-1 text-3xl font-bold text-testo">Transazione</h1>

    <div v-if="caricamento" class="flex max-w-lg flex-col gap-4">
      <Skeleton v-for="i in 5" :key="i" height="3rem" borderRadius="12px" />
    </div>

    <form v-else class="flex max-w-lg flex-col gap-5 rounded-2xl border border-bordo bg-card p-5" @submit.prevent="salva">
      <div class="flex flex-col gap-2">
        <label for="categoria" class="text-sm text-testo2">Categoria</label>
        <Select
          v-model="form.categoriaId"
          inputId="categoria"
          :options="categorie"
          optionLabel="label"
          optionValue="value"
          :placeholder="categorie.length ? 'Seleziona categoria' : 'Nessuna categoria: creane una in Impostazioni'"
          fluid
        />
      </div>
      <div class="flex flex-col gap-2">
        <label for="importo" class="text-sm text-testo2">Importo</label>
        <InputNumber v-model="form.importo" inputId="importo" mode="currency" currency="EUR" locale="it-IT" fluid />
      </div>
      <div class="flex flex-col gap-2">
        <label for="descrizione" class="text-sm text-testo2">Descrizione</label>
        <InputText id="descrizione" v-model="form.descrizione" fluid />
      </div>
      <div class="flex flex-col gap-2">
        <label for="data" class="text-sm text-testo2">Data</label>
        <DatePicker v-model="form.data" inputId="data" dateFormat="dd/mm/yy" showIcon iconDisplay="input" fluid />
      </div>
      <label class="flex items-center justify-between gap-4">
        <span>
          <span class="block text-testo">Ricorrente</span>
          <span class="block text-xs text-testo2">Si ripete ogni mese lo stesso giorno</span>
        </span>
        <ToggleSwitch v-model="form.ricorrente" />
      </label>
      <label class="flex items-center justify-between gap-4">
        <span>
          <span class="block text-testo">Pagata in contanti</span>
          <span class="block text-xs text-testo2">Esclusa dal confronto con l'estratto conto</span>
        </span>
        <ToggleSwitch v-model="form.contanti" />
      </label>
      <div class="flex gap-3 pt-2">
        <Button type="button" label="Annulla" severity="secondary" text @click="router.back()" />
        <Button type="submit" label="Salva" :loading="salvataggio" :disabled="!valido" class="flex-1" />
      </div>
    </form>
  </div>
</template>
