/**
 * A small line-based unified diff (LCS), enough for template-sized files.
 * Used by `ossready sync` to show what an update would change. No dependencies.
 */

export interface DiffOp {
  kind: " " | "-" | "+";
  line: string;
}

/** Split on \n, dropping the empty string after a final newline. */
export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Line operations turning `a` into `b`, keeping the longest common subsequence. */
export function diffLines(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  let start = 0;
  while (start < n && start < m && a[start] === b[start]) start++;
  let endA = n;
  let endB = m;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const ops: DiffOp[] = [];
  for (let i = 0; i < start; i++) ops.push({ kind: " ", line: a[i] });

  const aa = a.slice(start, endA);
  const bb = b.slice(start, endB);
  const rows = aa.length;
  const cols = bb.length;
  const dp: Uint32Array[] = Array.from({ length: rows + 1 }, () => new Uint32Array(cols + 1));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      dp[i][j] = aa[i] === bb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (aa[i] === bb[j]) {
      ops.push({ kind: " ", line: aa[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: "-", line: aa[i] });
      i++;
    } else {
      ops.push({ kind: "+", line: bb[j] });
      j++;
    }
  }
  while (i < rows) ops.push({ kind: "-", line: aa[i++] });
  while (j < cols) ops.push({ kind: "+", line: bb[j++] });

  for (let k = endA; k < n; k++) ops.push({ kind: " ", line: a[k] });
  return ops;
}

/** Number of added and removed lines between two texts. */
export function diffStats(oldText: string, newText: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const op of diffLines(splitLines(oldText), splitLines(newText))) {
    if (op.kind === "+") added++;
    else if (op.kind === "-") removed++;
  }
  return { added, removed };
}

/** Unified diff (`--- from` / `+++ to` / `@@` hunks); empty string when the texts are equal. */
export function unifiedDiff(
  oldText: string,
  newText: string,
  fromFile: string,
  toFile: string,
  context = 3,
): string {
  if (oldText === newText) return "";
  const ops = diffLines(splitLines(oldText), splitLines(newText));
  const changed: number[] = [];
  ops.forEach((op, idx) => {
    if (op.kind !== " ") changed.push(idx);
  });
  const out = [`--- ${fromFile}`, `+++ ${toFile}`];
  if (!changed.length) {
    out.push("@@ only the final newline differs @@");
    return `${out.join("\n")}\n`;
  }

  const oldNo: number[] = [];
  const newNo: number[] = [];
  let o = 1;
  let nn = 1;
  for (const op of ops) {
    oldNo.push(o);
    newNo.push(nn);
    if (op.kind !== "+") o++;
    if (op.kind !== "-") nn++;
  }

  let h = 0;
  while (h < changed.length) {
    const first = Math.max(0, changed[h] - context);
    let last = Math.min(ops.length - 1, changed[h] + context);
    let k = h + 1;
    while (k < changed.length && changed[k] - context <= last + 1) {
      last = Math.min(ops.length - 1, changed[k] + context);
      k++;
    }
    const hunk = ops.slice(first, last + 1);
    const oldCount = hunk.filter((x) => x.kind !== "+").length;
    const newCount = hunk.filter((x) => x.kind !== "-").length;
    const oldStart = oldCount ? oldNo[first] : oldNo[first] - 1;
    const newStart = newCount ? newNo[first] : newNo[first] - 1;
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const x of hunk) out.push(`${x.kind}${x.line}`);
    h = k;
  }
  return `${out.join("\n")}\n`;
}
