import "./assets/main.css";
import "primeicons/primeicons.css";

import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import ToastService from "primevue/toastservice";
import ConfirmationService from "primevue/confirmationservice";
import Ripple from "primevue/ripple";

import App from "./App.vue";
import { router } from "./router/index.js";
import { budgetTheme } from "./theme.js";
import { api, impostaSessioneScaduta } from "./services/api.js";
import { useAuthStore } from "./stores/auth.js";
import PageTitle from "./components/title.vue";

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
    options: { darkModeSelector: ".app-dark" }, // <html class="app-dark">
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
app.component("PageTitle", PageTitle);

Object.entries({
  Button, Form, IconField, InputIcon, InputText, InputNumber, Toast, ConfirmDialog,
  Toolbar, Select, DataTable, Column, Skeleton, DatePicker, Chart, ToggleSwitch,
  Card, ProgressBar, Dialog,
}).forEach(([nome, componente]) => app.component(nome, componente));

// Le viste ancora da riscrivere (risparmio, impostazioni) usano this.$http.
app.config.globalProperties.$http = api;

// 401 dal server: chiude la sessione e porta al login.
impostaSessioneScaduta(() => {
  useAuthStore().logout();
  router.push("/login");
});

app.mount("#app");
