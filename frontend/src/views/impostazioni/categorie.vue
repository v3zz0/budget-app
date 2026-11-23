<script setup>
import { computed, reactive, ref, watch } from "vue";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useWalletStore } from "@/stores/wallet.js";
import { caricaMese } from "@/services/dashboard.js";
import {
  aggiornaCategoria, consigliCategoria, contaTransazioniCategoria, creaCategoria, eliminaCategoria,
} from "@/services/impostazioni.js";
import { erroreLeggibile } from "@/services/api.js";
import { eur } from "@/utils/formato.js";
import { nomeMese } from "@/utils/budget.js";
import { categoriaOmonima, nomeCategoria } from "@/utils/impostazioni.js";
import SceltaEmoji, { EMOJI, EMOJI_ENTRATE } from "@/components/SceltaEmoji.vue";

const confirm = useConfirm();
const toast = useToast();
const walletStore = useWalletStore();
const avviso = (severity, summary, detail) => toast.add({ severity, summary, detail, life: 3500 });

const oggi = new Date();
const mese = { anno: oggi.getFullYear(), mese: oggi.getMonth() + 1 };
const nomeDelMese = nomeMese(mese.mese).toLowerCase();

const tutte = ref([]); // tutte le categorie del portafoglio, con le transazioni del mese
const loading = ref(false);
const errore = ref(null);
const tipo = ref("uscita");
const aperta = ref(null); // documentId della riga aperta, "nuova" per quella nuova
const bozza = reactive({ nome: "", budget: null, icona: "", errore: "", salvando: false });

let ultima = 0; // solo l'ultima richiesta scrive (cambio portafoglio veloce)
async function carica() {
  const n = ++ultima;
  errore.value = null;
  if (!walletStore.walletId) return (tutte.value = []);
  loading.value = true;
  try {
    const lista = await caricaMese(walletStore.walletId, mese);
    if (n === ultima) tutte.value = lista;
  } catch (e) {
    if (n === ultima) errore.value = erroreLeggibile(e);
  } finally {
    if (n === ultima) loading.value = false;
  }
}
watch(() => walletStore.walletId, () => ((aperta.value = null), carica()), { immediate: true });

// Le nascoste (da "+ Altro" senza "Aggiungi alle mie categorie") e quelle di
// sistema del condiviso non si gestiscono da qui.
const visibili = computed(() => tutte.value.filter((c) => !c.Nascosta && (c.Tipo || "uscita") === tipo.value));
const totaleMese = (c) => c.transazionis.reduce((s, t) => s + (Number(t.Importo) || 0), 0);
const sommaBudget = computed(() => visibili.value.reduce((s, c) => s + (Number(c.Budget_categoria) || 0), 0));
const budgetWallet = computed(() => Number(walletStore.selectedWallet?.Budget) || 0);
const entrata = computed(() => tipo.value === "entrata");

function sotto(c) {
  const t = totaleMese(c);
  if (entrata.value) return t ? `${eur(t, { corto: true })} ricevuti a ${nomeDelMese}` : `niente a ${nomeDelMese}`;
  return c.Budget_categoria
    ? `${eur(t, { corto: true })} spesi su ${eur(c.Budget_categoria, { corto: true })} a ${nomeDelMese}`
    : `${eur(t, { corto: true })} spesi a ${nomeDelMese}`;
}

function apri(c) {
  if (aperta.value === (c?.documentId ?? "nuova")) return (aperta.value = null);
  aperta.value = c?.documentId ?? "nuova";
  Object.assign(bozza, {
    nome: c?.Nome ?? "",
    budget: c?.Budget_categoria ?? null,
    icona: c?.icona || (entrata.value ? "💼" : "🏷️"),
    errore: "",
  });
}
function cambiaTipo(t) {
  tipo.value = t;
  aperta.value = null;
}

async function salva(id) {
  const nome = nomeCategoria(bozza.nome);
  if (nome.length < 2) return (bozza.errore = "Scrivi un nome di almeno 2 caratteri");
  // Nomi doppi non ammessi, in tutto il portafoglio (anche tra spese ed entrate)
  const omonima = categoriaOmonima(nome, tutte.value, id);
  if (omonima) {
    const dove = (omonima.Tipo || "uscita") === "entrata" ? "tra le entrate" : "tra le spese";
    return (bozza.errore = `“${omonima.Nome}” esiste già ${dove}`);
  }
  bozza.salvando = true;
  try {
    const dati = { nome, budget: Number(bozza.budget) || 0, icona: bozza.icona };
    if (id) await aggiornaCategoria(id, dati);
    else await creaCategoria(walletStore.walletId, { ...dati, tipo: tipo.value });
    aperta.value = null;
    await carica();
  } catch (e) {
    bozza.errore = erroreLeggibile(e);
  } finally {
    bozza.salvando = false;
  }
}

async function aggiungiSuggerita(s) {
  try {
    await creaCategoria(walletStore.walletId, { nome: s.nome, budget: 0, icona: s.icona, tipo: "entrata" });
    await carica();
  } catch (e) {
    avviso("error", "Categoria non creata", erroreLeggibile(e));
  }
}
const SUGGERITE = [
  { nome: "Stipendio", icona: "💼" },
  { nome: "Freelance", icona: "🎨" },
  { nome: "Rimborsi", icona: "↩️" },
];
const suggerite = computed(() => SUGGERITE.filter((s) => !categoriaOmonima(s.nome, tutte.value)));

async function elimina(c) {
  // La conferma dice cosa si perde: quante transazioni e quali consigli.
  let n = null;
  let consigli = [];
  try {
    [n, consigli] = await Promise.all([contaTransazioniCategoria(c.documentId), consigliCategoria(c.documentId)]);
  } catch {
    /* si conferma lo stesso, senza i numeri */
  }
  const parti = [n == null ? "tutte le sue transazioni" : n === 1 ? "1 transazione" : `${n} transazioni`];
  if (consigli.length) parti.push(consigli.length === 1 ? "1 consiglio sul budget" : `${consigli.length} consigli sul budget`);
  confirm.require({
    header: `Eliminare “${c.Nome}”?`,
    message: `Vengono cancellate anche ${parti.join(" e ")}. Non si può annullare.`,
    acceptLabel: "Elimina categoria",
    accept: async () => {
      try {
        await eliminaCategoria(c.documentId);
        aperta.value = null;
        await carica();
        avviso("success", "Categoria eliminata");
      } catch (e) {
        avviso("error", "Categoria non eliminata", erroreLeggibile(e));
      }
    },
  });
}
</script>

<template>
  <section class="panel reveal">
    <h2 class="text-[28px] leading-[1.05] font-medium tracking-[-0.04em] sm:text-[34px]">Categorie</h2>
    <p class="mt-3 max-w-[60ch] text-testo2">
      Le categorie di spesa hanno un budget mensile. Quelle di entrata possono avere un'entrata prevista, ad esempio lo stipendio.
    </p>
  </section>

  <section class="panel">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div class="seg" role="group" aria-label="Tipo di categoria">
        <button :aria-pressed="tipo === 'uscita'" @click="cambiaTipo('uscita')">Spese</button>
        <button :aria-pressed="tipo === 'entrata'" @click="cambiaTipo('entrata')">Entrate</button>
      </div>
      <button class="pill-btn pill-btn--cream h-11! px-5!" :disabled="!walletStore.walletId" @click="apri(null)">
        <i class="ph-bold ph-plus" />{{ entrata ? "Nuova entrata" : "Nuova spesa" }}
      </button>
    </div>

    <div v-if="errore" class="box-errore">{{ errore }}</div>
    <template v-else-if="loading && !tutte.length">
      <Skeleton v-for="i in 4" :key="i" height="3.5rem" borderRadius="18px" class="mb-2" />
    </template>
    <p v-else-if="!walletStore.walletId" class="vuoto">Nessun portafoglio. Creane uno in Portafogli e budget.</p>

    <template v-else>
      <!-- Riga nuova, in cima -->
      <div v-if="aperta === 'nuova'" class="rounded-[20px] bg-campo">
        <div class="px-5 pt-5 pb-2 text-[15px] font-medium">{{ entrata ? "Nuova categoria di entrata" : "Nuova categoria di spesa" }}</div>
        <div class="px-5 pb-5">
          <div class="grid gap-4 md:grid-cols-[2fr_1fr]">
            <div>
              <label class="etichetta" for="c-nome-n">Nome</label>
              <input id="c-nome-n" v-model="bozza.nome" class="campo rounded-full! bg-card!" maxlength="40" autofocus @keydown.enter.prevent="salva(null)" />
            </div>
            <div>
              <label class="etichetta" for="c-bud-n">{{ entrata ? "Entrata prevista (facoltativa)" : "Budget mensile" }}</label>
              <InputNumber v-model="bozza.budget" inputId="c-bud-n" mode="currency" currency="EUR" locale="it-IT" :min="0" fluid />
            </div>
          </div>
          <div class="mt-4"><SceltaEmoji v-model="bozza.icona" :emoji="entrata ? EMOJI_ENTRATE : EMOJI" /></div>
          <p v-if="bozza.errore" class="errore-campo flex items-center gap-1.5"><i class="ph-bold ph-warning-circle" />{{ bozza.errore }}</p>
          <div class="mt-5 flex justify-end gap-2">
            <button class="pill-btn pill-btn--ghost h-11! px-5!" @click="aperta = null">Annulla</button>
            <button class="pill-btn pill-btn--cream h-11! px-5!" :disabled="bozza.salvando" @click="salva(null)">Crea</button>
          </div>
        </div>
      </div>

      <div v-if="!visibili.length && aperta !== 'nuova'" class="px-4 py-8 text-center text-sm text-testo2">
        <i class="ph-bold ph-tag mb-3 block text-[28px] text-testo3" />
        {{ entrata ? "Nessuna categoria di entrata." : "Nessuna categoria di spesa." }}
      </div>

      <div class="flex flex-col">
        <div
          v-for="(c, i) in visibili"
          :key="c.documentId"
          class="rounded-[20px] transition-colors"
          :class="[aperta === c.documentId ? 'bg-campo' : i ? 'border-t border-bordo' : '']"
        >
          <button
            type="button"
            class="flex w-full items-center gap-4 rounded-[20px] px-0 py-3 text-left sm:px-3"
            :class="aperta === c.documentId ? 'px-3!' : 'hover:bg-campo'"
            :aria-expanded="aperta === c.documentId"
            @click="apri(c)"
          >
            <span class="grid h-11 w-11 flex-none place-items-center rounded-full text-[22px]" :class="aperta === c.documentId ? 'bg-card' : 'bg-campo'">
              <Emoji :e="c.icona || '🏷️'" />
            </span>
            <span class="min-w-0 flex-1">
              <b class="block truncate text-[15px] font-medium">{{ c.Nome }}</b>
              <small class="block truncate text-[13px] text-testo2">{{ sotto(c) }}</small>
            </span>
            <span v-if="c.Budget_categoria" class="num text-base">{{ eur(c.Budget_categoria, { corto: true }) }}</span>
            <i class="ph-bold ph-caret-down text-testo3 transition-transform" :class="{ 'rotate-180': aperta === c.documentId }" />
          </button>

          <div v-if="aperta === c.documentId" class="px-3 pt-2 pb-4 sm:px-5 sm:pb-5">
            <div class="grid gap-4 md:grid-cols-[2fr_1fr]">
              <div>
                <label class="etichetta" :for="`c-nome-${i}`">Nome</label>
                <input :id="`c-nome-${i}`" v-model="bozza.nome" class="campo rounded-full! bg-card!" maxlength="40" @keydown.enter.prevent="salva(c.documentId)" />
              </div>
              <div>
                <label class="etichetta" :for="`c-bud-${i}`">{{ entrata ? "Entrata prevista (facoltativa)" : "Budget mensile" }}</label>
                <InputNumber v-model="bozza.budget" :inputId="`c-bud-${i}`" mode="currency" currency="EUR" locale="it-IT" :min="0" fluid />
              </div>
            </div>
            <div class="mt-4"><SceltaEmoji v-model="bozza.icona" :emoji="entrata ? EMOJI_ENTRATE : EMOJI" /></div>
            <p v-if="bozza.errore" class="errore-campo flex items-center gap-1.5"><i class="ph-bold ph-warning-circle" />{{ bozza.errore }}</p>
            <div class="mt-5 flex flex-col-reverse items-stretch justify-between gap-2 sm:flex-row sm:items-center">
              <button type="button" class="inline-flex h-10 items-center gap-1.5 self-start rounded-full px-3 text-sm font-medium text-fg-avviso hover:bg-card" @click="elimina(c)">
                <i class="ph-bold ph-trash" />Elimina
              </button>
              <div class="flex justify-end gap-2">
                <button class="pill-btn pill-btn--ghost h-11! px-5!" @click="aperta = null">Annulla</button>
                <button class="pill-btn pill-btn--cream h-11! px-5!" :disabled="bozza.salvando" @click="salva(c.documentId)">Salva</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="entrata && suggerite.length" class="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-testo2">
        Suggerite:
        <button v-for="s in suggerite" :key="s.nome" class="chip bg-campo! hover:text-testo" @click="aggiungiSuggerita(s)">
          <Emoji :e="s.icona" />{{ s.nome }} <i class="ph-bold ph-plus" />
        </button>
      </div>

      <div class="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-bordo pt-5 text-sm text-testo2">
        <template v-if="!entrata">
          <span>Totale budget categorie <b class="num font-medium text-testo">{{ eur(sommaBudget, { corto: true }) }}</b></span>
          <span :class="{ 'text-fg-avviso': sommaBudget > budgetWallet }">
            {{ sommaBudget > budgetWallet ? "oltre" : "su" }} {{ eur(budgetWallet, { corto: true }) }} del portafoglio
          </span>
        </template>
        <span v-else>Entrate previste al mese <b class="num font-medium text-testo">{{ eur(sommaBudget, { corto: true }) }}</b></span>
      </div>
    </template>
  </section>
</template>
