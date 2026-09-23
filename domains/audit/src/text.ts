/** True when the string contains a C0 or C1 control character (U+0000–U+001F, U+007F–U+009F). */
export function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/** Length in Unicode code points, so an astral character counts once. */
export function codePointLength(value: string): number {
  let length = 0;
  for (const _character of value) length += 1;
  return length;
}

/** UTF-8 encoded length of a well-formed string (JSON.stringify output never has lone surrogates). */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}
