/** Fa scaricare al browser un file generato in locale. */
export function scaricaFile(nome, contenuto, tipo = "text/csv;charset=utf-8;") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([contenuto], { type: tipo }));
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}
