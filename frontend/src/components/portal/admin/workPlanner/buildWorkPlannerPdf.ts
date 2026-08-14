import type { WorkPlanExpenseRecord, WorkPlanRecord, WorkPlanVisitRecord } from "@/store/api";

type JsPDF = InstanceType<(typeof import("jspdf"))["jsPDF"]>;

export type WorkPlansReportPdfInput = {
  companyName: string;
  logoUrl?: string;
  portalLabel: string;
  downloadedBy: string;
  generatedAt: string;
  periodFrom: string;
  periodTo: string;
  salesUserLabel: string;
  statusLabel: string;
  plans: WorkPlanRecord[];
};

export type ExpensesReportPdfInput = {
  companyName: string;
  logoUrl?: string;
  portalLabel: string;
  downloadedBy: string;
  generatedAt: string;
  periodFrom: string;
  periodTo: string;
  salesUserLabel: string;
  expenses: WorkPlanExpenseRecord[];
  totalAmount: number;
};

const NAVY: [number, number, number] = [30, 58, 95];
const SLATE: [number, number, number] = [51, 65, 85];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [203, 213, 225];
const BAND: [number, number, number] = [248, 250, 252];
const ZEBRA: [number, number, number] = [248, 250, 252];

const M = 10;
const HEADER_H = 20;
const META_H = 8;
const FOOTER_H = 9;
const LINE_H = 3.4;
const CELL_PAD = 1.1;
const MAX_LINES = 3;

function fmtDate(d: unknown): string {
  if (!d) return "—";
  const dt = new Date(String(d));
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(d: unknown): string {
  if (!d) return "";
  const dt = new Date(String(d));
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtMoney(n: unknown): string {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v);
}

function salesName(user: unknown): string {
  if (!user) return "—";
  if (typeof user === "string") return user;
  const u = user as Record<string, unknown>;
  return String(u.name || u.email || "—");
}

function statusText(s: unknown): string {
  return String(s || "—").replace(/_/g, " ");
}

function visitPartyName(v: WorkPlanVisitRecord): string {
  if (!v.party) return v.party_name || "—";
  if (typeof v.party === "string") return v.party;
  return v.party.party_name || "—";
}

function clip(pdf: JsPDF, text: string, width: number): string[] {
  const raw = String(text || "—").replace(/\s+/g, " ").trim() || "—";
  const lines = pdf.splitTextToSize(raw, Math.max(width, 8)) as string[];
  if (lines.length <= MAX_LINES) return lines;
  const kept = lines.slice(0, MAX_LINES);
  const last = kept[MAX_LINES - 1] || "";
  kept[MAX_LINES - 1] = last.length > 3 ? `${last.slice(0, Math.max(last.length - 1, 1))}…` : last;
  return kept;
}

function rowH(lineSets: string[][]): number {
  const n = Math.max(1, ...lineSets.map((l) => l.length));
  return CELL_PAD * 2 + n * LINE_H;
}

async function loadLogo(url?: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:image/")) return url;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "") || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function contentTop() {
  return M + HEADER_H + META_H;
}

function contentBottom(pdf: JsPDF) {
  return pdf.internal.pageSize.getHeight() - M - FOOTER_H;
}

function drawChrome(
  pdf: JsPDF,
  opts: {
    companyName: string;
    logo?: string | null;
    title: string;
    rightTitle: string;
    rightSub: string;
    periodFrom: string;
    periodTo: string;
    extraMeta?: string;
    generatedAt: string;
    portalLabel: string;
    downloadedBy: string;
  },
) {
  const w = pdf.internal.pageSize.getWidth();
  const h = pdf.internal.pageSize.getHeight();
  let x = M;
  const y = M;

  if (opts.logo) {
    try {
      const fmt = opts.logo.includes("image/png") ? "PNG" : "JPEG";
      pdf.addImage(opts.logo, fmt, x, y, 18, 8);
      x += 21;
    } catch {
      /* skip broken logo */
    }
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...NAVY);
  pdf.text(opts.companyName || "Company", x, y + 5);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...MUTED);
  pdf.text(opts.title.toUpperCase(), x, y + 11);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(...NAVY);
  pdf.text(opts.rightTitle || "—", w - M, y + 5, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...SLATE);
  pdf.text(opts.rightSub, w - M, y + 11, { align: "right" });

  const metaY = M + HEADER_H;
  pdf.setDrawColor(...NAVY);
  pdf.setLineWidth(0.6);
  pdf.line(M, metaY, w - M, metaY);

  const period =
    opts.periodFrom === opts.periodTo
      ? opts.periodFrom || "—"
      : `${opts.periodFrom || "—"}  →  ${opts.periodTo || "—"}`;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...SLATE);
  pdf.text(`Period: ${period}${opts.extraMeta ? `    ${opts.extraMeta}` : ""}`, M, metaY + 5.5);
  pdf.text(`Generated: ${opts.generatedAt || "—"}`, w - M, metaY + 5.5, { align: "right" });

  pdf.setDrawColor(...LINE);
  pdf.setLineWidth(0.25);
  pdf.line(M, metaY + META_H - 1, w - M, metaY + META_H - 1);

  const fy = h - M - 2;
  pdf.setDrawColor(...LINE);
  pdf.line(M, fy - 5, w - M, fy - 5);
  pdf.setFontSize(7);
  pdf.setTextColor(...MUTED);
  pdf.text(`${opts.portalLabel || "Portal"}  ·  Downloaded by ${opts.downloadedBy || "—"}`, M, fy);
  pdf.text("Generated electronically — no signature required", w - M, fy, { align: "right" });
}

function stampPages(pdf: JsPDF) {
  const total = pdf.getNumberOfPages();
  const w = pdf.internal.pageSize.getWidth();
  const h = pdf.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i += 1) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...NAVY);
    pdf.text(`Page ${i} of ${total}`, w / 2, h - M - 2, { align: "center" });
  }
}

function ensureSpace(pdf: JsPDF, y: number, need: number, onNewPage: () => number): number {
  if (y + need <= contentBottom(pdf)) return y;
  pdf.addPage();
  return onNewPage();
}

function drawTableHeader(
  pdf: JsPDF,
  y: number,
  cols: Array<{ label: string; x: number; w: number; align?: "left" | "right" | "center" }>,
): number {
  const h = 7;
  pdf.setFillColor(...NAVY);
  pdf.rect(M, y, pdf.internal.pageSize.getWidth() - M * 2, h, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.5);
  pdf.setTextColor(255, 255, 255);
  for (const c of cols) {
    const opt =
      c.align === "right"
        ? { align: "right" as const }
        : c.align === "center"
          ? { align: "center" as const }
          : undefined;
    const tx = c.align === "right" ? c.x + c.w - 1 : c.align === "center" ? c.x + c.w / 2 : c.x + 1;
    pdf.text(c.label, tx, y + 4.7, opt);
  }
  return y + h;
}

export async function buildWorkPlansReportPdf(input: WorkPlansReportPdfInput): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const logo = await loadLogo(input.logoUrl);
  const pageW = pdf.internal.pageSize.getWidth();
  const usable = pageW - M * 2;

  const visitCount = input.plans.reduce(
    (n, p) => n + (Array.isArray(p.visits) ? p.visits.length : Number(p.visit_count) || 0),
    0,
  );

  const chrome = () =>
    drawChrome(pdf, {
      companyName: input.companyName,
      logo,
      title: "Work Plans Report",
      rightTitle: input.salesUserLabel,
      rightSub: `${input.plans.length} plan${input.plans.length === 1 ? "" : "s"}  ·  ${visitCount} visit${visitCount === 1 ? "" : "s"}`,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      extraMeta: `Status: ${input.statusLabel || "All"}`,
      generatedAt: input.generatedAt,
      portalLabel: input.portalLabel,
      downloadedBy: input.downloadedBy,
    });

  chrome();

  const colW = [8, 32, 28, 30, 26, 28, 20, 28, 32, 26, usable - 258];
  const colX: number[] = [];
  colW.reduce((x, w) => {
    colX.push(x);
    return x + w;
  }, M);
  const headers = [
    "#",
    "Party",
    "Contact",
    "Address",
    "Purpose",
    "Planned",
    "Status",
    "Actual",
    "Outcome / notes",
    "Flags",
    "Follow-up",
  ];
  const cols = headers.map((label, i) => ({
    label,
    x: colX[i]!,
    w: colW[i]!,
    align: i === 0 ? ("center" as const) : undefined,
  }));

  let y = contentTop() + 2;

  const drawVisitHead = () => {
    y = drawTableHeader(pdf, y, cols);
  };

  for (const plan of input.plans) {
    const visits = Array.isArray(plan.visits) ? plan.visits : [];
    const bandH = 8;
    y = ensureSpace(pdf, y, bandH + 7 + 10, () => {
      chrome();
      return contentTop() + 2;
    });

    pdf.setFillColor(...BAND);
    pdf.rect(M, y, usable, bandH, "F");
    pdf.setFillColor(...NAVY);
    pdf.rect(M, y, 1.2, bandH, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...NAVY);
    const left = `${fmtDate(plan.plan_date)}    ${salesName(plan.sales_user)}    ${plan.location || "—"}`;
    pdf.text(left, M + 3, y + 5.3);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...SLATE);
    const right = `${visits.length} visit${visits.length === 1 ? "" : "s"}    ${statusText(plan.status).toUpperCase()}`;
    pdf.text(right, M + usable - 2, y + 5.3, { align: "right" });
    y += bandH + 1;

    if (visits.length === 0) {
      y = ensureSpace(pdf, y, 7, () => {
        chrome();
        return contentTop() + 2;
      });
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(8);
      pdf.setTextColor(...MUTED);
      pdf.text("No visits on this plan", M + 3, y + 4);
      y += 8;
      continue;
    }

    y = ensureSpace(pdf, y, 7 + 10, () => {
      chrome();
      y = contentTop() + 2;
      drawVisitHead();
      return y;
    });
    drawVisitHead();

    visits.forEach((v, idx) => {
      const flags = [
        v.meeting_with_doctor != null ? `Doc ${v.meeting_with_doctor ? "Y" : "N"}` : "",
        v.meeting_with_purchase != null ? `Pur ${v.meeting_with_purchase ? "Y" : "N"}` : "",
        v.meeting_with_finance != null ? `Fin ${v.meeting_with_finance ? "Y" : "N"}` : "",
        v.meeting_with_engineer != null ? `Eng ${v.meeting_with_engineer ? "Y" : "N"}` : "",
        v.new_product_introduced != null ? `New ${v.new_product_introduced ? "Y" : "N"}` : "",
        v.order_received != null ? `Ord ${v.order_received ? "Y" : "N"}` : "",
      ].filter(Boolean);

      const planned = [fmtDateTime(v.planned_start_time), fmtDateTime(v.planned_end_time)]
        .filter(Boolean)
        .join(" – ");
      const actual = [
        v.actual_check_in ? `In ${fmtDateTime(v.actual_check_in)}` : "",
        v.actual_check_out ? `Out ${fmtDateTime(v.actual_check_out)}` : "",
      ]
        .filter(Boolean)
        .join("  ");

      const cells = [
        clip(pdf, v.sequence != null ? String(v.sequence) : "—", colW[0]! - 2),
        clip(
          pdf,
          visitPartyName(v) + (v.party_type ? ` (${String(v.party_type).replace(/_/g, " ")})` : ""),
          colW[1]! - 2,
        ),
        clip(pdf, [v.contact_person, v.contact_number].filter(Boolean).join(" · ") || "—", colW[2]! - 2),
        clip(pdf, v.address || "—", colW[3]! - 2),
        clip(pdf, v.purpose || "—", colW[4]! - 2),
        clip(pdf, planned || "—", colW[5]! - 2),
        clip(pdf, statusText(v.status), colW[6]! - 2),
        clip(pdf, actual || "—", colW[7]! - 2),
        clip(pdf, [v.outcome, v.notes].filter(Boolean).join(" · ") || "—", colW[8]! - 2),
        clip(pdf, flags.join(" · ") || "—", colW[9]! - 2),
        clip(pdf, v.next_followup_date ? fmtDate(v.next_followup_date) : "—", colW[10]! - 2),
      ];
      const h = rowH(cells);
      y = ensureSpace(pdf, y, h, () => {
        chrome();
        y = contentTop() + 2;
        drawVisitHead();
        return y;
      });

      if (idx % 2 === 1) {
        pdf.setFillColor(...ZEBRA);
        pdf.rect(M, y, usable, h, "F");
      }
      pdf.setDrawColor(...LINE);
      pdf.setLineWidth(0.15);
      pdf.line(M, y + h, M + usable, y + h);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(...SLATE);
      cells.forEach((lines, i) => {
        const align = i === 0 ? "center" : undefined;
        const tx = i === 0 ? colX[i]! + colW[i]! / 2 : colX[i]! + 1;
        pdf.text(lines, tx, y + CELL_PAD + 2.6, align ? { align } : undefined);
      });
      y += h;
    });

    y += 3;
  }

  stampPages(pdf);
  return pdf;
}

export async function buildExpensesReportPdf(input: ExpensesReportPdfInput): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const logo = await loadLogo(input.logoUrl);
  const pageW = pdf.internal.pageSize.getWidth();
  const usable = pageW - M * 2;

  const chrome = () =>
    drawChrome(pdf, {
      companyName: input.companyName,
      logo,
      title: "Expenses Report",
      rightTitle: input.salesUserLabel,
      rightSub: `${input.expenses.length} expense${input.expenses.length === 1 ? "" : "s"}  ·  ${fmtMoney(input.totalAmount)}`,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      generatedAt: input.generatedAt,
      portalLabel: input.portalLabel,
      downloadedBy: input.downloadedBy,
    });

  chrome();

  const colW = [20, 20, 26, 20, 30, 20, 20, 20, 20, 16, 18, 22, usable - 252];
  const colX: number[] = [];
  colW.reduce((x, w) => {
    colX.push(x);
    return x + w;
  }, M);
  const headers = [
    "Expense date",
    "Plan date",
    "Sales exec",
    "Location",
    "Visit",
    "Category",
    "Sub-category",
    "Reading",
    "Amount",
    "Pay",
    "Status",
    "Approved by",
    "Bill #",
  ];
  const cols = headers.map((label, i) => ({
    label,
    x: colX[i]!,
    w: colW[i]!,
    align: i === 8 ? ("right" as const) : undefined,
  }));

  let y = contentTop() + 2;
  const head = () => {
    y = drawTableHeader(pdf, y, cols);
  };
  head();

  const visitLabel = (exp: WorkPlanExpenseRecord) => {
    const visit = exp.work_plan_visit;
    if (!visit) return "Plan-level";
    if (typeof visit === "string") return "Visit";
    const party =
      (typeof visit.party === "object" && visit.party?.party_name) || visit.party_name || "";
    const seq = visit.sequence != null ? `#${visit.sequence}` : "Visit";
    return party ? `${seq} ${party}` : seq;
  };

  input.expenses.forEach((exp, idx) => {
    const wp = exp.work_plan;
    const plan =
      !wp || typeof wp === "string"
        ? { plan_date: undefined as unknown, sales_user: undefined as unknown, location: "" }
        : {
            plan_date: (wp as { plan_date?: unknown }).plan_date,
            sales_user: (wp as { sales_user?: unknown }).sales_user,
            location: (wp as { location?: string }).location || "",
          };
    const reading =
      exp.sub_category === "Private Bike"
        ? `${exp.start_reading ?? "—"} → ${exp.closing_reading ?? "—"}`
        : "—";
    const approvedBy =
      exp.status === "approved" || exp.status === "rejected" ? salesName(exp.approved_by) : "—";

    const cells = [
      clip(pdf, fmtDate(exp.expense_date), colW[0]! - 2),
      clip(pdf, fmtDate(plan.plan_date), colW[1]! - 2),
      clip(pdf, salesName(plan.sales_user), colW[2]! - 2),
      clip(pdf, plan.location || "—", colW[3]! - 2),
      clip(pdf, visitLabel(exp), colW[4]! - 2),
      clip(pdf, exp.category || "—", colW[5]! - 2),
      clip(pdf, exp.sub_category || "—", colW[6]! - 2),
      clip(pdf, reading, colW[7]! - 2),
      clip(pdf, fmtMoney(exp.amount), colW[8]! - 2),
      clip(pdf, exp.payment_mode || "—", colW[9]! - 2),
      clip(pdf, statusText(exp.status), colW[10]! - 2),
      clip(pdf, approvedBy, colW[11]! - 2),
      clip(pdf, exp.bill_number || "—", colW[12]! - 2),
    ];
    const h = rowH(cells);
    y = ensureSpace(pdf, y, h, () => {
      chrome();
      y = contentTop() + 2;
      head();
      return y;
    });

    if (idx % 2 === 1) {
      pdf.setFillColor(...ZEBRA);
      pdf.rect(M, y, usable, h, "F");
    }
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.15);
    pdf.line(M, y + h, M + usable, y + h);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...SLATE);
    cells.forEach((lines, i) => {
      if (i === 8) {
        pdf.setFont("helvetica", "bold");
        pdf.text(lines, colX[i]! + colW[i]! - 1, y + CELL_PAD + 2.6, { align: "right" });
        pdf.setFont("helvetica", "normal");
        return;
      }
      pdf.text(lines, colX[i]! + 1, y + CELL_PAD + 2.6);
    });
    y += h;
  });

  stampPages(pdf);
  return pdf;
}

/** Open a blank tab immediately (must run in the click handler before awaits). */
export function openBlankPreviewWindow(): Window | null {
  return window.open("about:blank", "_blank");
}

/** Load the PDF into the system / browser viewer. Falls back to a file download if blocked. */
export function openPdfSystemPreview(
  pdf: JsPDF,
  filename: string,
  previewWin?: Window | null,
): void {
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
  const target = previewWin && !previewWin.closed ? previewWin : null;
  if (target) {
    target.location.replace(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return;
  }
  const opened = window.open(url, "_blank");
  if (!opened) {
    pdf.save(filename);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
