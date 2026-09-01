import { medicaApi } from "../baseApi";
import { unwrapEnvelope, type ApiEnvelope } from "../unwrap";

export type CompanyInfoRecord = {
  _id?: string;
  legal_name: string;
  trade_name: string;
  gstin: string;
  cin: string;
  pan: string;
  drug_license: string;
  fssai_license: string;
  email: string;
  billing_email: string;
  phone: string;
  website: string;
  logo_url: string;
  favicon_url: string;
  primary_color?: string;
  secondary_color?: string;
  theme_palette?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  currency: string;
  timezone: string;
  financial_year: string;
  invoice_footer_note: string;
  is_default?: boolean;
  updated_by?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CompanyAggregatedData = {
  company_info: CompanyInfoRecord;
  metrics: {
    users: {
      total: number;
      active: number;
      departments: {
        super_admin: number;
        admin: number;
        sales: number;
        finance: number;
        account: number;
        dispatch: number;
      };
    };
    parties: {
      total: number;
      active: number;
      by_type: {
        customer: number;
        supplier: number;
        both: number;
      };
    };
    catalog: {
      total_products: number;
      active_products: number;
      total_groups: number;
      total_brands: number;
      total_manufacturers: number;
    };
    orders: {
      total: number;
      total_revenue: number;
      by_status: Record<string, number>;
      recent: Array<{
        _id: string;
        order_no: string;
        total_amount: number;
        status: string;
        order_date?: string;
        createdAt?: string;
      }>;
    };
    fleet: {
      vehicles: number;
      drivers: number;
      transport_agents: number;
      active_transport_plans: number;
    };
    field_operations: {
      work_plans: number;
      visits: number;
      total_expenses: number;
    };
    financials: {
      total_due_sheets: number;
      unbilled_orders: number;
      estimated_revenue: number;
    };
    recent_activity: Array<{
      _id: string;
      action: string;
      entity_type?: string;
      details?: string;
      createdAt?: string;
      actor?: {
        name?: string;
        email?: string;
        department?: string;
      };
    }>;
  };
};

/** `/api/company-info` — Company Information & Organization Settings suite. */
export const companyInfoApi = medicaApi.injectEndpoints({
  endpoints: (build) => ({
    getCompanyInfo: build.query<CompanyInfoRecord, void>({
      query: () => "company-info",
      transformResponse: (raw: ApiEnvelope<CompanyInfoRecord>) =>
        unwrapEnvelope(raw),
      providesTags: ["CompanyInfo"],
    }),
    getCompanyData: build.query<CompanyAggregatedData, void>({
      query: () => "company-info/data",
      transformResponse: (raw: ApiEnvelope<CompanyAggregatedData>) =>
        unwrapEnvelope(raw),
      providesTags: ["CompanyInfo"],
    }),
    updateCompanyInfo: build.mutation<
      CompanyInfoRecord,
      Partial<CompanyInfoRecord>
    >({
      query: (patch) => ({
        url: "company-info",
        method: "PATCH",
        body: patch,
      }),
      transformResponse: (raw: ApiEnvelope<CompanyInfoRecord>) =>
        unwrapEnvelope(raw),
      invalidatesTags: ["CompanyInfo"],
    }),
  }),
});

export const {
  useGetCompanyInfoQuery,
  useLazyGetCompanyInfoQuery,
  useGetCompanyDataQuery,
  useLazyGetCompanyDataQuery,
  useUpdateCompanyInfoMutation,
} = companyInfoApi;
