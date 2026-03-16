const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function nanoid(size = 21): string {
  let id = "";
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  for (let i = 0; i < size; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return id;
}
