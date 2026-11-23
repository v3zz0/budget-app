<script setup>
import { useRoute, useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import { zodResolver } from "@primevue/forms/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/stores/auth.js";
import { erroreLeggibile } from "@/services/api.js";
import { ritornoNotifica } from "@/utils/ritorno-notifica.js";

const router = useRouter();
const route = useRoute();
const toast = useToast();
const auth = useAuthStore();

const resolver = zodResolver(
  z.object({
    email: z.string().min(1, "Inserisci l'email.").email("Email non valida."),
    password: z.string().min(1, "Inserisci la password."),
  }),
);

const errore = (detail) => toast.add({ severity: "error", summary: "Errore", detail, life: 3000 });

async function entra({ valid, values }) {
  if (!valid) return errore("Riempi tutti i campi");
  try {
    await auth.login({ identifier: values.email, password: values.password });
    router.replace(ritornoNotifica(route.query.ritorno));
  } catch (e) {
    // Strapi risponde 400 a credenziali sbagliate
    errore(e.response?.status === 400 ? "Email o password sbagliata" : erroreLeggibile(e));
  }
}
</script>

<template>
  <div class="flex min-h-[80dvh] items-center justify-center">
    <div class="panel flex w-full max-w-sm flex-col gap-8">
      <div>
        <img src="/logo.svg" alt="" class="mb-6 h-12 w-12" />
        <div class="eyebrow">Budget</div>
        <h1 class="text-[40px] leading-none font-medium tracking-[-0.045em]">Bentornato</h1>
      </div>
      <Form :initialValues="{ email: '', password: '' }" :resolver="resolver" class="flex w-full flex-col gap-4" @submit="entra">
        <div>
          <label class="etichetta" for="email">Email</label>
          <InputText id="email" name="email" type="email" autocomplete="username" fluid class="h-[52px]" />
        </div>
        <div>
          <label class="etichetta" for="password">Password</label>
          <InputText id="password" name="password" type="password" autocomplete="current-password" fluid class="h-[52px]" />
        </div>
        <button type="submit" class="pill-btn pill-btn--cream mt-2 w-full">Entra</button>
      </Form>
    </div>
  </div>
</template>
