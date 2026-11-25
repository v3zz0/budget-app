<script setup>
import { useMovimentoStore } from "@/stores/movimento.js";
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { useWalletStore } from "@/stores/wallet.js";
import {
  annullaMovimento, creaSalvadanaio, eliminaSalvadanaio, impostaRisparmio, muoviSalvadanaio, statoSalvadanaio,
} from "@/services/salvadanaio.js";
import { erroreLeggibile } from "@/services/api.js";
import { nomeMese } from "@/utils/budget.js";
import { eur } from "@/utils/formato.js";
import { parseImporto, testoImporto } from "@/utils/movimenti.js";
import Avatar from "@/components/Avatar.vue";

const confirm = useConfirm();
const toast = useToast();
const walletStore = useWalletStore();
const foglioMov = useMovimentoStore();
const avviso = (severity, summary, detail) => toast.add({ severity, summary, detail, life: 3500 });

const EMOJI = ["🚗", "✈️", "🏠", "🛟", "🎓", "💍", "🎁", "💻", "🏖️", "🐶", "🎸", "👶", "🛋️", "📷", "🚲", "🌱"];
const COLORI = ["argilla", "nebbia", "kaki", "pietra", "lilla"];
const coloreVar = (c) => `var(--color-av-${c || "pietra"})`;

const stato = ref(null);
const errore = ref(null);
const sel = ref("std"); // "std" = Risparmi mensili, altrimenti l'id del salvadanaio
const dettaglio = ref(null);
const occupato = ref(false);

let ultima = 0;
async function carica() {
  const n = ++ultima;
  errore.value = null;
  if (!walletStore.walletId) return (stato.value = null);
  try {
    const s = await statoSalvadanaio(walletStore.walletId);
    if (n === ultima) stato.value = s;
  } catch (e) {
    if (n === ultima) errore.value = erroreLeggibile(e);
  }
}
// Il salvadanaio è del portafoglio: cambiandolo cambia tutta la pagina.
watch(() => walletStore.walletId, () => ((sel.value = "std"), carica()), { immediate: true });
watch(() => foglioMov.versione, () => carica());

// Ogni scrittura risponde con lo stato aggiornato
async function esegui(fn, ok) {
  occupato.value = true;
  try {
    stato.value = await fn();
    if (ok) avviso("success", ok);
    return true;
  } catch (e) {
    avviso("error", "Operazione non riuscita", erroreLeggibile(e));
    return false;
  } finally {
    occupato.value = false;
  }
}

const etichettaMese = (k) => `${nomeMese(Number(k.slice(5, 7)))} ${k.slice(0, 4)}`;
const breve = (k) => nomeMese(Number(k.slice(5, 7))).slice(0, 3);
const standard = computed(() => stato.value?.cartelle.find((c) => c.standard));
const personali = computed(() => stato.value?.cartelle.filter((c) => !c.standard) || []);
const totale = computed(() => (stato.value?.cartelle || []).reduce((s, c) => s + c.saldo, 0));
const parti = computed(() => [
  { nome: "Risparmi mensili", v: standard.value?.saldo || 0, c: "var(--color-crema)" },
  ...personali.value.map((p) => ({ nome: p.nome, v: p.saldo, c: coloreVar(p.colore) })),
]);
const meseCorrente = computed(() => stato.value?.meseCorrente);
const nomeCorrente = computed(() => (meseCorrente.value ? nomeMese(Number(meseCorrente.value.slice(5, 7))).toLowerCase() : ""));
// Mesi chiusi (il corrente è "in corso") e gli ultimi 5 + il corrente nelle barrette
const chiusi = computed(() => (stato.value?.mesi || []).filter((m) => m.mese !== meseCorrente.value));
const corrente = computed(() => (stato.value?.mesi || []).find((m) => m.mese === meseCorrente.value));
const barrette = computed(() => [...chiusi.value.slice(0, 5)].reverse());
const massimo = computed(() => Math.max(1, ...(stato.value?.mesi || []).map((m) => m.risparmio)));
const cartella = computed(() => personali.value.find((p) => p.id === sel.value));
// Quanto entra in automatico ogni mese (versamenti attivi, non in pausa)
const mensileAuto = (c) => c.automatici.filter((a) => !a.inPausa).reduce((s, a) => s + a.importo, 0);
const mesiDisponibili = computed(() => (stato.value?.mesi || []).filter((m) => m.disponibile > 0));

function scegli(id) {
  sel.value = id;
  Object.assign(mov, { importo: "", nota: "", da: "nuovi", mese: mesiDisponibili.value[0]?.mese || "" });
  nextTick(() => dettaglio.value?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

// ── Risparmio del mese in corso ──────────────────────────────────────────────
const risparmio = ref("");
watch(corrente, (m) => (risparmio.value = m?.risparmio ? testoImporto(m.risparmio) : ""), { immediate: true });
async function salvaRisparmio() {
  const v = parseImporto(risparmio.value || "0");
  if (v == null) return avviso("warn", "Inserisci un importo valido");
  await esegui(() => impostaRisparmio(walletStore.walletId, meseCorrente.value, v), `Risparmio di ${nomeCorrente.value}: ${eur(v)}`);
}

// ── Movimenti di un salvadanaio personale ───────────────────────────────────
const mov = reactive({ importo: "", nota: "", da: "nuovi", mese: "", chi: null });
// Condiviso: il salvadanaio è di tutti e due, ogni movimento dice chi l'ha fatto
const condiviso = computed(() => !!walletStore.selectedWallet?.condiviso);
const io = computed(() => walletStore.mioRuolo(walletStore.selectedWallet));
const partner = computed(() => walletStore.partnerDi(walletStore.selectedWallet));
const persona = (r) => walletStore.personaDi(walletStore.selectedWallet, r);
const chiTesto = (r) => (r === io.value ? " tuo" : ` di ${partner.value?.nome}`);
async function muovi(segno) {
  const v = parseImporto(mov.importo);
  if (!(v > 0)) return avviso("warn", "Inserisci un importo maggiore di zero");
  const daMese = segno > 0 && mov.da === "mensili" ? mov.mese : null;
  if (segno > 0 && mov.da === "mensili" && !daMese) return avviso("warn", "Nessun risparmio mensile disponibile");
  const ok = await esegui(
    () => muoviSalvadanaio(walletStore.walletId, sel.value, { importo: segno * v, nota: mov.nota.trim(), daMese, chi: condiviso.value ? mov.chi || io.value : null }),
    segno > 0 ? (daMese ? `Spostati ${eur(v)} da ${etichettaMese(daMese).toLowerCase()}` : `Versati ${eur(v)}`) : `Prelevati ${eur(v)}`,
  );
  if (ok) Object.assign(mov, { importo: "", nota: "" });
}
function annulla(m) {
  confirm.require({
    header: "Annullare il movimento?",
    message: m.daMese
      ? `I ${eur(m.importo)} tornano nei Risparmi mensili di ${etichettaMese(m.daMese).toLowerCase()}.`
      : `${eur(m.importo, { segno: true })} del ${m.data.split("-").reverse().join("/")}.`,
    acceptLabel: "Annulla movimento",
    rejectLabel: "Indietro",
    icon: "ph-arrow-counter-clockwise",
    accept: () => esegui(() => annullaMovimento(walletStore.walletId, m.id), "Movimento annullato"),
  });
}
function elimina(p) {
  confirm.require({
    header: `Eliminare “${p.nome}”?`,
    message: `Il saldo di ${eur(p.saldo)} esce dal salvadanaio: i soldi spostati dai Risparmi mensili tornano nei loro mesi, quelli versati come soldi nuovi spariscono dal totale.`,
    acceptLabel: "Elimina salvadanaio",
    accept: async () => {
      if (await esegui(() => eliminaSalvadanaio(walletStore.walletId, p.id), "Salvadanaio eliminato")) sel.value = "std";
    },
  });
}

// ── Nuovo salvadanaio ───────────────────────────────────────────────────────
const nuovo = reactive({ aperto: false, nome: "", emoji: EMOJI[0], colore: COLORI[0], obiettivo: "" });
async function crea() {
  if (nuovo.nome.trim().length < 2) return avviso("warn", "Scrivi un nome di almeno 2 caratteri");
  const obiettivo = nuovo.obiettivo ? parseImporto(nuovo.obiettivo) : null;
  if (nuovo.obiettivo && obiettivo == null) return avviso("warn", "Obiettivo non valido");
  const prima = new Set(personali.value.map((p) => p.id));
  const ok = await esegui(
    () => creaSalvadanaio(walletStore.walletId, { nome: nuovo.nome.trim(), emoji: nuovo.emoji, colore: nuovo.colore, obiettivo }),
    "Salvadanaio creato",
  );
  if (!ok) return;
  Object.assign(nuovo, { aperto: false, nome: "", obiettivo: "" });
  const creato = personali.value.find((p) => !prima.has(p.id));
  if (creato) scegli(creato.id);
}
</script>

<template>
  <div>
    <div class="mb-8 flex flex-col items-start justify-between gap-6 sm:mb-10 sm:flex-row sm:items-end">
      <div>
        <div class="eyebrow">{{ condiviso ? `Risparmi di ${walletStore.selectedWallet.Nome} · tu e ${partner?.nome}` : `Risparmi di ${walletStore.selectedWallet?.Nome || "portafoglio"}` }}</div>
        <h1 class="display">Salvadanaio</h1>
      </div>
      <button class="pill-btn pill-btn--cream" :disabled="!stato" @click="nuovo.aperto = true"><i class="ph-bold ph-plus" />Nuovo salvadanaio</button>
    </div>

    <div v-if="errore" class="box-errore">{{ errore }}</div>
    <Skeleton v-else-if="!stato" height="20rem" borderRadius="28px" />

    <template v-else>
      <!-- Totale e ripartizione -->
      <section class="reveal mb-12 grid items-end gap-6 min-[981px]:grid-cols-[auto_1fr] min-[981px]:gap-12" aria-label="Totale risparmiato">
        <div>
          <small class="text-sm font-medium text-testo2">Totale risparmiato</small>
          <div class="mt-2 text-[clamp(56px,8vw,104px)] leading-[.95] tracking-[-0.055em]"><Euro :v="totale" /></div>
        </div>
        <div class="flex flex-col gap-4 pb-2.5">
          <div class="flex h-3.5 gap-[3px]" role="img" :aria-label="parti.map((p) => `${p.nome} ${eur(p.v)}`).join(', ')">
            <span v-for="p in parti.filter((x) => x.v > 0)" :key="p.nome" class="min-w-1.5 rounded" :style="{ flexGrow: p.v, background: p.c }" />
          </div>
          <div class="flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-testo2">
            <span v-for="p in parti" :key="p.nome" class="inline-flex items-center gap-2">
              <i class="inline-block h-2.5 w-2.5 rounded-[3px]" :style="{ background: p.c }" />{{ p.nome }}
              <b class="num font-medium text-testo">{{ eur(p.v, { corto: true }) }}</b>
            </span>
          </div>
        </div>
      </section>

      <!-- Cartelle -->
      <section class="mb-12 grid grid-cols-12 gap-2 sm:mb-16 sm:gap-3" aria-label="Cartelle">
        <button
          class="reveal col-span-12 flex min-h-[196px] flex-col gap-4 rounded-[20px] bg-crema p-6 text-left text-inchiostro transition hover:-translate-y-0.5 sm:rounded-[28px] sm:p-8 min-[981px]:col-span-6 min-[981px]:row-span-2"
          :class="{ 'ring-2 ring-testo ring-offset-[3px] ring-offset-fondo': sel === 'std' }"
          :aria-pressed="sel === 'std'"
          @click="scegli('std')"
        >
          <span class="flex items-center justify-between gap-3">
            <span class="grid h-12 w-12 place-items-center rounded-full bg-inchiostro-velo text-[22px]"><i class="ph-bold ph-calendar-blank" /></span>
            <span class="chip">Standard</span>
          </span>
          <span class="text-base font-semibold tracking-[-0.015em]">Risparmi mensili</span>
          <span class="mt-auto text-[clamp(40px,5.6vw,72px)] leading-none tracking-[-0.05em]"><Euro :v="standard?.saldo || 0" /></span>
          <span class="mt-2 grid h-24 auto-cols-fr grid-flow-col items-end gap-1.5 sm:h-[120px]" aria-hidden="true">
            <span v-for="m in barrette" :key="m.mese" class="flex h-full flex-col items-center gap-1.5">
              <span class="flex w-full max-w-11 flex-1 items-end overflow-hidden rounded-[10px] bg-inchiostro-velo">
                <span class="w-full rounded-[10px] bg-inchiostro" :style="{ height: `${Math.max(4, (Math.max(0, m.disponibile) / massimo) * 100)}%` }" />
              </span>
              <small class="text-xs font-medium">{{ breve(m.mese) }}</small>
            </span>
            <span class="flex h-full flex-col items-center gap-1.5">
              <span class="w-full max-w-11 flex-1 rounded-[10px] shadow-[inset_0_0_0_1.5px_var(--color-inchiostro-linea)]" />
              <small class="text-xs font-medium">{{ breve(meseCorrente) }}</small>
            </span>
          </span>
        </button>

        <button
          v-for="(p, i) in personali"
          :key="p.id"
          class="reveal col-span-6 flex min-h-[196px] min-w-0 flex-col gap-4 rounded-[20px] p-5 text-left text-inchiostro transition hover:-translate-y-0.5 sm:min-h-[232px] sm:rounded-[28px] sm:p-6 min-[981px]:col-span-3"
          :class="{ 'ring-2 ring-testo ring-offset-[3px] ring-offset-fondo': sel === p.id }"
          :style="{ background: coloreVar(p.colore), '--i': i + 2 }"
          :aria-pressed="sel === p.id"
          @click="scegli(p.id)"
        >
          <span class="flex items-center justify-between gap-2">
            <span class="grid h-12 w-12 place-items-center rounded-full bg-inchiostro-velo text-[26px]"><Emoji :e="p.emoji || '🐷'" /></span>
            <span v-if="mensileAuto(p)" class="chip whitespace-nowrap"><i class="ph-bold ph-arrows-clockwise" />{{ eur(mensileAuto(p), { corto: true }) }}/mese</span>
          </span>
          <span class="truncate text-base font-semibold tracking-[-0.015em]">{{ p.nome }}</span>
          <span class="num mt-auto text-[26px] leading-none sm:text-[34px]">{{ eur(p.saldo, { corto: true }) }}</span>
          <span v-if="p.obiettivo">
            <span class="bar block bg-inchiostro-velo!"><span class="bg-inchiostro!" :style="{ width: `${Math.min(100, (p.saldo / p.obiettivo) * 100)}%` }" /></span>
            <span class="mt-2 flex justify-between text-[13px] font-medium"><span>{{ Math.round(Math.min(100, (p.saldo / p.obiettivo) * 100)) }}%</span><span>di {{ eur(p.obiettivo, { corto: true }) }}</span></span>
          </span>
          <span v-else class="text-[13px] font-medium">Senza obiettivo</span>
        </button>

        <button
          class="col-span-6 flex min-h-[196px] flex-col items-center justify-center gap-3 rounded-[20px] text-testo2 shadow-[inset_0_0_0_1.5px_var(--color-bordo-forte)] hover:text-testo sm:min-h-[232px] sm:rounded-[28px] min-[981px]:col-span-3"
          @click="nuovo.aperto = true"
        >
          <span class="grid h-[52px] w-[52px] place-items-center rounded-full bg-card text-[22px] text-testo"><i class="ph-bold ph-plus" /></span>
          Nuovo salvadanaio
        </button>
      </section>

      <!-- Dettaglio -->
      <section ref="dettaglio" class="panel reveal scroll-mt-4" aria-live="polite">
        <!-- Risparmi mensili -->
        <template v-if="sel === 'std' || !cartella">
          <div class="mb-8 flex items-center gap-4">
            <span class="grid h-14 w-14 flex-none place-items-center rounded-full bg-crema text-2xl text-inchiostro"><i class="ph-bold ph-calendar-blank" /></span>
            <div>
              <h2 class="text-[28px] leading-[1.1] font-medium tracking-[-0.035em]">Risparmi mensili</h2>
              <small class="text-sm text-testo2">Un mese per riga. A fine mese il risparmio si chiude da solo.</small>
            </div>
          </div>
          <div class="grid items-start gap-8 min-[981px]:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              <div class="flex items-center gap-4 py-3.5 text-testo2">
                <span class="w-[110px] flex-none text-[15px] sm:w-[150px]">{{ etichettaMese(meseCorrente) }}</span>
                <span class="bar flex-1"><span :style="{ width: `${((corrente?.disponibile || 0) / massimo) * 100}%` }" /></span>
                <span class="w-24 text-right text-[15px] font-medium sm:w-[120px]">{{ corrente?.risparmio ? eur(corrente.disponibile, { corto: true }) : "in corso" }}</span>
              </div>
              <div v-for="m in chiusi" :key="m.mese" class="flex items-center gap-4 border-t border-bordo py-3.5">
                <span class="w-[110px] flex-none text-[15px] sm:w-[150px]">
                  {{ etichettaMese(m.mese) }}
                  <small v-for="x in m.spostati" :key="x.id" class="mt-0.5 block text-[12.5px] text-testo2">−{{ eur(x.importo, { corto: true }) }} → {{ x.verso }}</small>
                </span>
                <span class="bar flex-1"><span :style="{ width: `${(Math.max(0, m.disponibile) / massimo) * 100}%` }" /></span>
                <span class="num w-24 text-right text-[15px] font-medium sm:w-[120px]">
                  {{ eur(m.disponibile, { corto: true }) }}
                  <small v-if="m.spostati.length" class="block text-xs font-normal text-testo2">di {{ eur(m.risparmio, { corto: true }) }}</small>
                </span>
              </div>
              <p v-if="!chiusi.length" class="vuoto">Nessun mese chiuso</p>
            </div>
            <aside class="flex flex-col gap-4 rounded-[20px] bg-campo p-6">
              <h3 class="text-base font-semibold tracking-[-0.01em]">Risparmio di {{ nomeCorrente }}</h3>
              <div class="flex items-center justify-between gap-3 rounded-[14px] bg-card px-4 py-3 text-[13.5px]">
                <span>Entrate − uscite <b class="num font-medium">{{ eur(stato.suggerito, { corto: true }) }}</b></span>
                <button type="button" class="text-[13.5px] font-semibold text-fg-accento" @click="risparmio = testoImporto(Math.max(0, stato.suggerito))">Usa questo</button>
              </div>
              <div class="flex items-baseline gap-1.5 border-b-2 border-bordo-forte pb-1.5 focus-within:border-testo">
                <span class="text-[26px] text-testo2">€</span>
                <input v-model="risparmio" inputmode="decimal" placeholder="0" aria-label="Risparmio del mese" class="num w-full min-w-0 flex-1 bg-transparent text-[40px] tracking-[-0.045em] outline-none placeholder:text-testo3" />
              </div>
              <button class="pill-btn pill-btn--cream h-12!" :disabled="occupato" @click="salvaRisparmio">Salva nel mese</button>
              <p class="text-[13px] leading-normal text-testo2">Si può cambiare fino a fine mese. Se resta vuoto, alla chiusura vale entrate − uscite.</p>
            </aside>
          </div>
        </template>

        <!-- Salvadanaio personale -->
        <template v-else>
          <div class="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div class="flex min-w-0 items-center gap-4">
              <span class="grid h-14 w-14 flex-none place-items-center rounded-full text-[30px]" :style="{ background: coloreVar(cartella.colore) }"><Emoji :e="cartella.emoji || '🐷'" /></span>
              <div class="min-w-0">
                <h2 class="truncate text-[28px] leading-[1.1] font-medium tracking-[-0.035em]">{{ cartella.nome }}</h2>
                <small class="num text-sm text-testo2">
                  {{ eur(cartella.saldo, { corto: true }) }}
                  <template v-if="cartella.obiettivo">
                    di {{ eur(cartella.obiettivo, { corto: true }) }} ·
                    {{ cartella.obiettivo > cartella.saldo ? `mancano ${eur(cartella.obiettivo - cartella.saldo, { corto: true })}` : "obiettivo raggiunto" }}
                  </template>
                  <template v-else> · senza obiettivo</template>
                </small>
              </div>
            </div>
            <button class="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-testo2 hover:bg-campo hover:text-testo" @click="elimina(cartella)">
              <i class="ph-bold ph-trash" />Elimina
            </button>
          </div>
          <div class="grid items-start gap-8 min-[981px]:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              <p v-if="!cartella.movimenti.length" class="vuoto">Ancora nessun movimento.<br />Fai il primo versamento qui accanto.</p>
              <div v-for="(m, i) in cartella.movimenti" :key="m.id" class="group flex items-center gap-4 py-3.5" :class="{ 'border-t border-bordo': i }">
                <Avatar v-if="m.chi" :p="persona(m.chi)" :size="40" />
                <div class="min-w-0 flex-1">
                  <b class="block text-[15px] font-medium">
                    {{ m.importo >= 0 ? "Versamento" : "Prelievo" }}<template v-if="m.chi">{{ chiTesto(m.chi) }}</template><template v-if="m.nota"> · {{ m.nota }}</template>
                  </b>
                  <small class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-testo2">
                    {{ m.data.split("-").reverse().join("/") }}
                    <span v-if="m.daMese" class="inline-flex h-6 items-center gap-1 rounded-full bg-campo px-2.5 text-xs whitespace-nowrap">
                      <i class="ph-bold ph-calendar-blank" />da {{ etichettaMese(m.daMese).toLowerCase() }}
                    </span>
                  </small>
                </div>
                <span class="num w-24 text-right text-[15px] font-medium sm:w-[120px]" :class="{ 'text-fg-positivo': m.importo >= 0 }">{{ eur(m.importo, { segno: true }) }}</span>
                <button class="grid h-9 w-9 flex-none place-items-center rounded-full text-testo3 hover:bg-campo hover:text-testo" :aria-label="`Annulla il movimento del ${m.data}`" @click="annulla(m)">
                  <i class="ph-bold ph-arrow-counter-clockwise" />
                </button>
              </div>
            </div>
            <aside class="flex flex-col gap-4 rounded-[20px] bg-campo p-6">
              <h3 class="text-base font-semibold tracking-[-0.01em]">Nuovo movimento</h3>
              <div class="flex items-baseline gap-1.5 border-b-2 border-bordo-forte pb-1.5 focus-within:border-testo">
                <span class="text-[26px] text-testo2">€</span>
                <input v-model="mov.importo" inputmode="decimal" placeholder="0" aria-label="Importo" class="num w-full min-w-0 flex-1 bg-transparent text-[40px] tracking-[-0.045em] outline-none placeholder:text-testo3" />
              </div>
              <span id="src-l" class="-mb-1.5 text-[13px] font-medium text-testo2">Da dove arrivano i soldi?</span>
              <div class="grid grid-cols-2 gap-1 rounded-full bg-card p-1" role="radiogroup" aria-labelledby="src-l">
                <button
                  v-for="o in [{ id: 'nuovi', l: 'Soldi nuovi', i: 'ph-coins' }, { id: 'mensili', l: 'Risparmi mensili', i: 'ph-calendar-blank' }]"
                  :key="o.id"
                  type="button"
                  role="radio"
                  :aria-checked="mov.da === o.id"
                  class="flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-medium whitespace-nowrap text-testo2 sm:text-[13.5px]"
                  :class="{ 'bg-crema text-inchiostro!': mov.da === o.id }"
                  @click="mov.da = o.id"
                >
                  <i class="ph-bold flex-none" :class="o.i" /><span class="truncate">{{ o.l }}</span>
                </button>
              </div>
              <template v-if="mov.da === 'mensili'">
                <select v-if="mesiDisponibili.length" v-model="mov.mese" class="h-12 w-full max-w-full truncate rounded-full bg-card px-5 text-[14.5px] text-testo outline-none" aria-label="Mese da cui prendere i soldi">
                  <option v-for="m in mesiDisponibili" :key="m.mese" :value="m.mese">{{ etichettaMese(m.mese) }} · disponibili {{ eur(m.disponibile, { corto: true }) }}</option>
                </select>
                <p v-else class="text-[13px] text-testo2">Nessun risparmio mensile disponibile.</p>
              </template>
              <p class="flex items-start gap-1.5 text-[12.5px] leading-snug text-testo2">
                <i class="ph-bold ph-info mt-0.5" />
                {{ mov.da === "nuovi" ? "Si aggiungono al totale del salvadanaio: un regalo, un bonus." : "Escono dal mese scelto: il totale del portafoglio non cambia." }}
              </p>
              <template v-if="condiviso">
                <span id="chi-l" class="-mb-1.5 text-[13px] font-medium text-testo2">Chi versa o preleva?</span>
                <div class="grid grid-cols-2 gap-1 rounded-full bg-card p-1" role="radiogroup" aria-labelledby="chi-l">
                  <button
                    v-for="r in [io, io === 'creatore' ? 'membro' : 'creatore']"
                    :key="r"
                    type="button"
                    role="radio"
                    :aria-checked="(mov.chi || io) === r"
                    class="flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full px-2 text-[13.5px] font-medium text-testo2"
                    :class="{ 'bg-crema text-inchiostro!': (mov.chi || io) === r }"
                    @click="mov.chi = r"
                  >
                    <Avatar :p="persona(r)" :size="22" /><span class="truncate">{{ r === io ? "Io" : partner?.nome }}</span>
                  </button>
                </div>
              </template>
              <input v-model="mov.nota" maxlength="120" placeholder="Nota · facoltativa" autocomplete="off" class="h-12 w-full rounded-full bg-card px-5 text-[14.5px] text-testo outline-none placeholder:text-testo3 focus:shadow-[inset_0_0_0_2px_var(--color-testo3)]" />
              <div class="grid grid-cols-2 gap-2">
                <button class="pill-btn pill-btn--cream h-12!" :disabled="occupato" @click="muovi(1)">Versa</button>
                <button class="pill-btn pill-btn--ghost h-12!" :disabled="occupato || mov.da === 'mensili'" @click="muovi(-1)">Preleva</button>
              </div>
              <!-- Versamenti automatici di questa cartella (progetto.md §16) -->
              <div class="border-t border-bordo pt-4">
                <div v-for="a in cartella.automatici" :key="a.id" class="flex items-center gap-2 py-1 text-[13px]" :class="{ 'text-testo3': a.inPausa }">
                  <i class="ph-bold ph-arrows-clockwise" />
                  <span>{{ eur(a.importo) }} il {{ a.giorno }} di ogni mese<template v-if="a.fonte === 'mensili'"> · dai Risparmi mensili</template><template v-if="a.inPausa"> · in pausa</template></span>
                </div>
                <button type="button" @click="foglioMov.apri({ tipo: 'salvadanaio', verso: cartella.id, ricorrente: true })" class="mt-1 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-fg-accento underline-offset-[3px] hover:underline">
                  <i class="ph-bold ph-plus" />Versa ogni mese in automatico
                </button>
              </div>
            </aside>
          </div>
        </template>
      </section>
    </template>

    <!-- Nuovo salvadanaio -->
    <Dialog v-model:visible="nuovo.aperto" modal :showHeader="false" :pt="{ root: { class: 'w-[min(480px,calc(100%-32px))] rounded-[28px]! border-0! bg-card!' }, content: { class: 'p-6! sm:p-8!' } }">
      <h2 class="mb-6 text-[26px] font-medium tracking-[-0.035em]">Nuovo salvadanaio</h2>
      <form class="flex flex-col gap-5" @submit.prevent="crea">
        <div class="flex items-center gap-3 rounded-[20px] p-4 text-inchiostro transition-colors" :style="{ background: coloreVar(nuovo.colore) }">
          <span class="grid h-11 w-11 place-items-center rounded-full bg-inchiostro-velo text-2xl"><Emoji :e="nuovo.emoji" /></span>
          <b class="truncate font-semibold">{{ nuovo.nome.trim() || "Nuovo salvadanaio" }}</b>
        </div>
        <div>
          <label class="etichetta" for="s-nome">Nome</label>
          <input id="s-nome" v-model="nuovo.nome" maxlength="40" placeholder="Es. Macchina nuova" autocomplete="off" class="campo rounded-full!" />
        </div>
        <div>
          <span id="s-emo" class="etichetta">Icona</span>
          <div class="grid grid-cols-6 gap-1.5 sm:grid-cols-8" role="radiogroup" aria-labelledby="s-emo">
            <button
              v-for="e in EMOJI"
              :key="e"
              type="button"
              role="radio"
              :aria-checked="nuovo.emoji === e"
              class="grid aspect-square place-items-center rounded-xl bg-campo text-2xl hover:bg-bordo"
              :class="{ 'shadow-[inset_0_0_0_2px_var(--color-testo)]': nuovo.emoji === e }"
              @click="nuovo.emoji = e"
            >
              <Emoji :e="e" />
            </button>
          </div>
        </div>
        <div>
          <span id="s-col" class="etichetta">Colore</span>
          <div class="flex gap-2.5" role="radiogroup" aria-labelledby="s-col">
            <button
              v-for="c in COLORI"
              :key="c"
              type="button"
              role="radio"
              :aria-checked="nuovo.colore === c"
              :aria-label="c"
              class="h-9 w-9 rounded-full"
              :class="{ 'ring-2 ring-testo ring-offset-[3px] ring-offset-card': nuovo.colore === c }"
              :style="{ background: coloreVar(c) }"
              @click="nuovo.colore = c"
            />
          </div>
        </div>
        <div>
          <label class="etichetta" for="s-ob">Obiettivo · facoltativo</label>
          <input id="s-ob" v-model="nuovo.obiettivo" inputmode="decimal" placeholder="Es. 8.000" autocomplete="off" class="campo rounded-full!" />
        </div>
        <div class="mt-2 flex justify-end gap-2">
          <button type="button" class="pill-btn pill-btn--ghost h-12!" @click="nuovo.aperto = false">Annulla</button>
          <button type="submit" class="pill-btn pill-btn--cream h-12!" :disabled="occupato">Crea salvadanaio</button>
        </div>
      </form>
    </Dialog>
  </div>
</template>
