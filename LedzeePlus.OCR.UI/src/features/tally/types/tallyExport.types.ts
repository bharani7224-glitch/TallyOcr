import type { ExtractedInvoiceData, VoucherResult } from '../../../types/invoice';

export type WriteToTallyVariant = 'primary' | 'compact' | 'table-action';

export interface UseTallyExportOptions {
  host?: string;
  port?: number | string;
  companyName?: string;
  voucherType?: 'Purchase' | 'Sales' | 'Journal' | 'Payment';
  educationalMode?: boolean;
  purchaseLedger?: string;
  partyLedger?: string;
  cgstLedger?: string;
  sgstLedger?: string;
  igstLedger?: string;
  roundOffLedger?: string;
  narration?: string;
  includeLineItems?: boolean;
}

export interface UseTallyExportResult {
  canExport: boolean;
  isExporting: boolean;
  isConnected: boolean;
  isGstMapped: boolean;
  unmetReasons: string[];
  activeCompany: string;
  companyGstin: string;
  handleExport: (customOptions?: Partial<UseTallyExportOptions>) => Promise<VoucherResult | null>;
  lastResult: VoucherResult | null;
  exportError: string | null;
  clearError: () => void;
}

export interface WriteToTallyButtonProps {
  invoice: ExtractedInvoiceData;
  options?: UseTallyExportOptions;
  variant?: WriteToTallyVariant;
  className?: string;
  disabled?: boolean;
  isGstMapped?: boolean;
  onSuccess?: (result: VoucherResult) => void;
  onError?: (err: Error | string) => void;
  onClick?: () => void;
}

