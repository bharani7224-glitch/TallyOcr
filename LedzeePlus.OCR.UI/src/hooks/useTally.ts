import { useState, useEffect } from 'react';
import {
  getLedgerHierarchy,
  postInvoiceToTally,
  parseTallyHierarchy,
  type TallyPostingOptions,
} from '../services/tallyService';
import type { VoucherResult, ExtractedInvoiceData } from '../types/invoice';

export function useTally(companyName?: string, host = '127.0.0.1', port = 9000) {
  const [purchaseLedgers, setPurchaseLedgers] = useState<string[]>([]);
  const [taxLedgers, setTaxLedgers] = useState<{ cgst: string[]; sgst: string[]; igst: string[] }>({
    cgst: [],
    sgst: [],
    igst: [],
  });

  useEffect(() => {
    if (!companyName) return;
    getLedgerHierarchy(companyName, host, port, false).then((res) => {
      const parsed = parseTallyHierarchy(res);
      setPurchaseLedgers(parsed.purchaseLedgers);
      setTaxLedgers({
        cgst: parsed.cgstLedgers,
        sgst: parsed.sgstLedgers,
        igst: parsed.igstLedgers,
      });
    });
  }, [companyName, host, port]);

  const writeVoucher = async (
    invoiceData: ExtractedInvoiceData,
    options?: TallyPostingOptions
  ): Promise<VoucherResult> => {
    return await postInvoiceToTally(
      invoiceData,
      companyName,
      options?.partyLedger,
      host,
      port,
      options
    );
  };

  return { purchaseLedgers, taxLedgers, writeVoucher };
}

export default useTally;
