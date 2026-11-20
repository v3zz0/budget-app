/**
 * Riduce una foto prima dell'upload: una foto da 12MP pesa 5MB e per l'OCR non
 * legge meglio di una a 2000px di larghezza. `createImageBitmap` applica anche
 * la rotazione EXIF, che i telefoni usano al posto di ruotare i pixel.
 *
 * Se il browser non sa decodificare il file (per esempio HEIC su desktop) si
 * restituisce l'originale: ci pensa il server a dire se è leggibile.
 */
export async function riduciFoto(file, larghezzaMax = 2000) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scala = Math.min(1, larghezzaMax / bmp.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scala);
    canvas.height = Math.round(bmp.height * scala);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.9));
    return blob ?? file;
  } catch {
    return file;
  }
}
