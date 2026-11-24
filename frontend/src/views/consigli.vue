<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useToast } from "primevue/usetoast";
import { useConsigliStore } from "@/stores/consigli.js";
import { useDashboardStore } from "@/stores/dashboard.js";
import { useWalletStore } from "@/stores/wallet.js";
import { erroreLeggibile } from "@/services/api.js";
import { caricaRighe } from "@/services/transazioniQuery.js";
import { elencaCategorie } from "@/services/impostazioni.js";
import { chiaveMese, nomeMese, primoDelMese, spostaMese, ultimoDelMese } from "@/utils/budget.js";
import { eur } from "@/utils/formato.js";
import { descrivi, differenza, inAttesa, scala } from "@/utils/consigli.js";

// Consigli sul budget (progetto.md §19). I numeri li calcola il server a fine
// mese (motore-consigli.js, solo uscite, almeno 3 mesi di storico): qui si
// leggono, si applicano, si ignorano e si annullano.
const toast = useToast();
const consigli = useConsigliStore();
const dashboard = useDashboardStore();
const walletStore = useWalletStore();
const corto = (v) => eur(v, { corto: true });
const avviso = (severity, summary, detail) => toast.add({ severity, summary, detail, life: 3000 });

// I consigli nuovi di questa visita restano evidenziati anche dopo averli
// segnati come letti (aprire la lista spegne il pallino sulla campanella).
const nuovi = ref(new Set());
const chiusi = ref([]); // gestiti in questa visita: riga chiusa con "Annulla"
const occupato = ref(false);
onMounted(async () => {
  await consigli.carica();
  nuovi.value = new Set(consigli.lista.filter((c) => c.stato === "nuovo").map((c) => c.documentId));
  consigli.segnaTuttiLetti();
});

const delWallet = (c) => c.categorie?.wallet?.documentId === walletStore.walletId;
// Prima chi sfora di più, poi i risparmi possibili
const aperti = computed(() =>
  consigli.lista
    .filter(delWallet)
    .map((c) => ({ c, d: descrivi(c), s: scala(c) }))
    .sort((a, b) => (a.c.tipo === b.c.tipo ? b.d.sopra - a.d.sopra : a.c.tipo === "alza" ? -1 : 1)),
);
const chiusiQui = computed(() => chiusi.value.filter((x) => delWallet(x.c)));
const delta = computed(() => differenza(aperti.value.map((x) => x.c)));

async function esegui(fn, x, esito, messaggio) {
  occupato.value = true;
  try {
    await fn();
    chiusi.value = [{ c: x.c, esito }, ...chiusi.value];
    if (messaggio) avviso("success", messaggio);
    dashboard.carica(); // la Home mostra i budget: va ricaricata
  } catch (e) {
    avviso("error", "Non riuscito", erroreLeggibile(e));
  } finally {
    occupato.value = false;
  }
}
const applica = (x) => esegui(() => consigli.applica(x.c), x, "fatto", `Budget di ${x.c.categorie?.Nome}: ${corto(x.c.budgetProposto)}`);
const ignora = (x) => esegui(() => consigli.ignora(x.c), x, "ignorato", `Ignorato: torna solo se le spese di ${x.c.categorie?.Nome} cambiano`);
async function accettaTutti() {
  const lista = [...aperti.value];
  for (const x of lista) await esegui(() => consigli.applica(x.c), x, "fatto", null);
  avviso("success", `${lista.length} budget aggiornati`);
}
async function annulla(x) {
  occupato.value = true;
  try {
    await consigli.annulla(x.c);
    chiusi.value = chiusi.value.filter((y) => y !== x);
    dashboard.carica();
  } catch (e) {
    avviso("error", "Non annullato", erroreLeggibile(e));
  } finally {
    occupato.value = false;
  }
}

// In attesa di storico: categorie con meno di 3 mesi di spese negli ultimi 6 chiusi
const oggi = new Date();
const meseCorrente = { anno: oggi.getFullYear(), mese: oggi.getMonth() + 1 };
const mesiChiusi = Array.from({ length: 6 }, (_, i) => spostaMese(meseCorrente, i - 6));
const attesa = ref([]);
watch(
  () => walletStore.walletId,
  async (id) => {
    attesa.value = [];
    if (!id) return;
    try {
      const primo = mesiChiusi[0];
      const ultimo = mesiChiusi[5];
      const [{ righe }, categorie] = await Promise.all([
        caricaRighe({ dal: primoDelMese(primo.anno, primo.mese), al: ultimoDelMese(ultimo.anno, ultimo.mese), walletId: id }),
        elencaCategorie(id),
      ]);
      attesa.value = inAttesa(categorie, righe, mesiChiusi.map((m) => chiaveMese(m.anno, m.mese)));
    } catch {
      /* è solo un'informazione in più */
    }
  },
  { immediate: true },
);
const intro = `Confronto i budget con le spese degli ultimi 6 mesi chiusi, da ${nomeMese(mesiChiusi[0].mese).toLowerCase()} a ${nomeMese(mesiChiusi[5].mese).toLowerCase()}. Guardo solo le uscite; i consigli si ricalcolano a fine mese e servono almeno tre mesi di spese per categoria.`;
</script>

<template>
  <div>
    <div class="mb-8 sm:mb-10">
      <router-link to="/" class="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-testo2 hover:text-testo"><i class="ph-bold ph-arrow-left" />Home</router-link>
      <h1 class="display">Consigli</h1>
      <p class="mt-4 max-w-[64ch] text-[14.5px] text-testo2">{{ intro }}</p>
    </div>

    <template v-if="consigli.loading && !consigli.lista.length">
      <Skeleton v-for="i in 2" :key="i" height="16rem" borderRadius="28px" class="mb-3" />
    </template>

    <template v-else>
      <!-- Accettandoli tutti -->
      <div v-if="aperti.length >= 2" class="blocco reveal mb-3 flex flex-wrap items-center justify-between gap-4 bg-crema">
        <span class="flex items-center gap-3 text-[15px] font-medium">
          <i class="ph-bold ph-scales text-xl" />
          <span>Accettandoli tutti il budget delle categorie {{ delta >= 0 ? "sale" : "scende" }} di <b class="num">{{ corto(Math.abs(delta)) }}</b> al mese</span>
        </span>
        <button class="pill-btn pill-btn--ink h-12!" :disabled="occupato" @click="accettaTutti">Accetta tutti</button>
      </div>

      <div v-if="!aperti.length && !chiusiQui.length" class="panel flex flex-col items-center gap-3 py-14 text-center">
        <span class="grid h-14 w-14 place-items-center rounded-full bg-salvia text-2xl text-inchiostro"><i class="ph-bold ph-check" /></span>
        <h2 class="text-[26px] font-medium tracking-[-0.035em]">Nessun consiglio</h2>
        <p class="max-w-[44ch] text-testo2">I budget rispecchiano le tue spese. Ti avviso a fine mese se qualcosa cambia.</p>
      </div>

      <div class="flex flex-col gap-3">
        <article
          v-for="(x, i) in aperti"
          :key="x.c.documentId"
          class="panel reveal grid items-center gap-6 min-[981px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[981px]:gap-10"
          :class="{ 'shadow-[inset_0_0_0_2px_var(--color-anello)]': nuovi.has(x.c.documentId) }"
          :style="{ '--i': i }"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2.5">
              <span class="grid h-10 w-10 flex-none place-items-center rounded-full bg-campo text-xl"><Emoji :e="x.c.categorie?.icona || '🏷️'" /></span>
              <b class="text-[15px] font-medium">{{ x.c.categorie?.Nome }}</b>
              <span class="chip text-inchiostro" :class="x.c.tipo === 'alza' ? 'bg-arancio!' : 'bg-salvia!'">
                <i class="ph-bold" :class="x.c.tipo === 'alza' ? 'ph-arrow-up' : 'ph-arrow-down'" />{{ x.c.tipo === "alza" ? "Alza il budget" : "Abbassa il budget" }}
              </span>
            </div>
            <h2 class="mt-5 text-[26px] leading-[1.15] font-medium tracking-[-0.035em] sm:text-[30px]">{{ x.d.h }}</h2>
            <p class="mt-3 text-[14.5px] leading-relaxed text-testo2">{{ x.d.p }}</p>
            <p v-if="x.c.testo" class="mt-2 text-[13.5px] text-testo3 italic">{{ x.c.testo }}</p>
            <div class="mt-6 flex flex-wrap gap-2">
              <button class="pill-btn pill-btn--cream h-12!" :disabled="occupato" @click="applica(x)">{{ x.d.ok }}</button>
              <button class="pill-btn pill-btn--ghost h-12!" :disabled="occupato" @click="ignora(x)">Ignora</button>
            </div>
          </div>

          <!-- Mini grafico: una barra per mese, budget attuale e proposto -->
          <figure
            class="min-w-0"
            :aria-label="`Spese di ${x.c.categorie?.Nome} per mese: ${x.s.barre.map((b) => `${b.nome} ${corto(b.speso)}`).join(', ')}. Budget attuale ${corto(x.c.budgetAttuale)}, proposto ${corto(x.c.budgetProposto)}`"
          >
            <div class="relative mr-14 flex h-40 items-end gap-2 border-b border-bordo">
              <div v-for="b in x.s.barre" :key="b.mese" class="group relative flex h-full flex-1 items-end" tabindex="0">
                <span class="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 rounded-full bg-fondo-profondo px-2.5 py-1 text-xs whitespace-nowrap shadow-pop group-hover:block group-focus:block">
                  {{ b.nome }} · {{ corto(b.speso) }}
                </span>
                <div class="w-full rounded-t-md" :class="b.sopra ? 'bg-arancio' : 'bg-bordo-forte'" :style="{ height: `${b.h}%` }" />
              </div>
              <div class="pointer-events-none absolute inset-x-0 border-t-2 border-testo2" :style="{ bottom: `${x.s.attuale}%` }">
                <span class="num absolute top-1/2 -right-14 -translate-y-1/2 text-xs text-testo2">{{ corto(x.c.budgetAttuale) }}</span>
              </div>
              <div class="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-fg-accento" :style="{ bottom: `${x.s.proposto}%` }">
                <span class="num absolute top-1/2 -right-14 -translate-y-1/2 text-xs font-semibold text-fg-accento">{{ corto(x.c.budgetProposto) }}</span>
              </div>
            </div>
            <div class="mr-14 mt-1.5 flex gap-2 text-center text-xs text-testo2" aria-hidden="true">
              <span v-for="b in x.s.barre" :key="b.mese" class="flex-1">{{ b.nome.slice(0, 3) }}</span>
            </div>
            <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-testo2" aria-hidden="true">
              <span class="inline-flex items-center gap-1.5"><i class="inline-block h-0.5 w-4 bg-testo2" />budget attuale</span>
              <span class="inline-flex items-center gap-1.5"><i class="inline-block w-4 border-t-2 border-dashed border-fg-accento" />proposto</span>
              <span v-if="x.s.barre.some((b) => b.sopra)" class="inline-flex items-center gap-1.5"><i class="inline-block h-2.5 w-2.5 rounded-sm bg-arancio" />oltre il budget</span>
            </div>
          </figure>
        </article>

        <!-- Gestiti in questa visita: una riga, con Annulla -->
        <article v-for="x in chiusiQui" :key="`c-${x.c.documentId}`" class="panel flex items-center gap-3 py-4!">
          <span class="grid h-10 w-10 flex-none place-items-center rounded-full bg-campo text-xl"><Emoji :e="x.c.categorie?.icona || '🏷️'" /></span>
          <span class="min-w-0 flex-1">
            <b class="block truncate text-[15px] font-medium">{{ x.c.categorie?.Nome }}</b>
            <small class="text-[13px] text-testo2">{{ x.esito === "fatto" ? `Budget portato a ${corto(x.c.budgetProposto)}` : "Ignorato" }}</small>
          </span>
          <i class="ph-bold text-xl" :class="x.esito === 'fatto' ? 'ph-check-circle text-fg-positivo' : 'ph-eye-slash text-testo3'" aria-hidden="true" />
          <button class="h-10 rounded-full px-3 text-sm font-medium text-testo2 hover:bg-campo hover:text-testo" :disabled="occupato" @click="annulla(x)">Annulla</button>
        </article>
      </div>

      <div v-if="attesa.length" class="mt-12">
        <h2 class="mb-4 text-[17px] font-semibold tracking-[-0.015em]">In attesa di storico</h2>
        <div class="flex flex-wrap gap-2">
          <span v-for="a in attesa" :key="a.documentId" class="inline-flex h-11 items-center gap-2 rounded-full bg-card pr-4 pl-3 text-sm text-testo2">
            <Emoji :e="a.icona || '🏷️'" /><b class="font-medium text-testo">{{ a.Nome }}</b>ancora {{ a.mancano }} {{ a.mancano === 1 ? "mese" : "mesi" }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>
