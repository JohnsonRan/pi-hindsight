export function validateCreationId(id: string, kind: "Bank" | "Mental model"): void {
  if (!id) throw new Error(`${kind} id must not be empty`);
  if (Buffer.byteLength(id, "utf8") > 192) {
    throw new Error(`${kind} id must be at most 192 bytes of UTF-8`);
  }
  if (/\p{Cc}/u.test(id)) throw new Error(`${kind} id must not contain control characters`);
  if (id.includes("/")) throw new Error(`${kind} id must not contain '/'`);
  if (kind === "Bank" && id.startsWith("_")) {
    throw new Error("Bank id must not start with '_'");
  }
}

export function validatePageMaxTokens(maxTokens: number | undefined): void {
  if (
    maxTokens !== undefined &&
    (!Number.isInteger(maxTokens) || maxTokens < 256 || maxTokens > 8192)
  ) {
    throw new Error("maxTokens must be an integer between 256 and 8192");
  }
}
