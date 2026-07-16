"use client";

import {
  PdfDocumentShell,
  pdfTdCompactStyle,
  pdfThCompactStyle,
} from "./orderPdfLayout";

export type FinalOrderStatementPdfLine = {
  productName: string;
  sku?: string;
  hsnCode?: string;
  ordered: string;
  approved: string;
  dispatched: string;
  delivered: string;
  returned: string;
  net: string;
  unitPrice: string;
  rateType: string;
  gstPercent: string;
  gstAmount: string;
  lineTotal: string;
};

export type FinalOrderStatementPdfTotals = {
  ordered: string;
  approved: string;
  dispatched: string;
  delivered: string;
  returned: string;
  net: string;
  gstAmount: string;
  grandTotal: string;
};

export type FinalOrderStatementPdfFinancialSummary = {
  subtotal: string;
  lineDiscountTotal: string;
  taxableAmount: string;
  gst: string;
  headerDiscount: string;
  extraCharges: string;
  penaltyAmount: string;
  damageCharge: string;
  grandTotal: string;
  paymentStatus: string;
};

export type FinalOrderStatementPdfTemplateProps = {
  companyName: string;
  logoUrl: string;
  statementNo: string;
  orderNo: string;
  partyName: string;
  partyCode?: string;
  partyGstin?: string;
  orderDate: string;
  closedAt: string;
  closedBy: string;
  closureRemarks?: string;
  lines: FinalOrderStatementPdfLine[];
  quantityTotals: FinalOrderStatementPdfTotals;
  financialSummary: FinalOrderStatementPdfFinancialSummary;
  generatedAt: string;
};

export function FinalOrderStatementPdfTemplate({
  companyName,
  logoUrl,
  statementNo,
  orderNo,
  partyName,
  partyCode,
  partyGstin,
  orderDate,
  closedAt,
  closedBy,
  closureRemarks,
  lines,
  quantityTotals,
  financialSummary,
  generatedAt,
}: FinalOrderStatementPdfTemplateProps) {
  const fin = financialSummary;

  const financeRows: { label: string; value: string; tone?: "deduct" | "add" | "emphasis" }[] = [
    { label: "Subtotal (settled net lines)", value: fin.subtotal },
    { label: "Line Discount Total", value: fin.lineDiscountTotal, tone: "deduct" },
    { label: "Taxable Amount", value: fin.taxableAmount },
    { label: "GST Amount", value: fin.gst },
    { label: "Header Discount", value: fin.headerDiscount, tone: "deduct" },
    { label: "Extra Charges", value: fin.extraCharges, tone: "add" },
    { label: "Penalty Amount", value: fin.penaltyAmount, tone: "add" },
    { label: "Damage Charge", value: fin.damageCharge, tone: "add" },
  ];
  return (
    <PdfDocumentShell
      companyName={companyName}
      logoUrl={logoUrl}
      rootId="final-order-statement-pdf-root"
    >
      <div style={{ marginBottom: "20px" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "18px",
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          Final Order Statement
        </h1>
        <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: "11px" }}>
          {statementNo} · Generated on {generatedAt}
        </p>
      </div>

      <table style={{ width: "100%", marginBottom: "18px", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ padding: "4px 0", width: "22%", color: "#64748b" }}>Order No.</td>
            <td style={{ padding: "4px 0", fontWeight: 600 }}>{orderNo}</td>
            <td style={{ padding: "4px 0", width: "22%", color: "#64748b" }}>Order Date</td>
            <td style={{ padding: "4px 0", fontWeight: 600 }}>{orderDate}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 0", color: "#64748b" }}>Party</td>
            <td style={{ padding: "4px 0", fontWeight: 600 }}>{partyName}</td>
            <td style={{ padding: "4px 0", color: "#64748b" }}>Closed At</td>
            <td style={{ padding: "4px 0", fontWeight: 600 }}>{closedAt}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 0", color: "#64748b" }}>Party Code</td>
            <td style={{ padding: "4px 0", fontWeight: 600 }}>{partyCode || "—"}</td>
            <td style={{ padding: "4px 0", color: "#64748b" }}>Closed By</td>
            <td style={{ padding: "4px 0", fontWeight: 600 }}>{closedBy}</td>
          </tr>
          {partyGstin ? (
            <tr>
              <td style={{ padding: "4px 0", color: "#64748b" }}>GSTIN</td>
              <td colSpan={3} style={{ padding: "4px 0", fontWeight: 600 }}>
                {partyGstin}
              </td>
            </tr>
          ) : null}
          {closureRemarks ? (
            <tr>
              <td style={{ padding: "4px 0", color: "#64748b", verticalAlign: "top" }}>
                Closure Remarks
              </td>
              <td colSpan={3} style={{ padding: "4px 0", fontStyle: "italic" }}>
                {closureRemarks}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
        <thead>
          <tr>
            <th style={{ ...pdfThCompactStyle, width: "18%" }}>Product</th>
            <th style={{ ...pdfThCompactStyle, textAlign: "right" }}>Ord</th>
            <th style={{ ...pdfThCompactStyle, textAlign: "right" }}>Appr</th>
            <th style={{ ...pdfThCompactStyle, textAlign: "right" }}>Disp</th>
            <th style={{ ...pdfThCompactStyle, textAlign: "right" }}>Deliv</th>
            <th style={{ ...pdfThCompactStyle, textAlign: "right" }}>Ret</th>
            <th style={{ ...pdfThCompactStyle, textAlign: "right" }}>Net</th>
            <th style={{ ...pdfThCompactStyle, textAlign: "right" }}>Rate</th>
            <th style={{ ...pdfThCompactStyle, textAlign: "center" }}>Type</th>
            <th style={{ ...pdfThCompactStyle, textAlign: "right" }}>GST%</th>
            <th style={{ ...pdfThCompactStyle, textAlign: "right" }}>GST</th>
            <th style={{ ...pdfThCompactStyle, textAlign: "right" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => (
            <tr key={`${line.productName}-${idx}`}>
              <td style={pdfTdCompactStyle}>
                <div style={{ fontWeight: 600 }}>{line.productName}</div>
                {line.sku ? (
                  <div style={{ fontSize: "8px", color: "#64748b" }}>SKU {line.sku}</div>
                ) : null}
                {line.hsnCode ? (
                  <div style={{ fontSize: "8px", color: "#64748b" }}>HSN {line.hsnCode}</div>
                ) : null}
              </td>
              <td style={{ ...pdfTdCompactStyle, textAlign: "right" }}>{line.ordered}</td>
              <td style={{ ...pdfTdCompactStyle, textAlign: "right" }}>{line.approved}</td>
              <td style={{ ...pdfTdCompactStyle, textAlign: "right" }}>{line.dispatched}</td>
              <td style={{ ...pdfTdCompactStyle, textAlign: "right" }}>{line.delivered}</td>
              <td style={{ ...pdfTdCompactStyle, textAlign: "right" }}>{line.returned}</td>
              <td style={{ ...pdfTdCompactStyle, textAlign: "right", fontWeight: 600 }}>
                {line.net}
              </td>
              <td style={{ ...pdfTdCompactStyle, textAlign: "right" }}>{line.unitPrice}</td>
              <td style={{ ...pdfTdCompactStyle, textAlign: "center" }}>{line.rateType}</td>
              <td style={{ ...pdfTdCompactStyle, textAlign: "right" }}>{line.gstPercent}</td>
              <td style={{ ...pdfTdCompactStyle, textAlign: "right" }}>{line.gstAmount}</td>
              <td style={{ ...pdfTdCompactStyle, textAlign: "right", fontWeight: 600 }}>
                {line.lineTotal}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...pdfTdCompactStyle, fontWeight: 700 }}>Totals</td>
            <td style={{ ...pdfTdCompactStyle, textAlign: "right", fontWeight: 700 }}>
              {quantityTotals.ordered}
            </td>
            <td style={{ ...pdfTdCompactStyle, textAlign: "right", fontWeight: 700 }}>
              {quantityTotals.approved}
            </td>
            <td style={{ ...pdfTdCompactStyle, textAlign: "right", fontWeight: 700 }}>
              {quantityTotals.dispatched}
            </td>
            <td style={{ ...pdfTdCompactStyle, textAlign: "right", fontWeight: 700 }}>
              {quantityTotals.delivered}
            </td>
            <td style={{ ...pdfTdCompactStyle, textAlign: "right", fontWeight: 700 }}>
              {quantityTotals.returned}
            </td>
            <td style={{ ...pdfTdCompactStyle, textAlign: "right", fontWeight: 700 }}>
              {quantityTotals.net}
            </td>
            <td colSpan={3} style={pdfTdCompactStyle} />
            <td style={{ ...pdfTdCompactStyle, textAlign: "right", fontWeight: 700 }}>
              {quantityTotals.gstAmount}
            </td>
            <td style={{ ...pdfTdCompactStyle, textAlign: "right", fontWeight: 700 }}>
              {quantityTotals.grandTotal}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Quantity summary */}
      <div
        style={{
          marginBottom: "18px",
          padding: "12px 14px",
          borderRadius: "8px",
          border: "1px solid #bfdbfe",
          backgroundColor: "#eff6ff",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#1d4ed8",
            marginBottom: "8px",
          }}
        >
          Quantity Summary (Settled)
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ padding: "3px 0", color: "#1e40af" }}>Ordered</td>
              <td style={{ padding: "3px 0", fontWeight: 600 }}>{quantityTotals.ordered}</td>
              <td style={{ padding: "3px 0", color: "#1e40af" }}>Approved</td>
              <td style={{ padding: "3px 0", fontWeight: 600 }}>{quantityTotals.approved}</td>
              <td style={{ padding: "3px 0", color: "#1e40af" }}>Dispatched</td>
              <td style={{ padding: "3px 0", fontWeight: 600 }}>{quantityTotals.dispatched}</td>
            </tr>
            <tr>
              <td style={{ padding: "3px 0", color: "#1e40af" }}>Delivered</td>
              <td style={{ padding: "3px 0", fontWeight: 600 }}>{quantityTotals.delivered}</td>
              <td style={{ padding: "3px 0", color: "#1e40af" }}>Returns</td>
              <td style={{ padding: "3px 0", fontWeight: 600 }}>{quantityTotals.returned}</td>
              <td style={{ padding: "3px 0", color: "#1e40af" }}>Net</td>
              <td style={{ padding: "3px 0", fontWeight: 600 }}>{quantityTotals.net}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Full financial summary */}
      <div
        style={{
          marginTop: "8px",
          padding: "14px 16px",
          borderRadius: "8px",
          border: "1px solid #a7f3d0",
          backgroundColor: "#ecfdf5",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#047857",
            marginBottom: "10px",
          }}
        >
          Financial Summary (Settled)
        </div>
        <div style={{ marginLeft: "auto", width: "320px" }}>
          {financeRows.map((row) => (
            <div
              key={row.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "4px 0",
                fontSize: "11px",
              }}
            >
              <span style={{ color: "#065f46" }}>{row.label}</span>
              <span
                style={{
                  fontWeight: 600,
                  color: row.tone === "deduct" ? "#b91c1c" : "#0f172a",
                }}
              >
                ₹{row.value}
              </span>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "10px 0 0",
              marginTop: "8px",
              borderTop: "2px solid #047857",
              fontSize: "14px",
            }}
          >
            <span style={{ fontWeight: 700, color: "#065f46" }}>Settled Grand Total</span>
            <span style={{ fontWeight: 700, color: "#1e3a5f" }}>₹{fin.grandTotal}</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "8px 0 0",
              fontSize: "10px",
              color: "#047857",
            }}
          >
            <span>Payment Status</span>
            <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{fin.paymentStatus}</span>
          </div>
        </div>
      </div>
    </PdfDocumentShell>
  );
}

export default FinalOrderStatementPdfTemplate;
