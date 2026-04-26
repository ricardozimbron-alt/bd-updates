/**
 * Compute a small line-level diff between two strings. Output is an array of
 * { op: "equal" | "add" | "remove", text: string }. Algorithm: LCS table.
 * Sufficient for short email bodies; we won't be diffing megabytes here.
 */
export type DiffOp = { op: 'equal' | 'add' | 'remove'; text: string };

export function lineDiff(a: string, b: string): DiffOp[] {
  const A = a.split('\n');
  const B = b.split('\n');
  const m = A.length;
  const n = B.length;

  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (A[i] === B[j]) lcs[i]![j] = (lcs[i + 1]?.[j + 1] ?? 0) + 1;
      else lcs[i]![j] = Math.max(lcs[i + 1]?.[j] ?? 0, lcs[i]?.[j + 1] ?? 0);
    }
  }

  const out: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) {
      out.push({ op: 'equal', text: A[i]! });
      i++;
      j++;
    } else if ((lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0)) {
      out.push({ op: 'remove', text: A[i]! });
      i++;
    } else {
      out.push({ op: 'add', text: B[j]! });
      j++;
    }
  }
  while (i < m) {
    out.push({ op: 'remove', text: A[i++]! });
  }
  while (j < n) {
    out.push({ op: 'add', text: B[j++]! });
  }
  return out;
}
