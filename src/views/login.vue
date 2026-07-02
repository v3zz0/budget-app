<template>
  <div
    class="min-h-screen px-6 py-20 md:px-20 lg:px-100 flex items-center justify-center backdrop-blur-3xl bg-cover! bg-center! bg-no-repeat!"
    :style="{ backgroundImage: `url(${bgImage})` }"
  >
    <div
      class="px-8 md:px-12 lg:px-15 py-12 flex flex-col items-center gap-12 w-full backdrop-blur-2xl rounded-2xl bg-white/10 border border-white/10 max-w-sm"
    >
      <div class="flex flex-col items-center gap-4 w-full">
        <img src="/logo.svg" alt="Budget App" class="h-20 w-20" />

        <div class="flex flex-col gap-2 w-full">
          <div
            class="text-center text-3xl font-medium text-white leading-tight"
          >
            Benvenuto
          </div>
        </div>
      </div>
      <Form
        v-slot="$form"
        :initialValues="initialValues"
        :resolver="resolver"
        @submit="login"
      >
        <div class="flex flex-col items-center gap-8 w-full">
          <div class="flex flex-col gap-6 w-full">
            <IconField>
              <InputIcon class="pi pi-user text-white/70!" />
              <InputText
                name="email"
                type="text"
                class="appearance-none! border! border-white/10! w-full! outline-0! bg-white/10! text-white! placeholder:text-white/70! rounded-3xl! shadow-sm!"
                placeholder="Utente"
              />
            </IconField>
            <IconField>
              <InputIcon class="pi pi-lock text-white/70!" />
              <InputText
                name="password"
                type="password"
                class="appearance-none! border! border-white/10! w-full! outline-0! bg-white/10! text-white! placeholder:text-white/70! rounded-3xl! shadow-sm!"
                placeholder="Password"
              />
            </IconField>
          </div>
          <Button
            type="submit"
            label="Entra"
            class="w-full! rounded-3xl! bg-surface-950! border! border-surface-950! text-white! hover:bg-surface-950/80!"
          />
        </div>
      </Form>
    </div>
  </div>
</template>
<script>
import { zodResolver } from "@primevue/forms/resolvers/zod";
import { z } from "zod";
import bgImage from "@/assets/hex-textured-background-networking.jpg";

export default {
  name: "Login",
  props: {
    loggedIn: Boolean,
  },

  data() {
    return {
      bgImage,
      initialValues: {
        email: "",
        password: "",
      },
      resolver: zodResolver(
        z.object({
          email: z
            .string()
            .min(1, { message: "Email is required." })
            .email({ message: "Valid Email required" }),
          password: z.string().min(1, { message: "Password is required." }),
        }),
      ),
    };
  },
  methods: {
    login(e) {
      if (!e.valid) {
        this.$toast.add({
          severity: "error",
          summary: "Error",
          detail: "Riempi tutti i campi",
          life: 3000,
        });
        return;
      }

      this.$useAuthStore()
        .login({ identifier: e.values.email, password: e.values.password })
        .then(() => {
          this.$router.push("/");
        })
        .catch((err) => {
          console.error("Email o password sbagliata");
          this.$toast.add({
            severity: "error",
            summary: "Error",
            detail: "Email o password sbagliata",
            life: 3000,
          });
        });
    },
  },
};
</script>
