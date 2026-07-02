import "./assets/main.css";
import "./style.css";
import "primeicons/primeicons.css";

import { createApp } from "vue";
import { createPinia } from "pinia";
import { useAuthStore } from "./stores/auth.js";
import { createRouter } from "./router/index.js";
import axios from "axios";
import qs from "qs";
import App from "./App.vue";
import { useWalletStore } from "@/stores/wallet.js";
import PageTitle from "./components/title.vue";

// PrimeVue
import PrimeVue from "primevue/config";
import Aura from "@primeuix/themes/aura";
import { definePreset } from "@primeuix/themes";
import ToastService from "primevue/toastservice";
import ConfirmationService from "primevue/confirmationservice";
import Ripple from "primevue/ripple";

// Componenti PrimeVue registrati globalmente
import Button from "primevue/button";
import { Form } from "@primevue/forms";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import Toast from "primevue/toast";
import Drawer from "primevue/drawer";
import Toolbar from "primevue/toolbar";
import AutoComplete from "primevue/autocomplete";
import Select from "primevue/select";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import ColumnGroup from "primevue/columngroup"; // optional
import Row from "primevue/row"; // optional
import Skeleton from "primevue/skeleton";
import DatePicker from "primevue/datepicker";
import Chart from "primevue/chart";
import ToggleSwitch from "primevue/toggleswitch";
import Card from "primevue/card";
import ProgressBar from "primevue/progressbar";
import Tabs from "primevue/tabs";
import TabList from "primevue/tablist";
import Tab from "primevue/tab";
import TabPanels from "primevue/tabpanels";
import TabPanel from "primevue/tabpanel";
import Dialog from "primevue/dialog";

// URL API da variabile d'ambiente
const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:1337";

// Crea l'app
const app = createApp(App);

// Pinia (deve essere registrato PRIMA di usare gli store)
const pinia = createPinia();
app.use(pinia);

// Router
const router = createRouter(app);
app.use(router);

// Inizializza auth store
const authStore = useAuthStore();
authStore.initializeAuth();
app.config.globalProperties.$useAuthStore = useAuthStore;

// Configura axios
axios.defaults.baseURL = apiUrl;
axios.defaults.withCredentials = true;
axios.defaults.paramsSerializer = (params) => {
  return qs.stringify(params, {
    arrayFormat: "repeat",
    indices: false,
    allowDots: false,
    skipNulls: true,
    format: "RFC1738",
  });
};

// Interceptor: aggiunge token alle richieste (esclusi endpoint auth)
axios.interceptors.request.use((config) => {
  const isAuthEndpoint = config.url?.includes("/api/auth/");
  if (!isAuthEndpoint) {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Interceptor: gestisce errori 401 (token scaduto)
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      delete axios.defaults.headers.common["Authorization"];
      router.push("/login");
    }
    return Promise.reject(error);
  },
);

// Rendi axios accessibile globalmente
app.config.globalProperties.$http = axios;
app.config.globalProperties.$apiUrl = apiUrl;

// Tema personalizzato PrimeVue
const budgetTheme = definePreset(Aura, {
  semantic: {
    primary: {
      50: "#EFF6FF",
      100: "#DBEAFE",
      200: "#BFDBFE",
      300: "#93C5FD",
      400: "#60A5FA",
      500: "#3B82F6", // Monta l'app

      600: "#2563EB",
      700: "#1D4ED8",
      800: "#1E40AF",
      900: "#1E3A8A",
      950: "#172554",
    },
    colorScheme: {
      light: {
        primary: {
          color: "#3B82F6",
          inverseColor: "#ffffff",
          hoverColor: "#2563EB",
          activeColor: "#1D4ED8",
        },
        highlight: {
          background: "#3B82F6",
          focusBackground: "#2563EB",
          color: "#ffffff",
          focusColor: "#ffffff",
        },
      },
      dark: {
        primary: {
          color: "#60A5FA",
          inverseColor: "#172554",
          hoverColor: "#93C5FD",
          activeColor: "#BFDBFE",
        }, // Monta l'app

        highlight: {
          background: "rgba(59, 130, 246, 0.16)",
          focusBackground: "rgba(59, 130, 246, 0.24)",
          color: "rgba(255,255,255,.87)",
          focusColor: "rgba(255,255,255,.87)",
        },
      },
    },
  },
});

// Configura PrimeVue
app.use(PrimeVue, {
  ripple: true,
  theme: {
    preset: budgetTheme,
    options: {
      darkModeSelector: false || "none",
    },
  },
  locale: {
    accept: "Accetta",
    reject: "Rifiuta",
    firstDayOfWeek: 1,
    dayNames: [
      "Domenica",
      "Lunedì",
      "Martedì",
      "Mercoledì",
      "Giovedì",
      "Venerdì",
      "Sabato",
    ],
    dayNamesShort: ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"],
    dayNamesMin: ["Do", "Lu", "Ma", "Me", "Gi", "Ve", "Sa"],
    monthNames: [
      "Gennaio",
      "Febbraio",
      "Marzo",
      "Aprile",
      "Maggio",
      "Giugno",
      "Luglio",
      "Agosto",
      "Settembre",
      "Ottobre",
      "Novembre",
      "Dicembre",
    ],
    monthNamesShort: [
      "Gen",
      "Feb",
      "Mar",
      "Apr",
      "Mag",
      "Giu",
      "Lug",
      "Ago",
      "Set",
      "Ott",
      "Nov",
      "Dic",
    ],
    today: "Oggi",
    clear: "Cancella",
  },
});

app.use(ToastService);
app.use(ConfirmationService);
app.directive("ripple", Ripple);
app.component("PageTitle", PageTitle);

// Registra componenti PrimeVue globalmente
app.component("Button", Button);
app.component("Form", Form);
app.component("IconField", IconField);
app.component("InputIcon", InputIcon);
app.component("InputText", InputText);
app.component("InputNumber", InputNumber);
app.component("Toast", Toast);
app.component("Drawer", Drawer);
app.component("Toolbar", Toolbar);
app.component("AutoComplete", AutoComplete);
app.component("Select", Select);
app.component("DataTable", DataTable);
app.component("Column", Column);
app.component("ColumnGroup", ColumnGroup);
app.component("Row", Row);
app.component("Skeleton", Skeleton);
app.component("DatePicker", DatePicker);
app.component("ToggleSwitch", ToggleSwitch);
app.component("Chart", Chart);
app.component("Card", Card);
app.component("Tabs", Tabs);
app.component("TabList", TabList);
app.component("Tab", Tab);
app.component("TabPanels", TabPanels);
app.component("TabPanel", TabPanel);
app.component("ProgressBar", ProgressBar);
app.component("Dialog", Dialog);

// Monta l'app
app.mount("#app");
