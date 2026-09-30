import type { DirectoryItem } from "./Services/Directory.adapter";

// Tipos de elemento que se pueden renombrar y fusionar desde una lista.
export type ListKind = "operator" | "leader";

export const KIND_LABEL: Record<ListKind, string> = {
  operator: "operadores",
  leader: "guías correo",
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Error inesperado";
}

// ─── DETECCIÓN DE POSIBLES DUPLICADOS ───────────────────────────────────────
// Solo es una pista visual: la decisión de fusionar siempre es de la
// coordinadora. Dos nombres se marcan como parecidos si, sin tildes,
// mayúsculas ni signos, son iguales, uno empieza por el otro
// ("walkingt" / "walkingtour" / "walkingtours", "franci" / "francini") o
// se diferencian en un par de letras (erratas como "frnaci").
function normKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = tmp;
    }
  }
  return prev[b.length];
}

function looksSimilar(a: string, b: string): boolean {
  const x = normKey(a);
  const y = normKey(b);
  if (!x || !y) return false;
  if (x === y) return true;

  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 4 && long.startsWith(short)) return true;
  if (short.length >= 4 && editDistance(x, y) <= 2) return true;
  return false;
}

// Ids de los elementos que tienen al menos otro de nombre parecido.
export function findSimilarIds(items: DirectoryItem[]): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (looksSimilar(items[i].name, items[j].name)) {
        ids.add(items[i].id);
        ids.add(items[j].id);
      }
    }
  }
  return ids;
}