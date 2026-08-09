export type DownloadOrderItemsPdfOptions = {
  /** When false, download is blocked (order must be sales-approved first). */
  salesApproved?: boolean;
  /**
   * When set, each matching child is captured as its own A4 page
   * (avoids slicing rows mid-text). Defaults to `[data-pdf-page]`.
   * Pass `null` to force single-canvas slice mode.
   */
  pageSelector?: string | null;
  orientation?: "portrait" | "landscape";
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
 * Renders a DOM node to a multi-page A4 PDF.
 *
 * If the element contains `[data-pdf-page]` children (or a custom
 * `pageSelector`), each page node is captured separately so headers/footers
 * repeat and table rows are never sliced mid-line.
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

  // Load heavy PDF deps on demand so portal routes do not pull html2canvas into the initial chunk graph.
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const selector =
    options.pageSelector === null
      ? null
      : (options.pageSelector ?? "[data-pdf-page]");
  const pages =
    selector == null
      ? []
      : Array.from(element.querySelectorAll<HTMLElement>(selector));

  if (pages.length > 0) {
    const pdf = new jsPDF({ orientation: options.orientation ?? "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < pages.length; i += 1) {
      const pageEl = pages[i]!;
      await waitForImages(pageEl);
      const canvas = await html2canvas(pageEl, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const imgWidth = pageWidth;
      const imgHeight = Math.min(
        (canvas.height * imgWidth) / canvas.width,
        pageHeight,
      );
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
    }

    pdf.save(filename);
    return;
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    logging: false,
    useCORS: true,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: options.orientation ?? "portrait", unit: "mm", format: "a4" });
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
