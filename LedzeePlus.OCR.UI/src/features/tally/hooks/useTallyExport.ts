import { useState, useEffect, useCallback } from 'react';
import type { ExtractedInvoiceData, VoucherResult } from '../../../types/invoice';
import {
  testTallyConnection,
  postInvoiceToTally,
  formatOneLineError,
} from '../../../services/tallyService';
import { authService } from '../../../services/authService';
import type { UseTallyExportOptions, UseTallyExportResult } from '../types/tallyExport.types';

export function useTallyExport(
  invoice: ExtractedInvoiceData | null | undefined,
  options: UseTallyExportOptions = {}
): UseTallyExportResult {
  const host = options.host || localStorage.getItem('tally_host') || '127.0.0.1';
  const port = options.port || Number(localStorage.getItem('tally_port')) || 9000;
  const preferredCompany = options.companyName || localStorage.getItem('tally_selected_company') || '';
  const voucherType = options.voucherType || 'Purchase';

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [activeCompany, setActiveCompany] = useState<string>(preferredCompany);
  const [companyGstin, setCompanyGstin] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<VoucherResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Probe Tally connection and active companies
  useEffect(() => {
    let isMounted = true;
    const numericPort = Number(port) || 9000;

    testTallyConnection(host, numericPort)
      .then((res) => {
        if (!isMounted) return;
        const d = res.data;
        setIsConnected(Boolean(d?.connected));

        // Resolve active company & GSTIN
        const resolvedCompany =
          preferredCompany ||
          d?.companyName ||
          d?.company?.companyName ||
          d?.availableCompanies?.[0]?.companyName ||
          '';

        setActiveCompany(resolvedCompany);

        const matchedCo =
          d?.availableCompanies?.find((c) => c.companyName === resolvedCompany) ||
          d?.company;
        if (matchedCo?.gstin) {
          setCompanyGstin(matchedCo.gstin);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setIsConnected(false);
      });

    return () => {
      isMounted = false;
    };
  }, [host, port, preferredCompany]);

  // 3-Way GST Matching Logic:
  // 1) If both GSTINs in extracted invoice are null/empty -> Allow user to select company and post entry!
  // 2) Otherwise -> Tally Company GSTIN, Bill GSTIN (Buyer or Seller), and Logged-in User GSTIN (from users.json) MUST ALL 3 MATCH!
  const cleanGst = (gst?: string | null) => {
    const s = (gst || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return s === '—' || s === 'NA' || s === 'NONE' || s === 'NULL' ? '' : s;
  };
  const activeGst = cleanGst(companyGstin);

  const vendorGstClean = cleanGst(invoice?.vendor?.gstin);
  const buyerGstClean = cleanGst(invoice?.buyer?.gstin);
  const isInvoiceNonGst = !vendorGstClean && !buyerGstClean;

  const currentUser = authService.getCurrentUser();
  const userGstClean = cleanGst(currentUser?.gstin);

  const billGstMatches = Boolean(
    activeGst &&
    ((buyerGstClean && buyerGstClean === activeGst) || (vendorGstClean && vendorGstClean === activeGst))
  );

  const isAllThreeMatched = Boolean(
    activeGst &&
    userGstClean &&
    activeGst === userGstClean &&
    billGstMatches
  );

  const isGstMapped = Boolean(
    isConnected &&
    activeCompany &&
    (isInvoiceNonGst || isAllThreeMatched)
  );

  // Unmet reasons diagnostic list
  const unmetReasons: string[] = [];
  if (!isConnected) {
    unmetReasons.push(`Cannot write: Tally is not connected on port ${port}`);
  }
  if (isConnected && !activeCompany) {
    unmetReasons.push('Cannot write: No active company is open in TallyPrime');
  }
  if (isConnected && activeCompany && !isGstMapped) {
    if (!isInvoiceNonGst) {
      if (!userGstClean) {
        unmetReasons.push('Cannot write: Logged in user has no registered GSTIN in users.json');
      } else if (activeGst !== userGstClean) {
        unmetReasons.push(`Cannot write: Logged in user GST (${userGstClean}) does not match Tally company GST (${activeGst})`);
      } else if (!billGstMatches) {
        unmetReasons.push(`Cannot write: Neither Invoice Buyer GST (${buyerGstClean || 'None'}) nor Seller GST (${vendorGstClean || 'None'}) matches Tally company GST (${activeGst})`);
      } else {
        unmetReasons.push('Cannot write: GSTIN mismatch across Tally company, Bill, and logged-in user');
      }
    }
  }

  const canExport = isConnected && Boolean(activeCompany) && isGstMapped && !isExporting;

  const handleExport = useCallback(
    async (customOptions?: Partial<UseTallyExportOptions>): Promise<VoucherResult | null> => {
      if (!invoice) {
        setExportError('No invoice data available to export.');
        return null;
      }

      const mergedOptions = { ...options, ...customOptions };
      const targetCo = mergedOptions.companyName || activeCompany;
      if (!targetCo) {
        setExportError('Target company is required. Please open a company in Tally.');
        return null;
      }

      const targetParty =
        mergedOptions.partyLedger ||
        invoice.vendor?.name ||
        invoice.buyer?.name ||
        'Cash';

      setIsExporting(true);
      setExportError(null);

      try {
        const result = await postInvoiceToTally(
          invoice,
          targetCo,
          targetParty,
          host,
          Number(port) || 9000,
          {
            purchaseLedger: mergedOptions.purchaseLedger,
            cgstLedger: mergedOptions.cgstLedger,
            sgstLedger: mergedOptions.sgstLedger,
            igstLedger: mergedOptions.igstLedger,
            roundOffLedger: mergedOptions.roundOffLedger,
            partyLedger: targetParty,
            voucherType: mergedOptions.voucherType || voucherType,
            autoCreateLedgers: true,
            educationalMode: mergedOptions.educationalMode ?? false,
            narration: mergedOptions.narration || undefined,
            includeLineItems: mergedOptions.includeLineItems ?? true,
          }
        );

        setLastResult(result);
        setIsExporting(false);
        return result;
      } catch (err: any) {
        const formatted = formatOneLineError(err);
        setExportError(formatted);
        setIsExporting(false);
        throw err;
      }
    },
    [invoice, activeCompany, host, port, options, voucherType]
  );

  return {
    canExport,
    isExporting,
    isConnected,
    isGstMapped,
    unmetReasons,
    activeCompany,
    companyGstin,
    handleExport,
    lastResult,
    exportError,
    clearError: () => setExportError(null),
  };
}

export default useTallyExport;
