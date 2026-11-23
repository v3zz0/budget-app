<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useToast } from "primevue/usetoast";
import { useAuthStore } from "@/stores/auth.js";
import { aggiornaProfilo, cambiaPassword, caricaFoto, rimuoviFoto } from "@/services/impostazioni.js";
import { erroreLeggibile } from "@/services/api.js";
import { emailValida, errorePassword, forzaPassword } from "@/utils/impostazioni.js";
import { COLORI_AVATAR, persona } from "@/utils/persone.js";
import { riduciFoto } from "@/utils/immagine.js";
import Avatar from "@/components/Avatar.vue";

const toast = useToast();
const auth = useAuthStore();
const avviso = (severity, summary, detail) => toast.add({ severity, summary, detail, life: 3500 });

// ── Foto e nome: bozza con anteprima dal vivo, si salva con "Salva profilo" ──
const bozza = reactive({ nome: "", colore: "nebbia", foto: null, file: null, tolta: false });
const erroreFoto = ref("");
const sopra = ref(false); // trascinamento in corso sull'avatar
const salvandoProfilo = ref(false);
const inputFile = ref(null);

function daUtente() {
  const u = auth.userInfo;
  Object.assign(bozza, {
    nome: u.nomeVisualizzato || u.username || "",
    colore: COLORI_AVATAR.includes(u.coloreAvatar) ? u.coloreAvatar : "nebbia",
    foto: u.avatar || null,
    file: null,
    tolta: false,
  });
}
const anteprima = computed(() => persona({ nomeVisualizzato: bozza.nome || "?", avatar: bozza.foto, coloreAvatar: bozza.colore }));
const nomeCorto = computed(() => bozza.nome.trim().length < 2);
const modificato = computed(() => {
  const u = auth.userInfo;
  return (
    !!bozza.file ||
    bozza.tolta ||
    bozza.nome.trim() !== (u.nomeVisualizzato || u.username || "") ||
    bozza.colore !== (u.coloreAvatar || "nebbia")
  );
});

const TIPI = ["image/jpeg", "image/png", "image/webp"];
async function scegliFoto(file) {
  erroreFoto.value = "";
  if (!file) return;
  if (!TIPI.includes(file.type)) return (erroreFoto.value = "Formato non supportato: usa JPG, PNG o WEBP");
  if (file.size > 10 * 1024 * 1024) return (erroreFoto.value = "La foto supera i 10 MB");
  // Ridotta nel browser solo per mandare un file leggero: il ritaglio vero lo fa il server.
  const leggero = await riduciFoto(file, 800);
  if (bozza.foto?.startsWith("blob:")) URL.revokeObjectURL(bozza.foto);
  Object.assign(bozza, { file: leggero, foto: URL.createObjectURL(leggero), tolta: false });
}
function togliFoto() {
  if (bozza.foto?.startsWith("blob:")) URL.revokeObjectURL(bozza.foto);
  Object.assign(bozza, { foto: null, file: null, tolta: true });
}
function rilascia(e) {
  sopra.value = false;
  scegliFoto(e.dataTransfer?.files?.[0]);
}

async function salvaProfilo() {
  if (nomeCorto.value) return;
  salvandoProfilo.value = true;
  try {
    if (bozza.file) await caricaFoto(bozza.file);
    else if (bozza.tolta) await rimuoviFoto();
    await aggiornaProfilo(auth.userInfo.id, { nomeVisualizzato: bozza.nome.trim(), coloreAvatar: bozza.colore });
    await auth.fetchUserInfo();
    daUtente();
    avviso("success", "Profilo salvato");
  } catch (e) {
    avviso("error", "Profilo non salvato", erroreLeggibile(e));
  } finally {
    salvandoProfilo.value = false;
  }
}

// ── Dati di accesso ──────────────────────────────────────────────────────────
const account = reactive({ nome: "", email: "" });
const tentatoAccount = ref(false);
const erroreNome = computed(() => tentatoAccount.value && account.nome.trim().length < 3);
const erroreEmail = computed(() => tentatoAccount.value && !emailValida(account.email.trim()));
const salvandoAccount = ref(false);

async function salvaAccount() {
  tentatoAccount.value = true;
  if (erroreNome.value || erroreEmail.value) return;
  salvandoAccount.value = true;
  try {
    await aggiornaProfilo(auth.userInfo.id, { username: account.nome.trim(), email: account.email.trim() });
    await auth.fetchUserInfo();
    tentatoAccount.value = false;
    avviso("success", "Dati account aggiornati");
  } catch (e) {
    // Strapi risponde 400 col motivo (email già usata, formato non valido…)
    avviso("error", "Dati non aggiornati", erroreLeggibile(e));
  } finally {
    salvandoAccount.value = false;
  }
}

// ── Password ─────────────────────────────────────────────────────────────────
const password = reactive({ attuale: "", nuova: "" });
const mostra = ref(false);
const errorePwd = ref("");
const salvandoPassword = ref(false);
const forza = computed(() => forzaPassword(password.nuova));

async function salvaPassword() {
  errorePwd.value = errorePassword(password.attuale, password.nuova) || "";
  if (errorePwd.value) return;
  salvandoPassword.value = true;
  try {
    await cambiaPassword(password.attuale, password.nuova);
    password.attuale = password.nuova = "";
    avviso("success", "Password aggiornata");
  } catch (e) {
    errorePwd.value = e.response?.status === 400 ? "La password attuale non è corretta" : erroreLeggibile(e);
  } finally {
    salvandoPassword.value = false;
  }
}

onMounted(async () => {
  daUtente();
  account.nome = auth.userInfo.username ?? "";
  account.email = auth.userInfo.email ?? "";
  // Dati freschi dal server: userInfo in localStorage può essere vecchio.
  try {
    await auth.fetchUserInfo();
    if (!modificato.value) daUtente();
    account.nome = auth.userInfo.username ?? "";
    account.email = auth.userInfo.email ?? "";
  } catch (e) {
    avviso("error", "Errore", erroreLeggibile(e));
  }
});
onBeforeUnmount(() => bozza.foto?.startsWith("blob:") && URL.revokeObjectURL(bozza.foto));
</script>

<template>
  <section class="panel reveal">
    <h2 class="sr-only">Foto e nome</h2>
    <div class="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
      <div
        class="relative h-28 w-28 flex-none cursor-pointer rounded-full outline-offset-4"
        tabindex="0"
        role="button"
        aria-label="Cambia la foto profilo"
        title="Trascina qui una foto o fai clic"
        @click="inputFile.click()"
        @keydown.enter.prevent="inputFile.click()"
        @keydown.space.prevent="inputFile.click()"
        @dragover.prevent="sopra = true"
        @dragleave="sopra = false"
        @drop.prevent="rilascia"
      >
        <Avatar :p="anteprima" :size="112" class="ring-4 ring-card" />
        <span
          class="absolute -right-0.5 -bottom-0.5 grid h-[38px] w-[38px] place-items-center rounded-full bg-crema text-[17px] text-inchiostro ring-4 ring-card"
          aria-hidden="true"
        >
          <i class="ph-bold ph-camera" />
        </span>
        <span
          v-if="sopra"
          class="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-inchiostro/80 text-xs font-medium text-su-inchiostro ring-2 ring-anello"
          aria-hidden="true"
        >
          <i class="ph-bold ph-image text-2xl" />Rilascia la foto
        </span>
      </div>
      <div class="min-w-0">
        <b class="block text-[26px] leading-tight font-medium tracking-[-0.04em] break-words sm:text-[30px]">
          {{ bozza.nome.trim() || "Senza nome" }}
        </b>
        <small class="mt-1 block text-sm text-testo2">@{{ auth.userInfo.username }} · {{ auth.userInfo.email }}</small>
        <div class="mt-5 flex flex-wrap gap-2">
          <button type="button" class="pill-btn pill-btn--cream h-11! px-5!" @click="inputFile.click()">
            <i class="ph-bold ph-upload-simple" />Carica foto
          </button>
          <button v-if="bozza.foto" type="button" class="pill-btn pill-btn--ghost h-11! px-5!" @click="togliFoto">
            <i class="ph-bold ph-trash" />Rimuovi
          </button>
        </div>
        <p class="mt-2 text-[12.5px] text-testo2">JPG, PNG o WEBP fino a 10 MB. La ritagliamo quadrata, al centro.</p>
        <p v-if="erroreFoto" class="errore-campo flex items-center gap-1.5"><i class="ph-bold ph-warning-circle" />{{ erroreFoto }}</p>
        <input
          ref="inputFile"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          class="sr-only"
          tabindex="-1"
          @change="scegliFoto($event.target.files[0]); $event.target.value = ''"
        />
      </div>
    </div>

    <div class="mt-8 grid gap-5 border-t border-bordo pt-8 md:grid-cols-2">
      <div>
        <label class="etichetta flex justify-between" for="p-nome">
          Nome visualizzato <small class="font-normal text-testo2">così ti vedono gli altri</small>
        </label>
        <input id="p-nome" v-model="bozza.nome" class="campo rounded-full!" maxlength="30" autocomplete="name" placeholder="Es. Thomas" />
        <p v-if="nomeCorto" class="errore-campo flex items-center gap-1.5"><i class="ph-bold ph-warning-circle" />Scrivi almeno 2 caratteri</p>
      </div>
      <div>
        <span id="p-col" class="etichetta flex justify-between">Colore dell'avatar <small class="font-normal text-testo2">quando non c'è la foto</small></span>
        <div class="flex min-h-[52px] flex-wrap items-center gap-2.5" :class="{ 'opacity-45': bozza.foto }" role="radiogroup" aria-labelledby="p-col">
          <button
            v-for="c in COLORI_AVATAR"
            :key="c"
            type="button"
            role="radio"
            :aria-checked="bozza.colore === c"
            :aria-label="c"
            class="h-9 w-9 rounded-full"
            :class="{ 'ring-2 ring-testo ring-offset-[3px] ring-offset-card': bozza.colore === c }"
            :style="{ background: `var(--color-av-${c})` }"
            @click="bozza.colore = c"
          />
        </div>
      </div>
    </div>
    <div class="mt-6 flex flex-col-reverse items-stretch justify-between gap-2 sm:flex-row sm:items-center">
      <span class="text-[12.5px] text-testo2">{{ modificato ? "Modifiche non salvate" : "" }}</span>
      <div class="flex justify-end gap-2">
        <button v-if="modificato" type="button" class="pill-btn pill-btn--ghost h-11! px-5!" @click="daUtente">Annulla</button>
        <button type="button" class="pill-btn pill-btn--cream h-11! px-5!" :disabled="salvandoProfilo || nomeCorto || !modificato" @click="salvaProfilo">
          {{ salvandoProfilo ? "Salvo…" : "Salva profilo" }}
        </button>
      </div>
    </div>
  </section>

  <section class="panel">
    <h2 class="mb-5 text-[17px] font-semibold tracking-[-0.015em]">Dati di accesso</h2>
    <form novalidate @submit.prevent="salvaAccount">
      <div class="grid gap-5 md:grid-cols-2">
        <div>
          <label class="etichetta flex justify-between" for="u-nome">Nome utente <small class="font-normal text-testo2">per accedere · almeno 3 caratteri</small></label>
          <input id="u-nome" v-model="account.nome" class="campo rounded-full!" autocomplete="username" />
          <p v-if="erroreNome" class="errore-campo flex items-center gap-1.5"><i class="ph-bold ph-warning-circle" />Il nome utente deve avere almeno 3 caratteri</p>
        </div>
        <div>
          <label class="etichetta" for="u-mail">Email</label>
          <input id="u-mail" v-model="account.email" class="campo rounded-full!" type="email" autocomplete="email" />
          <p v-if="erroreEmail" class="errore-campo flex items-center gap-1.5"><i class="ph-bold ph-warning-circle" />Indirizzo email non valido</p>
        </div>
      </div>
      <div class="mt-6 flex justify-end">
        <button class="pill-btn pill-btn--cream h-12!" type="submit" :disabled="salvandoAccount">Salva dati account</button>
      </div>
    </form>
  </section>

  <section class="panel">
    <h2 class="mb-5 text-[17px] font-semibold tracking-[-0.015em]">Password</h2>
    <form novalidate @submit.prevent="salvaPassword">
      <div class="grid gap-5 md:grid-cols-2">
        <div>
          <label class="etichetta" for="pw-old">Password attuale</label>
          <input id="pw-old" v-model="password.attuale" class="campo rounded-full!" :type="mostra ? 'text' : 'password'" autocomplete="current-password" />
        </div>
        <div>
          <label class="etichetta flex justify-between" for="pw-new">Nuova password <small class="font-normal text-testo2">almeno 6 caratteri</small></label>
          <div class="relative">
            <input id="pw-new" v-model="password.nuova" class="campo rounded-full! pr-14" :type="mostra ? 'text' : 'password'" autocomplete="new-password" />
            <button
              type="button"
              class="absolute top-1/2 right-2 grid h-[38px] w-[38px] -translate-y-1/2 place-items-center rounded-full text-testo2 hover:bg-card hover:text-testo"
              :aria-label="mostra ? 'Nascondi le password' : 'Mostra le password'"
              @click="mostra = !mostra"
            >
              <i class="ph-bold" :class="mostra ? 'ph-eye-slash' : 'ph-eye'" />
            </button>
          </div>
          <div class="mt-2.5 flex gap-1" aria-hidden="true">
            <span
              v-for="i in 3"
              :key="i"
              class="h-1 flex-1 rounded-sm"
              :class="i > forza ? 'bg-bordo' : forza === 1 ? 'bg-arancio' : forza === 2 ? 'bg-crema' : 'bg-salvia'"
            />
          </div>
        </div>
      </div>
      <p v-if="errorePwd" class="errore-campo flex items-center gap-1.5"><i class="ph-bold ph-warning-circle" />{{ errorePwd }}</p>
      <div class="mt-6 flex justify-end">
        <button class="pill-btn pill-btn--cream h-12!" type="submit" :disabled="salvandoPassword">Cambia password</button>
      </div>
    </form>
  </section>
</template>
