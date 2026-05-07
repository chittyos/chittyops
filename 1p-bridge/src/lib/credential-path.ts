export interface CredentialPath {
  vault: string;
  item: string;
  field: string;
}

export function parseCredentialPath(raw: string): CredentialPath {
  if (!raw) throw new Error("credential path is empty");
  const segments = raw.split("/");
  if (segments.length < 2 || segments.length > 3) {
    throw new Error(
      `invalid path format: expected vault/item or vault/item/field, got '${raw}'`,
    );
  }
  for (const seg of segments) {
    if (!seg.trim()) throw new Error(`empty segment in path '${raw}'`);
  }
  return {
    vault: segments[0]!,
    item: segments[1]!,
    field: segments[2] ?? "credential",
  };
}
