<script setup>
import { computed, ref, watch } from "vue";
import { useToast } from "primevue/usetoast";
import { useWalletStore } from "@/stores/wallet.js";
import { analizzaEstratti, erroreAnalisi } from "@/services/analisi.js";
import { creaTransazione } from "@/services/transazioni.js";
import { erroreLeggibile } from "@/services/api.js";
import { categoriaSuggerita, raggruppaCategorie } from "@/utils/analisi.js";
import { chiaveMese, dataIt, euro } from "@/utils/budget.js";

const toast = useToast();
const walletStore = useWalletStore();

const files = ref([]);
const periodo = ref(new Date());
const loading = ref(false);
const errore = ref(null);
const report = ref(null);
const inputFile = ref(null);

const mese = computed(() => chiaveMese(periodo.value.getFullYear(), periodo.value.getMonth() + 1));
const pronto = computed(() => files.value.length > 0 && !!walletStore.walletId);

// Cambiare documenti, mese o portafoglio invalida il report: non è più quello.
const azzeraReport = () => (report.value = null);
watch([periodo, () => walletStore.walletId], azzeraReport);

function aggiungi(e) {
  const scelti = [...e.target.files];
  e.target.value = ""; // permette di riselezionare lo stesso file dopo averlo tolto
  for (const f of scelti) {
    // Lo stesso file due volte raddoppierebbe i suoi movimenti nel confronto.
    const gia = files.value.some((x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified);
    if (!gia) files.value.push(f);
  }
  azzeraReport();
}

function rimuovi(i) {
  files.value.splice(i, 1);
  azzeraReport();
}

async function analizza() {
  const id = walletStore.walletId;
  loading.value = true;
  errore.value = null;
  report.value = null;
  try {
    const r = await analizzaEstratti({ files: files.value, walletId: id, mese: mese.value });
    // Se nel frattempo si è cambiato portafoglio, il report non è più suo.
    if (id === walletStore.walletId) report.value = r;
  } catch (e) {
    errore.value = erroreAnalisi(e);
  } finally {
    loading.value = false;
  }
}

// --- Registrazione di un movimento mancante -------------------------------
// Data, descrizione e importo li ha già letti l'analisi: l'unica cosa che
// manca è la categoria. Se qualcosa non va, la transazione si corregge dalla
// dashboard come tutte le altre.
const daRegistrare = ref(null);
const categoriaScelta = ref(null);
const salvando = ref(false);
const gruppi = computed(() => raggruppaCategorie(report.value?.categorie ?? []));

function apriRegistra(m) {
  daRegistrare.value = m;
  categoriaScelta.value = categoriaSuggerita(report.value.categorie, m.categoriaSuggerita);
}

async function registra() {
  const m = daRegistrare.value;
  salvando.value = true;
  try {
    await creaTransazione({
      importo: m.importo,
      descrizione: m.descrizione,
      data: m.data,
      ricorrente: false,
      contanti: false, // viene da un estratto conto: non è contante
      categoriaId: categoriaScelta.value,
    });
    // Registrata: sparisce dai mancanti, che è esattamente quello che significa
    // "mancante". Il report resta com'è: rifare l'analisi per aggiornare una
    // lista che sappiamo già come cambia sarebbe un minuto buttato.
    report.value.mancanti = report.value.mancanti.filter((x) => x !== m);
    toast.add({ severity: "success", summary: `${m.descrizione} aggiunta`, life: 2500 });
    daRegistrare.value = null;
  } catch (e) {
    toast.add({ severity: "error", summary: "Errore", detail: erroreLeggibile(e), life: 4000 });
  } finally {
    salvando.value = false;
  }
}

const sforato = computed(() => (report.value?.totale.rimanente ?? 0) < 0);
const quota = (c) => (c.budget > 0 ? Math.min(c.speso / c.budget, 1) * 100 : 0);
</script>

<template>
  <div class="flex max-w-2xl flex-col gap-4 px-4 pt-6">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-testo2">Banca</p>
      <h1 class="text-3xl font-bold text-testo">Analisi estratto conto</h1>
      <p class="mt-2 text-sm text-testo2">
        Carica uno o più estratti (PDF o CSV), anche da conti diversi: vengono confrontati insieme con le transazioni
        registrate.
      </p>
    </div>

    <!-- Documenti -->
    <input ref="inputFile" type="file" accept=".pdf,.csv" multiple class="hidden" @change="aggiungi" />
    <button
      type="button"
      class="flex items-center gap-3 rounded-xl border border-bordo bg-card p-3.5 text-left disabled:opacity-60"
      :disabled="loading"
      @click="inputFile.click()"
    >
      <i class="pi pi-upload text-accent" />
      <span class="flex-1">
        <span class="block text-xs text-testo2">Documenti (PDF o CSV)</span>
        <span class="block text-sm font-semibold text-testo">
          {{ files.length ? `${files.length} file selezionati` : "Nessun file selezionato" }}
        </span>
      </span>
      <i class="pi pi-chevron-right text-testo2" />
    </button>

    <ul v-if="files.length" class="-mt-2 flex flex-col gap-1.5">
      <li v-for="(f, i) in files" :key="f.name + f.size" class="flex items-center gap-2 rounded-lg bg-campo px-3 py-2">
        <i class="pi pi-file text-testo2" />
        <span class="flex-1 truncate text-sm text-testo">{{ f.name }}</span>
        <button type="button" class="text-testo2 hover:text-testo disabled:opacity-50" :disabled="loading" :aria-label="`Rimuovi ${f.name}`" @click="rimuovi(i)">
          <i class="pi pi-times" />
        </button>
      </li>
    </ul>

    <div class="flex items-center gap-3 rounded-xl border border-bordo bg-card p-3.5">
      <i class="pi pi-calendar text-accent" />
      <label for="mese" class="flex-1 text-sm text-testo2">Mese da analizzare</label>
      <DatePicker v-model="periodo" inputId="mese" view="month" dateFormat="mm/yy" :disabled="loading" class="w-32" />
    </div>

    <Button
      :label="loading ? 'Analisi in corso…' : 'Analizza'"
      icon="pi pi-sparkles"
      :loading="loading"
      :disabled="!pronto"
      @click="analizza"
    />
    <p v-if="loading" class="text-xs text-testo2">
      Sto leggendo il documento e confrontando le transazioni. Con un formato riconosciuto è quasi immediato, altrimenti
      ci pensa l'AI e servono 30-60 secondi.
    </p>

    <div v-if="errore" class="flex gap-3 rounded-xl border border-errore bg-errore/15 p-3 text-sm text-testo">
      <i class="pi pi-exclamation-circle mt-0.5 text-errore" />{{ errore }}
    </div>

    <template v-if="report">
      <!-- Avvisi del server: periodo diverso dal mese chiesto, documento non letto,
           giudizio non generato... Si mostrano SEMPRE quando ci sono, non solo con
           `ok` falso: il server li scrive proprio qui perché un report parziale
           deve dirlo da sé, e `ok` resta vero anche quando l'AI non ha risposto. -->
      <div v-if="report.validazione?.warning" class="flex gap-3 rounded-xl border border-avviso bg-avviso/10 p-3 text-sm text-testo">
        <i class="pi pi-exclamation-triangle mt-0.5 text-avviso" />{{ report.validazione.warning }}
      </div>

      <!-- Giudizio. Il verdetto è anche a parole, non solo a colori. -->
      <section class="rounded-2xl border bg-card p-4" :class="sforato ? 'border-errore/40' : 'border-positivo/40'">
        <h2 class="flex items-center gap-2 text-base font-bold" :class="sforato ? 'text-errore-testo' : 'text-positivo'">
          <i :class="['pi', sforato ? 'pi-arrow-down-right' : 'pi-arrow-up-right']" />
          {{ sforato ? "Mese sforato" : "Mese in regola" }}
        </h2>
        <p v-if="report.giudizio" class="mt-2.5 text-sm leading-relaxed text-testo">{{ report.giudizio }}</p>
        <dl class="mt-3.5 grid grid-cols-3 gap-3">
          <div>
            <dt class="text-[11px] text-testo2">Budget</dt>
            <dd class="text-sm font-bold text-testo2">{{ euro(report.totale.budget, 2) }}</dd>
          </div>
          <div>
            <dt class="text-[11px] text-testo2">Speso</dt>
            <dd class="text-sm font-bold text-testo">{{ euro(report.totale.speso, 2) }}</dd>
          </div>
          <div>
            <dt class="text-[11px] text-testo2">{{ sforato ? "Sforato" : "Risparmio" }}</dt>
            <dd class="text-sm font-bold" :class="sforato ? 'text-errore-testo' : 'text-positivo'">
              {{ euro(Math.abs(report.totale.rimanente), 2) }}
            </dd>
          </div>
        </dl>
      </section>

      <!-- Categorie del mese -->
      <section v-if="report.sforamenti?.length" class="flex flex-col gap-2.5">
        <h2 class="px-1 pt-2 text-base font-semibold text-testo">Categorie del mese</h2>
        <div v-for="c in report.sforamenti" :key="c.documentId" class="rounded-xl border border-bordo bg-card p-3.5">
          <div class="flex items-center gap-2">
            <span v-if="c.icona">{{ c.icona }}</span>
            <span class="flex-1 text-sm font-semibold text-testo">{{ c.nome }}</span>
            <span class="text-xs font-semibold" :class="c.sforato ? 'text-errore-testo' : 'text-positivo'">
              {{ c.sforato ? `Sforato di ${euro(Math.abs(c.rimanente), 2)}` : `${euro(c.rimanente, 2)} rimasti` }}
            </span>
          </div>
          <div class="mt-2 h-1.5 overflow-hidden rounded bg-campo">
            <div class="h-full" :class="c.sforato ? 'bg-errore' : 'bg-positivo'" :style="{ width: quota(c) + '%' }" />
          </div>
          <p class="mt-1.5 text-[11px] text-testo2">{{ euro(c.speso, 2) }} / {{ euro(c.budget, 2) }}</p>
        </div>
      </section>

      <!-- Movimenti in banca ma non nell'app -->
      <section class="flex flex-col gap-2.5">
        <!-- Con un avviso (lettura parziale o fallita) "tutte registrate" non si può
             affermare: si dice solo che fra quelle lette non ne mancano. -->
        <div
          v-if="!report.mancanti.length && report.validazione?.warning"
          class="flex items-center gap-2.5 rounded-xl border border-bordo bg-card p-3.5 text-sm text-testo2"
        >
          <i class="pi pi-info-circle" />
          Nessun movimento mancante fra quelli letti (vedi l'avviso in alto).
        </div>
        <div
          v-else-if="!report.mancanti.length"
          class="flex items-center gap-2.5 rounded-xl border border-positivo bg-card p-3.5 text-sm text-testo"
        >
          <i class="pi pi-check-circle text-positivo" />
          Tutte le transazioni dell'estratto sono registrate nell'app
        </div>
        <template v-else>
          <div class="px-1 pt-2">
            <h2 class="flex items-center gap-2 text-base font-semibold text-testo">
              <i class="pi pi-exclamation-triangle text-sm text-avviso" />Transazioni mancanti ({{ report.mancanti.length }})
            </h2>
            <p class="text-xs text-testo2">Movimenti presenti in banca ma non registrati nell'app</p>
          </div>
          <div
            v-for="m in report.mancanti"
            :key="m.data + m.descrizione + m.importo"
            class="flex items-center gap-2 rounded-xl border border-bordo bg-card p-3"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-testo">{{ m.descrizione }}</p>
              <p class="mt-0.5 flex items-center gap-2 text-[11px] text-testo2">
                {{ dataIt(m.data) }}
                <span v-if="m.categoriaSuggerita" class="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                  {{ m.categoriaSuggerita }}
                </span>
              </p>
            </div>
            <span class="text-sm font-bold text-testo">{{ euro(m.importo, 2) }}</span>
            <Button icon="pi pi-plus-circle" text rounded size="small" aria-label="Registra nell'app" @click="apriRegistra(m)" />
          </div>
        </template>
      </section>
    </template>

    <Dialog
      :visible="!!daRegistrare"
      modal
      header="Registra transazione"
      :style="{ width: '24rem', maxWidth: '92vw' }"
      @update:visible="(v) => !v && (daRegistrare = null)"
    >
      <template v-if="daRegistrare">
        <p class="font-semibold text-testo">{{ daRegistrare.descrizione }}</p>
        <p class="mt-1 text-xs text-testo2">{{ dataIt(daRegistrare.data) }} · {{ euro(daRegistrare.importo, 2) }}</p>
        <label for="cat" class="mb-2 mt-4 block text-sm text-testo2">Categoria</label>
        <Select
          v-model="categoriaScelta"
          inputId="cat"
          :options="gruppi"
          optionGroupLabel="wallet"
          optionGroupChildren="items"
          optionLabel="label"
          optionValue="value"
          :placeholder="gruppi.length ? 'Seleziona categoria' : 'Nessuna categoria disponibile'"
          fluid
        />
      </template>
      <template #footer>
        <Button label="Annulla" severity="secondary" text @click="daRegistrare = null" />
        <Button label="Aggiungi" :loading="salvando" :disabled="!categoriaScelta" @click="registra" />
      </template>
    </Dialog>
  </div>
</template>
