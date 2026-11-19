<script setup>
import { computed, reactive, ref, watch } from "vue";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useWalletStore } from "@/stores/wallet.js";
import { aggiornaWallet, creaWallet, eliminaWallet, impostaEsclusione } from "@/services/impostazioni.js";
import { erroreLeggibile } from "@/services/api.js";

const confirm = useConfirm();
const toast = useToast();
const walletStore = useWalletStore();

const selezionato = computed(() => walletStore.selectedWallet);
const form = reactive({ nome: "", budget: 0 });
const salvando = ref(false);
// budget null e non 0: un campo vuoto si digita subito, "0,00 €" andrebbe prima selezionato
const nuovo = reactive({ aperto: false, nome: "", budget: null, salvando: false });

// Il form segue il portafoglio scelto (dall'elenco qui sotto o dalla barra in alto).
watch(
  selezionato,
  (w) => {
    form.nome = w?.Nome ?? "";
    form.budget = w?.Budget ?? 0;
  },
  { immediate: true },
);

const modificato = computed(
  () => !!selezionato.value && (form.nome.trim() !== (selezionato.value.Nome ?? "") || (form.budget ?? 0) !== (selezionato.value.Budget ?? 0)),
);

const avviso = (severity, summary, detail) => toast.add({ severity, summary, detail, life: 3500 });
const errore = (e) => avviso("error", "Errore", erroreLeggibile(e));

// Salvataggio esplicito e non a debounce come nell'app: nel browser un
// salvataggio a metà digitazione scriverebbe sul server un nome incompleto.
async function salva() {
  if (!form.nome.trim()) return avviso("warn", "Il nome non può essere vuoto");
  salvando.value = true;
  try {
    await aggiornaWallet(selezionato.value.documentId, form.nome.trim(), form.budget ?? 0);
    await walletStore.carica(); // riallinea selezione e barra in alto
    avviso("success", "Portafoglio aggiornato");
  } catch (e) {
    errore(e);
  } finally {
    salvando.value = false;
  }
}

// Aggiorna prima il server: se la chiamata fallisce l'interruttore non si
// muove (è legato allo store), così non racconta una cosa diversa dal database.
async function cambiaEsclusione(escluso) {
  try {
    await impostaEsclusione(selezionato.value.documentId, escluso);
    await walletStore.carica();
  } catch (e) {
    errore(e);
  }
}

async function crea() {
  nuovo.salvando = true;
  try {
    const creato = await creaWallet(nuovo.nome.trim(), nuovo.budget ?? 0);
    await walletStore.carica();
    const w = walletStore.wallets.find((x) => x.documentId === creato.documentId);
    if (w) walletStore.setSelectedWallet(w); // quasi sempre ci si aggiungono subito le categorie
    nuovo.aperto = false;
    avviso("success", "Portafoglio creato");
  } catch (e) {
    errore(e);
  } finally {
    nuovo.salvando = false;
  }
}

function apriNuovo() {
  Object.assign(nuovo, { aperto: true, nome: "", budget: null });
}

function elimina() {
  const w = selezionato.value;
  // La conferma nomina il portafoglio, così un click distratto non basta.
  confirm.require({
    header: "Eliminare il portafoglio?",
    message: `Stai per eliminare "${w.Nome}" con le sue categorie, transazioni e lo storico del salvadanaio: non li vedrai più e non si possono recuperare.`,
    acceptLabel: "Elimina",
    rejectLabel: "Annulla",
    acceptProps: { severity: "danger" },
    rejectProps: { severity: "secondary", text: true },
    accept: async () => {
      try {
        await eliminaWallet(w.documentId);
        await walletStore.carica(); // se quello scelto non c'è più, ripiega sul primo
        avviso("success", "Portafoglio eliminato");
      } catch (e) {
        errore(e);
      }
    },
  });
}
</script>

<template>
  <div class="flex max-w-lg flex-col gap-5 px-4 pt-6">
    <div>
      <Indietro />
      <h1 class="text-3xl font-bold text-testo">Portafogli e budget</h1>
    </div>

    <!-- Scelta del portafoglio da modificare -->
    <div v-if="walletStore.wallets.length > 1" class="flex flex-wrap gap-2" role="radiogroup" aria-label="Portafoglio">
      <button
        v-for="w in walletStore.wallets"
        :key="w.documentId"
        type="button"
        role="radio"
        :aria-checked="w.documentId === walletStore.walletId"
        class="rounded-full border px-4 py-1.5 text-sm"
        :class="w.documentId === walletStore.walletId ? 'border-accent bg-accent/10 text-accent' : 'border-bordo bg-card text-testo2'"
        @click="walletStore.setSelectedWallet(w)"
      >
        {{ w.Nome }}
      </button>
    </div>

    <template v-if="selezionato">
      <form class="flex flex-col gap-4 rounded-2xl border border-bordo bg-card p-5" @submit.prevent="salva">
        <p class="text-[11px] font-semibold uppercase tracking-[0.15em] text-testo2">Dettagli portafoglio</p>
        <div class="flex flex-col gap-2">
          <label for="nome" class="text-sm text-testo2">Nome</label>
          <InputText id="nome" v-model="form.nome" fluid />
        </div>
        <div class="flex flex-col gap-2">
          <label for="budget" class="text-sm text-testo2">Budget mensile</label>
          <InputNumber v-model="form.budget" inputId="budget" mode="currency" currency="EUR" locale="it-IT" :min="0" fluid />
        </div>
        <Button type="submit" label="Salva" :loading="salvando" :disabled="!modificato" />
      </form>

      <section class="rounded-2xl border border-bordo bg-card p-5">
        <p class="text-[11px] font-semibold uppercase tracking-[0.15em] text-testo2">Statistiche</p>
        <label class="mt-3 flex items-center justify-between gap-4">
          <span>
            <span class="block font-semibold text-testo">Escludi "{{ selezionato.Nome }}"</span>
            <span class="block text-xs text-testo2">
              Resta visibile in home, ma esce da export e avvisi. Utile per promemoria di scadenze (mutuo, IMU) che non sono spesa corrente.
            </span>
          </span>
          <ToggleSwitch :modelValue="!!selezionato.escludiDaStatistiche" @update:modelValue="cambiaEsclusione" />
        </label>
      </section>
    </template>
    <p v-else class="py-6 text-center text-testo2">Nessun portafoglio: creane uno per cominciare.</p>

    <Button label="Nuovo portafoglio" icon="pi pi-plus" severity="secondary" outlined @click="apriNuovo" />

    <!-- Distruttivo: in fondo e staccato dai campi che si toccano ogni giorno -->
    <Button
      v-if="selezionato && walletStore.wallets.length > 1"
      :label="`Elimina &quot;${selezionato.Nome}&quot;`"
      icon="pi pi-trash"
      severity="danger"
      text
      class="mt-6"
      @click="elimina"
    />

    <Dialog v-model:visible="nuovo.aperto" modal header="Nuovo portafoglio" :style="{ width: '24rem', maxWidth: '92vw' }">
      <form id="nuovo-wallet" class="flex flex-col gap-4" @submit.prevent="crea">
        <div class="flex flex-col gap-2">
          <label for="nuovo-nome" class="text-sm text-testo2">Nome</label>
          <InputText id="nuovo-nome" v-model="nuovo.nome" autofocus fluid />
        </div>
        <div class="flex flex-col gap-2">
          <label for="nuovo-budget" class="text-sm text-testo2">Budget mensile</label>
          <InputNumber v-model="nuovo.budget" inputId="nuovo-budget" mode="currency" currency="EUR" locale="it-IT" :min="0" fluid />
        </div>
      </form>
      <template #footer>
        <Button label="Annulla" severity="secondary" text @click="nuovo.aperto = false" />
        <!-- Senza nome non si crea: un portafoglio "" non si distingue dagli altri nella barra in alto -->
        <Button type="submit" form="nuovo-wallet" label="Crea" :loading="nuovo.salvando" :disabled="!nuovo.nome.trim()" />
      </template>
    </Dialog>
  </div>
</template>
