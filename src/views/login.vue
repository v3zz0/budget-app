<script setup>
import { useRouter } from "vue-router";
import { useToast } from "primevue/usetoast";
import { zodResolver } from "@primevue/forms/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/stores/auth.js";
import { erroreLeggibile } from "@/services/api.js";

const router = useRouter();
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
    router.push("/");
  } catch (e) {
    // Strapi risponde 400 a credenziali sbagliate
    errore(e.response?.status === 400 ? "Email o password sbagliata" : erroreLeggibile(e));
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-6 py-12">
    <div class="flex w-full max-w-sm flex-col items-center gap-8 rounded-2xl border border-bordo bg-card px-8 py-10">
      <div class="flex flex-col items-center gap-3">
        <img src="/logo.svg" alt="Budget App" class="h-16 w-16" />
        <h1 class="text-3xl font-bold text-testo">Benvenuto</h1>
      </div>
      <Form :initialValues="{ email: '', password: '' }" :resolver="resolver" class="flex w-full flex-col gap-4" @submit="entra">
        <IconField>
          <InputIcon class="pi pi-user" />
          <InputText name="email" type="email" autocomplete="username" placeholder="Email" fluid />
        </IconField>
        <IconField>
          <InputIcon class="pi pi-lock" />
          <InputText name="password" type="password" autocomplete="current-password" placeholder="Password" fluid />
        </IconField>
        <Button type="submit" label="Entra" fluid />
      </Form>
    </div>
  </div>
</template>
