import { buildQuotationPdf, type BuildQuotationPdfInput, type QuotationCompanyInfo } from "../quotations/buildQuotationPdf";

export type LeadQuotationCompanyInfo = QuotationCompanyInfo;
export type BuildLeadQuotationPdfInput = BuildQuotationPdfInput;
export const buildLeadQuotationPdf = buildQuotationPdf;
