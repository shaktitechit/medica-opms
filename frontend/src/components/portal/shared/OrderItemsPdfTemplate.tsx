"use client";

import {
  PdfDocumentShell,
  pdfTdStyle,
  pdfThStyle,
} from "./orderPdfLayout";

export type OrderItemsPdfLine = {
  productName: string;
  sku?: string;
  quantity: string;
  freeQty: string;
  rateType: string;
  unitPrice: string;
  discount: string;
  gst: string;
  lineTotal: string;
};

export type OrderItemsPdfSalesApproval = {
  statusLabel: string;
  /** Admin approval reference (e.g. OAA-…). Shown when present. */
  approvalNo?: string;
  approvedBy: string;
  approvedAt: string;
};

export type OrderItemsPdfFinanceAmendment = {
  amendedBy: string;
  amendedAt: string;
  amendmentNotes?: string;
};

export type OrderItemsPdfTemplateProps = {
  companyName: string;
  /** Absolute URL recommended for reliable PDF/canvas capture. */
  logoUrl: string;
  orderNo: string;
  partyName: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  statusLabel: string;
  salesApproval: OrderItemsPdfSalesApproval;
  financeAmendment?: OrderItemsPdfFinanceAmendment;
  items: OrderItemsPdfLine[];
  subtotal: string;
  gst: string;
  headerDiscount: string;
  grandTotal: string;
  generatedAt: string;
};

export function OrderItemsPdfTemplate({
  companyName,
  logoUrl,
  orderNo,
  partyName,
  orderDate,
  expectedDeliveryDate,
  statusLabel,
  salesApproval,
  financeAmendment,
  items,
  subtotal,
  gst,
  headerDiscount,
  grandTotal,
  generatedAt,
}: OrderItemsPdfTemplateProps) {
  return (
    <PdfDocumentShell
      companyName={companyName}
      logoUrl={logoUrl}
      rootId="order-items-pdf-root"
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
          Order Items Statement
        </h1>
        <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: "11px" }}>
          Generated on {generatedAt}
        </p>
      </div>

      {/* Order meta */}
      <table
        style={{
          width: "100%",
          marginBottom: "22px",
          borderCollapse: "collapse",
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: "4px 0", width: "28%", color: "#64748b" }}>
              Order No.
            </td>
            <td style={{ padding: "4px 0", fontWeight: 600 }}>{orderNo}</td>

          </tr>
          <tr>
            <td style={{ padding: "4px 0", color: "#64748b" }}>Party</td>
            <td style={{ padding: "4px 0", fontWeight: 600 }}>{partyName}</td>
            <td style={{ padding: "4px 0", color: "#64748b" }}>Order Date</td>
            <td style={{ padding: "4px 0", fontWeight: 600 }}>{orderDate}</td>
          </tr>
          {expectedDeliveryDate ? (
            <tr>
              <td style={{ padding: "4px 0", color: "#64748b" }}>
                Expected Delivery
              </td>
              <td colSpan={3} style={{ padding: "4px 0", fontWeight: 600 }}>
                {expectedDeliveryDate}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {/* Sales approval */}
      <div
        style={{
          marginBottom: "22px",
          padding: "12px 14px",
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
            marginBottom: "8px",
          }}
        >
          Sales Approval
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>

            {salesApproval.approvalNo ? (
              <tr>
                <td style={{ padding: "3px 0", color: "#065f46" }}>
                  Approval No.
                </td>
                <td style={{ padding: "3px 0", fontWeight: 600 }}>
                  {salesApproval.approvalNo}
                </td>
              </tr>
            ) : null}
            <tr>
              <td style={{ padding: "3px 0", color: "#065f46" }}>Approved by</td>
              <td style={{ padding: "3px 0", fontWeight: 600 }}>
                {salesApproval.approvedBy}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "3px 0", color: "#065f46" }}>
                Date &amp; time
              </td>
              <td style={{ padding: "3px 0", fontWeight: 600 }}>
                {salesApproval.approvedAt}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Finance Amendment */}
      {financeAmendment ? (
        <div
          style={{
            marginBottom: "22px",
            padding: "12px 14px",
            borderRadius: "8px",
            border: "1px solid #c7d2fe",
            backgroundColor: "#e0e7ff",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#4338ca",
              marginBottom: "8px",
            }}
          >
            Finance Amendment Info
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ padding: "3px 0", width: "28%", color: "#3730a3" }}>
                  Amended by
                </td>
                <td style={{ padding: "3px 0", fontWeight: 600 }}>
                  {financeAmendment.amendedBy}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "3px 0", color: "#3730a3" }}>
                  Date &amp; time
                </td>
                <td style={{ padding: "3px 0", fontWeight: 600 }}>
                  {financeAmendment.amendedAt}
                </td>
              </tr>
              {financeAmendment.amendmentNotes ? (
                <tr>
                  <td style={{ padding: "3px 0", color: "#3730a3", verticalAlign: "top" }}>
                    Amendment notes
                  </td>
                  <td style={{ padding: "3px 0", fontWeight: 600, whiteSpace: "pre-line" }}>
                    {financeAmendment.amendmentNotes}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Line items */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...pdfThStyle, width: "28%" }}>Product</th>
            <th style={{ ...pdfThStyle, textAlign: "right" }}>Qty</th>
            <th style={{ ...pdfThStyle, textAlign: "right" }}>Free</th>
            <th style={{ ...pdfThStyle }}>Rate</th>
            <th style={{ ...pdfThStyle, textAlign: "right" }}>Price</th>
            <th style={{ ...pdfThStyle, textAlign: "right" }}>Disc</th>
            <th style={{ ...pdfThStyle, textAlign: "right" }}>GST</th>
            <th style={{ ...pdfThStyle, textAlign: "right" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((line, idx) => (
            <tr key={`${line.productName}-${idx}`}>
              <td style={pdfTdStyle}>
                <div style={{ fontWeight: 600 }}>{line.productName}</div>
                {line.sku ? (
                  <div style={{ fontSize: "9px", color: "#64748b" }}>
                    SKU {line.sku}
                  </div>
                ) : null}
              </td>
              <td style={{ ...pdfTdStyle, textAlign: "right" }}>{line.quantity}</td>
              <td style={{ ...pdfTdStyle, textAlign: "right" }}>{line.freeQty}</td>
              <td style={pdfTdStyle}>{line.rateType}</td>
              <td style={{ ...pdfTdStyle, textAlign: "right" }}>{line.unitPrice}</td>
              <td style={{ ...pdfTdStyle, textAlign: "right" }}>{line.discount}</td>
              <td style={{ ...pdfTdStyle, textAlign: "right" }}>{line.gst}</td>
              <td style={{ ...pdfTdStyle, textAlign: "right", fontWeight: 600 }}>
                {line.lineTotal}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div
        style={{
          marginTop: "24px",
          marginLeft: "auto",
          width: "280px",
          borderTop: "2px solid #1e3a5f",
          paddingTop: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "4px 0",
          }}
        >
          <span style={{ color: "#64748b" }}>Subtotal</span>
          <span style={{ fontWeight: 600 }}>₹{subtotal}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "4px 0",
          }}
        >
          <span style={{ color: "#64748b" }}>GST</span>
          <span style={{ fontWeight: 600 }}>₹{gst}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "4px 0",
          }}
        >
          <span style={{ color: "#64748b" }}>Header Discount</span>
          <span style={{ fontWeight: 600, color: "#b91c1c" }}>
            -₹{headerDiscount}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "8px 0 0",
            marginTop: "6px",
            borderTop: "1px solid #e2e8f0",
            fontSize: "14px",
          }}
        >
          <span style={{ fontWeight: 700 }}>Grand Total</span>
          <span style={{ fontWeight: 700, color: "#1e3a5f" }}>₹{grandTotal}</span>
        </div>
      </div>
    </PdfDocumentShell>
  );
}

export default OrderItemsPdfTemplate;
