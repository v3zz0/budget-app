<script setup>
import { onMounted, reactive, ref } from "vue";
import { useToast } from "primevue/usetoast";
import { useAuthStore } from "@/stores/auth.js";
import { aggiornaProfilo, cambiaPassword } from "@/services/impostazioni.js";
import { erroreLeggibile } from "@/services/api.js";
import { errorePassword, erroreProfilo } from "@/utils/impostazioni.js";

const toast = useToast();
const auth = useAuthStore();

const account = reactive({ nome: "", email: "" });
const password = reactive({ attuale: "", nuova: "" });
const salvandoAccount = ref(false);
const salvandoPassword = ref(false);

const avviso = (severity, summary, detail) => toast.add({ severity, summary, detail, life: 4000 });

onMounted(async () => {
  // Dati freschi dal server: userInfo in localStorage può essere vecchio.
  try {
    await auth.fetchUserInfo();
  } catch (e) {
    avviso("error", "Errore", erroreLeggibile(e));
  }
  account.nome = auth.userInfo.username ?? "";
  account.email = auth.userInfo.email ?? "";
});

async function salvaAccount() {
  const errore = erroreProfilo(account);
  if (errore) return avviso("warn", errore);
  salvandoAccount.value = true;
  try {
    await aggiornaProfilo(auth.userInfo.id, { username: account.nome.trim(), email: account.email.trim() });
    await auth.fetchUserInfo();
    avviso("success", "Profilo aggiornato");
  } catch (e) {
    // Strapi risponde 400 col motivo (email già usata, formato non valido…)
    avviso("error", "Profilo non aggiornato", erroreLeggibile(e));
  } finally {
    salvandoAccount.value = false;
  }
}

async function salvaPassword() {
  const errore = errorePassword(password.attuale, password.nuova);
  if (errore) return avviso("warn", errore);
  salvandoPassword.value = true;
  try {
    await cambiaPassword(password.attuale, password.nuova);
    password.attuale = password.nuova = "";
    avviso("success", "Password aggiornata");
  } catch (e) {
    avviso("error", "Password non cambiata", erroreLeggibile(e));
  } finally {
    salvandoPassword.value = false;
  }
}
</script>

<template>
  <div class="flex max-w-lg flex-col gap-5 px-4 pt-6">
    <div>
      <Indietro />
      <h1 class="text-3xl font-bold text-testo">Profilo utente</h1>
    </div>

    <form class="flex flex-col gap-4 rounded-2xl border border-bordo bg-card p-5" @submit.prevent="salvaAccount">
      <p class="text-[11px] font-semibold uppercase tracking-[0.15em] text-testo2">Dati account</p>
      <div class="flex flex-col gap-2">
        <label for="nome" class="text-sm text-testo2">Nome utente</label>
        <InputText id="nome" v-model="account.nome" autocomplete="username" fluid />
      </div>
      <div class="flex flex-col gap-2">
        <label for="email" class="text-sm text-testo2">Email</label>
        <InputText id="email" v-model="account.email" type="email" autocomplete="email" fluid />
      </div>
      <Button type="submit" label="Salva dati account" :loading="salvandoAccount" />
    </form>

    <form class="flex flex-col gap-4 rounded-2xl border border-bordo bg-card p-5" @submit.prevent="salvaPassword">
      <p class="text-[11px] font-semibold uppercase tracking-[0.15em] text-testo2">Password</p>
      <div class="flex flex-col gap-2">
        <label for="attuale" class="text-sm text-testo2">Password attuale</label>
        <InputText id="attuale" v-model="password.attuale" type="password" autocomplete="current-password" fluid />
      </div>
      <div class="flex flex-col gap-2">
        <label for="nuova" class="text-sm text-testo2">Nuova password</label>
        <InputText id="nuova" v-model="password.nuova" type="password" autocomplete="new-password" fluid />
      </div>
      <Button type="submit" label="Cambia password" :loading="salvandoPassword" />
    </form>
  </div>
</template>
