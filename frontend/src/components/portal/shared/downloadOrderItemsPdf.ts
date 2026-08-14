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

type Html2CanvasFn = (typeof import("html2canvas"))["default"];

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

/** Wait for React paint + fonts so off-screen PDF templates are fully laid out. */
export async function waitForPdfTemplate(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => window.setTimeout(resolve, 160));
}

function restoreStyle(el: HTMLElement, prev: Partial<CSSStyleDeclaration>) {
  const s = el.style;
  s.position = prev.position ?? "";
  s.left = prev.left ?? "";
  s.top = prev.top ?? "";
  s.right = prev.right ?? "";
  s.bottom = prev.bottom ?? "";
  s.zIndex = prev.zIndex ?? "";
  s.transform = prev.transform ?? "";
  s.visibility = prev.visibility ?? "";
  s.opacity = prev.opacity ?? "";
  s.pointerEvents = prev.pointerEvents ?? "";
  s.overflow = prev.overflow ?? "";
}

/**
 * Park the page in the viewport for html2canvas. Off-screen / overflow-clipped
 * ancestors otherwise produce blank or truncated pages (missing later rows).
 */
async function captureElement(
  html2canvas: Html2CanvasFn,
  pageEl: HTMLElement,
): Promise<HTMLCanvasElement> {
  const prev: Partial<CSSStyleDeclaration> = {
    position: pageEl.style.position,
    left: pageEl.style.left,
    top: pageEl.style.top,
    right: pageEl.style.right,
    bottom: pageEl.style.bottom,
    zIndex: pageEl.style.zIndex,
    transform: pageEl.style.transform,
    visibility: pageEl.style.visibility,
    opacity: pageEl.style.opacity,
    pointerEvents: pageEl.style.pointerEvents,
    overflow: pageEl.style.overflow,
  };

  pageEl.style.position = "fixed";
  pageEl.style.left = "0px";
  pageEl.style.top = "0px";
  pageEl.style.right = "auto";
  pageEl.style.bottom = "auto";
  pageEl.style.zIndex = "-1";
  pageEl.style.transform = "none";
  pageEl.style.visibility = "visible";
  pageEl.style.opacity = "1";
  pageEl.style.pointerEvents = "none";
  pageEl.style.overflow = "visible";

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const width = Math.max(pageEl.scrollWidth, pageEl.offsetWidth, 1);
  const height = Math.max(pageEl.scrollHeight, pageEl.offsetHeight, 1);

  try {
    return await html2canvas(pageEl, {
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
    });
  } finally {
    restoreStyle(pageEl, prev);
  }
}

function addCanvasPages(
  pdf: InstanceType<(typeof import("jspdf"))["jsPDF"]>,
  canvas: HTMLCanvasElement,
  pageWidth: number,
  pageHeight: number,
  addPageFirst: boolean,
) {
  const imgData = canvas.toDataURL("image/png");
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  if (imgHeight <= pageHeight + 0.5) {
    if (addPageFirst) pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
    return;
  }

  // Do not crop: slice a tall capture across extra PDF pages.
  let heightLeft = imgHeight;
  let position = 0;
  let first = !addPageFirst;
  while (heightLeft > 0.5) {
    if (!first) pdf.addPage();
    first = false;
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    position -= pageHeight;
  }
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
    const pdf = new jsPDF({
      orientation: options.orientation ?? "portrait",
      unit: "mm",
      format: "a4",
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < pages.length; i += 1) {
      const pageEl = pages[i]!;
      await waitForImages(pageEl);
      const canvas = await captureElement(html2canvas, pageEl);
      addCanvasPages(pdf, canvas, pageWidth, pageHeight, i > 0);
    }

    pdf.save(filename);
    return;
  }

  const canvas = await captureElement(html2canvas, element);
  const pdf = new jsPDF({
    orientation: options.orientation ?? "portrait",
    unit: "mm",
    format: "a4",
  });
  addCanvasPages(
    pdf,
    canvas,
    pdf.internal.pageSize.getWidth(),
    pdf.internal.pageSize.getHeight(),
    false,
  );

  pdf.save(filename);
}
