const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT_RE = /^[a-z0-9]{1,10}$/;

export const CLIENT_OBJECT_PREFIX = "clients";

export function buildClientObjectPath(clientId: string, fileName: string): string {
  if (!UUID_RE.test(clientId)) throw new Error("clientId inválido");
  if (fileName.includes("/") || fileName.includes(".."))
    throw new Error("nome de arquivo inválido");
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (!fileName.includes(".") || !EXT_RE.test(ext)) throw new Error("extensão inválida");
  return `${CLIENT_OBJECT_PREFIX}/${clientId}/${crypto.randomUUID()}.${ext}`;
}

export function parseClientObjectPath(
  path: string,
): { clientId: string; objectId: string; ext: string } | null {
  const parts = path.split("/");
  if (parts.length !== 3 || parts[0] !== CLIENT_OBJECT_PREFIX) return null;
  const [, clientId, file] = parts;
  if (!clientId || !file) return null;
  const ext = (file.split(".").pop() ?? "").toLowerCase();
  const objectId = file.slice(0, file.length - ext.length - 1);
  if (!UUID_RE.test(clientId) || !UUID_RE.test(objectId) || !EXT_RE.test(ext)) return null;
  return { clientId, objectId, ext };
}
