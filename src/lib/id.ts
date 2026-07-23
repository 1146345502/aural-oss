const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const MAX_UNBIASED_BYTE =
  Math.floor(256 / ALPHABET.length) * ALPHABET.length;

export function nanoid(size = 21): string {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new RangeError("ID size must be a non-negative safe integer");
  }

  let id = "";

  while (id.length < size) {
    const remaining = size - id.length;
    const bytes = crypto.getRandomValues(
      new Uint8Array(Math.ceil((remaining * 256) / MAX_UNBIASED_BYTE)),
    );

    for (let index = 0; index < bytes.length; index++) {
      const byte = bytes[index];
      if (byte >= MAX_UNBIASED_BYTE) continue;
      id += ALPHABET[byte % ALPHABET.length];
      if (id.length === size) break;
    }
  }

  return id;
}
