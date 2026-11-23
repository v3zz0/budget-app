import "./assets/main.css";
import "primeicons/primeicons.css";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@phosphor-icons/web/bold";

import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import ToastService from "primevue/toastservice";
import ConfirmationService from "primevue/confirmationservice";
import Ripple from "primevue/ripple";

import App from "./App.vue";
import { router } from "./router/index.js";
import { accessoRichiesto } from "./utils/ritorno-notifica.js";
import { budgetTheme } from "./theme.js";
import { impostaSessioneScaduta } from "./services/api.js";
import { useAuthStore } from "./stores/auth.js";
import Indietro from "./components/Indietro.vue";
import Emoji from "./components/Emoji.vue";
import Euro from "./components/Euro.vue";
import { avviaTema } from "./tema.js";

// Componenti PrimeVue registrati globalmente (le viste non li importano)
import Button from "primevue/button";
import { Form } from "@primevue/forms";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import Toast from "primevue/toast";
import ConfirmDialog from "primevue/confirmdialog";
import Toolbar from "primevue/toolbar";
import Select from "primevue/select";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Skeleton from "primevue/skeleton";
import DatePicker from "primevue/datepicker";
import Chart from "primevue/chart";
import ToggleSwitch from "primevue/toggleswitch";
import Card from "primevue/card";
import ProgressBar from "primevue/progressbar";
import Dialog from "primevue/dialog";

const app = createApp(App);
app.use(createPinia());
app.use(router);

app.use(PrimeVue, {
  ripple: true,
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
app.directive("ripple", Ripple);
app.component("Indietro", Indietro);
app.component("Emoji", Emoji);
app.component("Euro", Euro);
avviaTema();

Object.entries({
  Button, Form, IconField, InputIcon, InputText, InputNumber, Toast, ConfirmDialog,
  Toolbar, Select, DataTable, Column, Skeleton, DatePicker, Chart, ToggleSwitch,
  Card, ProgressBar, Dialog,
}).forEach(([nome, componente]) => app.component(nome, componente));

// 401 dal server: chiude la sessione e porta al login.
impostaSessioneScaduta(() => {
  useAuthStore().logout();
  if (router.currentRoute.value.name !== "Login") router.push(accessoRichiesto(router.currentRoute.value));
});

app.mount("#app");
