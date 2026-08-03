import { formatPeriodLabel } from "./periodFilterUtils";
import type { MatrixEntity } from "./featuredMatrixUtils";

export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  metaLines?: string[],
): void {
  const lines: string[] = [];
  if (metaLines?.length) {
    for (const line of metaLines) lines.push(escapeCsvCell(line));
    lines.push("");
  }
  lines.push(headers.map(escapeCsvCell).join(","));
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  }

  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function reportFilename(
  base: string,
  selectedYears: number[],
  selectedMonths?: number[],
): string {
  const period = formatPeriodLabel(selectedYears, selectedMonths)
    .replace(/[·–]/g, "-")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `${base}_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
}

export function buildMatrixCsvPayload(opts: {
  rowLabel: string;
  rows: MatrixEntity[];
  cols: MatrixEntity[];
  matrix: Map<string, Map<string, number>>;
  /** Optional nested product rows under each parent group row. */
  childrenByRow?: Map<string, { id: string; name: string }[]>;
}): { headers: string[]; rows: Array<Array<string | number>> } {
  const headers = [opts.rowLabel, ...opts.cols.map((c) => c.name), "Total"];
  const out: Array<Array<string | number>> = [];

  for (const row of opts.rows) {
    const cells = opts.cols.map((c) => opts.matrix.get(row.id)?.get(c.id) ?? 0);
    const total = cells.reduce((a, b) => a + b, 0);
    out.push([row.name, ...cells, total]);

    const children = opts.childrenByRow?.get(row.id);
    if (!children?.length) continue;
    for (const child of children) {
      const childCells = opts.cols.map(
        (c) => opts.matrix.get(child.id)?.get(c.id) ?? 0,
      );
      const childTotal = childCells.reduce((a, b) => a + b, 0);
      out.push([`  ${child.name}`, ...childCells, childTotal]);
    }
  }

  const colTotals = opts.cols.map((c) => {
    let sum = 0;
    for (const row of opts.rows) {
      sum += opts.matrix.get(row.id)?.get(c.id) ?? 0;
    }
    return sum;
  });
  out.push(["Total", ...colTotals, colTotals.reduce((a, b) => a + b, 0)]);

  return { headers, rows: out };
}
