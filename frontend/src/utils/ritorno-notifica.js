export function ritornoNotifica(url) {
  return typeof url === "string" && /^\/(ricorrenti)?\?/.test(url) ? url : "/";
}

export function accessoRichiesto(to) {
  const ritorno = ritornoNotifica(to.fullPath);
  return { name: "Login", query: ritorno === "/" ? {} : { ritorno } };
}
