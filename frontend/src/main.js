import "./assets/main.css";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@phosphor-icons/web/bold";

import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import ToastService from "primevue/toastservice";
import ConfirmationService from "primevue/confirmationservice";

import App from "./App.vue";
import { router } from "./router/index.js";
import { accessoRichiesto } from "./utils/ritorno-notifica.js";
import { budgetTheme } from "./theme.js";
import { impostaSessioneScaduta } from "./services/api.js";
import { useAuthStore } from "./stores/auth.js";
import Emoji from "./components/Emoji.vue";
import Euro from "./components/Euro.vue";
import { avviaTema } from "./tema.js";

// Componenti PrimeVue registrati globalmente (le viste non li importano)
import { Form } from "@primevue/forms";
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import Toast from "primevue/toast";
import ConfirmDialog from "primevue/confirmdialog";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Chart from "primevue/chart";
import Dialog from "primevue/dialog";

const app = createApp(App);
app.use(createPinia());
app.use(router);

app.use(PrimeVue, {
  theme: {
    preset: budgetTheme,
    options: { darkModeSelector: "html:root" }, // sempre: vedi theme.js
  },
  locale: {
    accept: "Accetta",
    reject: "Rifiuta",
    firstDayOfWeek: 1,
    dayNames: ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"],
    dayNamesShort: ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"],
    dayNamesMin: ["Do", "Lu", "Ma", "Me", "Gi", "Ve", "Sa"],
    monthNames: [
      "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
      "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
    ],
    monthNamesShort: ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"],
    today: "Oggi",
    clear: "Cancella",
  },
});
app.use(ToastService);
app.use(ConfirmationService);
app.component("Emoji", Emoji);
app.component("Euro", Euro);
avviaTema();

Object.entries({
  Form, InputText, InputNumber, Toast, ConfirmDialog, Select, Skeleton, Chart, Dialog,
}).forEach(([nome, componente]) => app.component(nome, componente));

// 401 dal server: chiude la sessione e porta al login.
impostaSessioneScaduta(() => {
  useAuthStore().logout();
  if (router.currentRoute.value.name !== "Login") router.push(accessoRichiesto(router.currentRoute.value));
});

app.mount("#app");
