export interface LineItem {
  sno: number;
  description: string;
  hsnSac: string;
  qty: string | number;
  rate: number;
  taxable: number;
  total: number;
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
}

export interface ExtractedInvoiceData {
  invoiceNo: string;
  invoiceDate: string;
  entryDate: string;
  orderPoNo: string;
  currency: string;
  vendor: {
    name: string;
    gstin: string;
    address: string;
  };
  buyer: {
    name: string;
    gstin: string;
    address: string;
  };
  items: LineItem[];
  subtotal: string;
  cgst: string;
  sgst: string;
  igst: string;
  totalTax: string;
  grandTotal: string;
  payable: string;
  confidence: number;
  fileName: string;
  uploadedAt: string;
  rawPayload: any;
}

export interface PostingLine {
  ledger: string;
  amount: number;
  isDebit: boolean;
}

export interface VoucherRequest {
  correlationId: string;
  company: string;
  voucherType: string;
  voucherNumber: string;
      date: string; // yyyy-MM-dd
      partyLedger: string;
      narration?: string;
      lines: PostingLine[];
      isRetry?: boolean;
    }

    export interface VoucherResult {
      correlationId: string;
      status: 'Created' | 'Exists' | 'Rejected' | 'Failed' | 'Unknown';
      message: string;
      voucherDate?: string;
      voucherNumber?: string;
      company?: string;
      amount?: number | string;
      targetSystem?: string;
    }

    export interface TallyStatusResponse {
      isOnline: boolean;
      companies: string[];
  activeCompany?: string;
  connectorName?: string;
}

export interface TallyLedgerItem {
  name: string;
  parentGroup: string;
  partyGstin?: string | null;
  taxType?: string | null;
  gstDutyHead?: string | null;
  stateName?: string | null;
}

export interface TallyCompanyDetails {
  companyName: string;
  gstin?: string | null;
  state?: string | null;
  gstRegistrationType?: string | null;
  address?: string | null;
  pincode?: string | null;
  country?: string | null;
  financialYearFrom?: string | null;
  booksFrom?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  currencySymbol?: string | null;
  taxUnits?: any[];
}

export interface TallyCompanyItem {
  companyName: string;
  gstin?: string | null;
  state?: string | null;
}

export interface TallyConnectionData {
  connected: boolean;
  error_code?: string | null;
  host: string;
  port: number;
  companyName?: string | null;
  endpoint?: string | null;
  status: number;
  latencyMs?: number;
  message?: string | null;
  company?: TallyCompanyDetails | null;
  availableCompanies: TallyCompanyItem[];
  taxUnits?: any[];
  errors?: string[] | null;
}

export interface TallyConnectionResponse {
  success: boolean;
  message: string;
  error_code?: string;
  data: TallyConnectionData;
}

export interface TallyHierarchyGroupItem {
  name: string;
}

export interface TallyHierarchyParent {
  name: string;
  child: TallyHierarchyGroupItem[];
}

export interface TallyHierarchyGroup {
  parent: TallyHierarchyParent[];
}

export interface TallyHierarchyResponse {
  groups: TallyHierarchyGroup[];
}

export interface ParsedTallyHierarchy {
  purchaseLedgers: string[];
  salesLedgers: string[];
  dutiesAndTaxes: string[];
  cgstLedgers: string[];
  sgstLedgers: string[];
  igstLedgers: string[];
  roundOffLedgers: string[];
  creditorLedgers: string[];
  allLedgers: string[];
}


