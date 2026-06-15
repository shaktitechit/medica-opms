import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export type DownloadOrderItemsPdfOptions = {
  /** When false, download is blocked (order must be sales-approved first). */
  salesApproved?: boolean;
};

async function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );
}

/**
 * Renders a DOM node (typically {@link OrderItemsPdfTemplate}) to a multi-page A4 PDF.
 * Requires sales approval before export.
 */
export async function downloadOrderItemsPdf(
  element: HTMLElement,
  filename: string,
  options: DownloadOrderItemsPdfOptions = {},
): Promise<void> {
  if (options.salesApproved === false) {
    throw new Error("PDF download is available only after sales approval.");
  }

  await waitForImages(element);

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    logging: false,
    useCORS: true,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}
