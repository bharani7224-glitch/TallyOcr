import { CONFIG } from './config';
export { detectClientLocalIp } from './tallyApi';
import type {
  ExtractedInvoiceData,
  VoucherResult,
  TallyStatusResponse,
  TallyLedgerItem,
  TallyConnectionResponse,
  TallyHierarchyResponse,
  ParsedTallyHierarchy,
} from '../types/invoice';

export interface TallyPostingOptions {
  purchaseLedger?: string;
  salesLedger?: string;
  partyLedger?: string;
  cgstLedger?: string;
  sgstLedger?: string;
  igstLedger?: string;
  roundOffLedger?: string;
  voucherType?: string;
  autoCreateLedgers?: boolean;
  educationalMode?: boolean;
  narration?: string;
  includeLineItems?: boolean;
  includeInventoryItems?: boolean;
  includePurchase?: boolean;
  includeCgst?: boolean;
  includeSgst?: boolean;
  includeIgst?: boolean;
  includeRoundOff?: boolean;
}

/**
 * Fetches the ledger hierarchy from TallyPrime grouped by Parent
 */
export async function getLedgerHierarchy(
  companyName?: string,
  host: string = '127.0.0.1',
  port: number | string = 9000,
  forceRefresh: boolean = false
): Promise<TallyHierarchyResponse> {
  try {
    const baseUrl = CONFIG.backendApiUrl.startsWith('http')
      ? CONFIG.backendApiUrl
      : `${window.location.origin}${CONFIG.backendApiUrl.startsWith('/') ? '' : '/'}${CONFIG.backendApiUrl}`;

    const url = new URL(`${baseUrl}/api/tally/ledger-groups/hierarchy`);
    if (companyName) url.searchParams.set('companyName', companyName.trim());
    url.searchParams.set('host', String(host).trim() || '127.0.0.1');
    url.searchParams.set('port', String(port || 9000));
    if (forceRefresh) url.searchParams.set('forceRefresh', 'true');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { groups: [] };
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch ledger hierarchy:', err);
    return { groups: [] };
  }
}

/**
 * Parses and categorizes the ledger hierarchy into UI dropdown arrays
 */
export function parseTallyHierarchy(hierarchy: TallyHierarchyResponse): ParsedTallyHierarchy {
  const parentList = hierarchy?.groups?.[0]?.parent || [];
  const purchaseLedgers: string[] = [];
  const salesLedgers: string[] = [];
  const dutiesAndTaxes: string[] = [];
  const roundOffLedgers: string[] = [];
  const creditorLedgers: string[] = [];
  const allLedgers: string[] = [];

  for (const group of parentList) {
    const gName = (group.name || '').toLowerCase();
    const children = (group.child || []).map((c: any) => c.name).filter(Boolean);
    allLedgers.push(...children);

    if (gName.includes('purchase')) {
      purchaseLedgers.push(...children);
    } else if (gName.includes('sale')) {
      salesLedgers.push(...children);
    } else if (gName.includes('duties') || gName.includes('tax')) {
      dutiesAndTaxes.push(...children);
    } else if (gName.includes('indirect')) {
      roundOffLedgers.push(...children.filter((l: string) => /round\s*off/i.test(l)));
    } else if (gName.includes('creditor')) {
      creditorLedgers.push(...children);
    }
  }

  const cgstLedgers = dutiesAndTaxes.filter((l) => /cgst/i.test(l));
  const sgstLedgers = dutiesAndTaxes.filter((l) => /sgst/i.test(l));
  const igstLedgers = dutiesAndTaxes.filter((l) => /igst/i.test(l));

  if (roundOffLedgers.length === 0) {
    const directRoundOff = allLedgers.filter((l) => /round\s*off/i.test(l));
    if (directRoundOff.length > 0) {
      roundOffLedgers.push(...directRoundOff);
    } else {
      roundOffLedgers.push('Round Off');
    }
  }

  return {
    purchaseLedgers: Array.from(new Set(purchaseLedgers)),
    salesLedgers: Array.from(new Set(salesLedgers)),
    dutiesAndTaxes: Array.from(new Set(dutiesAndTaxes)),
    cgstLedgers: Array.from(new Set(cgstLedgers)),
    sgstLedgers: Array.from(new Set(sgstLedgers)),
    igstLedgers: Array.from(new Set(igstLedgers)),
    roundOffLedgers: Array.from(new Set(roundOffLedgers)),
    creditorLedgers: Array.from(new Set(creditorLedgers)),
    allLedgers: Array.from(new Set(allLedgers)),
  };
}

/**
 * Formats backend errors into a clean 1-line user-friendly string
 */
export function formatOneLineError(err: any): string {
  if (!err) return 'An unknown error occurred while exporting to Tally.';
  if (typeof err === 'string') return err.replace(/[\r\n]+/g, ' ').trim();
  if (err.response?.data?.errors?.length > 0) {
    return String(err.response.data.errors[0]).replace(/[\r\n]+/g, ' ').trim();
  }
  if (err.response?.data?.message) {
    return String(err.response.data.message).replace(/[\r\n]+/g, ' ').trim();
  }
  if (err.message) {
    return String(err.message).replace(/[\r\n]+/g, ' ').trim();
  }
  return JSON.stringify(err);
}

/**
 * Executes a 4-tier progressive diagnostic test to TallyPrime via the backend
 */
export async function testTallyConnection(
  host: string = '127.0.0.1',
  port: number = 9000,
  companyName?: string
): Promise<TallyConnectionResponse> {
  try {
    const baseUrl = CONFIG.backendApiUrl.startsWith('http')
      ? CONFIG.backendApiUrl
      : `${window.location.origin}${CONFIG.backendApiUrl.startsWith('/') ? '' : '/'}${CONFIG.backendApiUrl}`;

    const url = new URL(`${baseUrl}/api/tally/test-connection`);
    url.searchParams.set('host', host.trim() || '127.0.0.1');
    url.searchParams.set('port', String(port || 9000));
    if (companyName) {
      url.searchParams.set('companyName', companyName.trim());
    }

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Network request failed',
      error_code: 'CLIENT_ERROR',
      data: {
        connected: false,
        host,
        port,
        status: 0,
        availableCompanies: [],
        errors: [err.message || 'Client network error'],
      },
    };
  }
}

/**
 * Normalizes date to Educational mode accepted date (1st of the month)
 * Format: yyyy-MM-01
 */
export function normalizeDateForTally(dateStr: string): string {
  try {
    if (!dateStr) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }

    // Try parsing DD/MM/YYYY or YYYY-MM-DD
    let year = new Date().getFullYear();
    let month = new Date().getMonth() + 1;

    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          year = parseInt(parts[2], 10);
          month = parseInt(parts[1], 10);
        } else if (parts[0].length === 4) {
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10);
        }
      }
    } else if (dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10);
        } else if (parts[2].length === 4) {
          year = parseInt(parts[2], 10);
          month = parseInt(parts[1], 10);
        }
      }
    }

    // Always return the 1st of the month for seamless Tally Educational & Licensed mode compatibility
    return `${year}-${String(month).padStart(2, '0')}-01`;
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }
}

/**
 * Checks connection to Tally via the Cloud Backend & TallyBridge Connector
 */
export async function getTallyConnectionStatus(host?: string, port?: number): Promise<TallyStatusResponse> {
  try {
    const baseUrl = CONFIG.backendApiUrl.startsWith('http')
      ? CONFIG.backendApiUrl
      : `${window.location.origin}${CONFIG.backendApiUrl.startsWith('/') ? '' : '/'}${CONFIG.backendApiUrl}`;
    const url = new URL(`${baseUrl}/api/tally/companies`);
    if (host) url.searchParams.set('host', host);
    if (port) url.searchParams.set('port', String(port));

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return { isOnline: false, companies: [] };
    }

    const json = await res.json();
    const rawList = Array.isArray(json) ? json :
                    Array.isArray(json?.data) ? json.data :
                    json?.availableCompanies || json?.companies || [];

    const companies: string[] = rawList.map((c: any) => c.companyName || c.name || c).filter(Boolean);
    const activeCompany = json?.activeCompany || companies[0] || '';

    return {
      isOnline: companies.length > 0 || json?.connected === true || json?.success === true,
      companies,
      activeCompany,
      connectorName: json?.connectorName || 'TallyBridge Daemon',
    };
  } catch (err) {
    console.warn('Failed to fetch Tally companies from backend:', err);
    // If backend isn't reachable over network, return offline state
    return { isOnline: false, companies: [] };
  }
}

/**
 * Retrieves all ledgers with parent groups and GSTIN from TallyPrime
 */
export async function getTallyLedgers(companyName?: string): Promise<TallyLedgerItem[]> {
  try {
    const url = new URL(`${CONFIG.backendApiUrl}/api/tally/ledgers`);
    if (companyName) url.searchParams.set('companyName', companyName);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];

    const json = await res.json();
    return Array.isArray(json?.data) ? json.data : [];
  } catch (err) {
    console.warn('Failed to fetch Tally ledgers:', err);
    return [];
  }
}

/**
 * Retrieves party ledgers from Tally and optionally matches with vendor GSTIN
 */
export async function getTallyParties(
  companyName?: string,
  gstin?: string,
  host?: string,
  port?: string | number
): Promise<{ matched: boolean; party?: TallyLedgerItem; allParties: TallyLedgerItem[] }> {
  try {
    const baseUrl = CONFIG.backendApiUrl.startsWith('http')
      ? CONFIG.backendApiUrl
      : `${window.location.origin}${CONFIG.backendApiUrl.startsWith('/') ? '' : '/'}${CONFIG.backendApiUrl}`;

    const url = new URL(`${baseUrl}/api/tally/party-ledgers`);
    if (companyName) url.searchParams.set('companyName', companyName);
    if (gstin && gstin !== '—') url.searchParams.set('gstin', gstin);
    if (host) url.searchParams.set('host', host);
    if (port) url.searchParams.set('port', String(port));

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { matched: false, allParties: [] };

    const json = await res.json();
    return {
      matched: !!json?.matched,
      party: json?.party,
      allParties: Array.isArray(json?.data) ? json.data : (Array.isArray(json?.allParties) ? json.allParties : []),
    };
  } catch (err) {
    console.warn('Failed to fetch Tally party ledgers:', err);
    return { matched: false, allParties: [] };
  }
}

/**
 * Posts an invoice voucher to TallyPrime via Backend SignalR Hub -> TallyBridge Connector
 */
export async function postInvoiceToTally(
  invoice: ExtractedInvoiceData,
  selectedCompany?: string,
  selectedPartyLedger?: string,
  tallyHost: string = '127.0.0.1',
  tallyPort: number | string = 9000,
  options?: TallyPostingOptions
): Promise<VoucherResult> {
  const correlationId = 'vch-' + Math.floor(100000 + Math.random() * 900000);
  const company = (selectedCompany || invoice.buyer.name || '').trim();
  if (!company) {
    throw new Error('Target company name is required. Please ensure an active company is open in TallyPrime.');
  }

  const partyName = (options?.partyLedger || selectedPartyLedger || invoice.vendor.name || '').trim();
  if (!partyName) {
    throw new Error('Party ledger name is required. Please select a party ledger.');
  }

  // Format invoice_date (YYYY-MM-DD)
  const rawDate = invoice.invoiceDate || '';
  let invoiceDateStr = '';
  if (rawDate.includes('/')) {
    const parts = rawDate.split('/');
    if (parts.length === 3) {
      if (parts[2].length === 4) invoiceDateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      else if (parts[0].length === 4) invoiceDateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
  } else if (rawDate.includes('-')) {
    const parts = rawDate.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) invoiceDateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      else if (parts[2].length === 4) invoiceDateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  const today = new Date().toISOString().split('T')[0];
  if (!invoiceDateStr) invoiceDateStr = today;
  const voucherDateStr = today;

  const includePurchase = options?.includePurchase ?? true;
  const includeCgst = options?.includeCgst ?? (Number(parseFloat(invoice.cgst) || 0) > 0);
  const includeSgst = options?.includeSgst ?? (Number(parseFloat(invoice.sgst) || 0) > 0);
  const includeIgst = options?.includeIgst ?? (Number(parseFloat(invoice.igst) || 0) > 0);
  const includeRoundOff = options?.includeRoundOff ?? true;
  const includeLineItems = options?.includeLineItems ?? true;
  const includeInventoryItems = options?.includeInventoryItems ?? false;

  const rawSubtotal = Number(parseFloat(invoice.subtotal) || 0);
  const subtotal = includePurchase ? rawSubtotal : 0;
  const cgst = includeCgst ? Number(parseFloat(invoice.cgst) || 0) : 0;
  const sgst = includeSgst ? Number(parseFloat(invoice.sgst) || 0) : 0;
  const igst = includeIgst ? Number(parseFloat(invoice.igst) || 0) : 0;
  const totalTax = cgst + sgst + igst;
  const rawGrandTotal = Number(parseFloat(invoice.grandTotal) || (rawSubtotal + totalTax));
  const roundOffDiff = includeRoundOff
    ? Number((rawGrandTotal - (subtotal + cgst + sgst + igst)).toFixed(2))
    : 0;
  const grandTotal = Number((subtotal + cgst + sgst + igst + roundOffDiff).toFixed(2));

  // Determine effective tax rate & ledger names
  const calcRate = subtotal > 0 ? Math.round(((cgst + sgst + igst) / subtotal) * 100) : 18;
  const effectiveRate = calcRate > 0 ? calcRate : 18;

  const purchaseLedgerName = (options?.purchaseLedger || `Purchase Account`).trim();
  const cgstLedgerName = (options?.cgstLedger || 'CGST').trim();
  const sgstLedgerName = (options?.sgstLedger || 'SGST').trim();
  const igstLedgerName = (options?.igstLedger || 'IGST').trim();
  const roundOffLedgerName = (options?.roundOffLedger || 'Round Off').trim();
  const voucherType = (options?.voucherType || 'Purchase').trim();

  // Construct items
  const items = invoice.items.length > 0 ? invoice.items.map((it) => ({
    description: it.description || purchaseLedgerName,
    taxable_value: includePurchase ? Number(it.taxable || it.total || subtotal) : 0,
    cgst_amount: includeCgst ? Number(it.cgstRate ? (it.taxable * it.cgstRate) / 100 : (cgst > 0 && invoice.items.length === 1 ? cgst : 0)) : 0,
    sgst_amount: includeSgst ? Number(it.sgstRate ? (it.taxable * it.sgstRate) / 100 : (sgst > 0 && invoice.items.length === 1 ? sgst : 0)) : 0,
    igst_amount: includeIgst ? Number(it.igstRate ? (it.taxable * it.igstRate) / 100 : (igst > 0 && invoice.items.length === 1 ? igst : 0)) : 0,
    line_total: Number(it.total || it.taxable || subtotal),
  })) : [
    {
      description: purchaseLedgerName,
      taxable_value: subtotal,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      line_total: subtotal,
    }
  ];

  // Construct gst_groups
  const gstGroups = [
    {
      rate: effectiveRate,
      label: `GST ${effectiveRate}%`,
      ledger_name: purchaseLedgerName,
      taxable_amount: subtotal,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      total_tax: totalTax,
      total_amount: subtotal,
    }
  ];

  const targetHost = tallyHost || '127.0.0.1';
  const targetPort = Number(tallyPort || 9000);

  const payload = {
    port: targetPort,
    host: targetHost,
    tally_host: targetHost,
    options: {
      company_name: company,
      voucher_type: voucherType,
      purchase_ledger_name: purchaseLedgerName,
      sales_ledger_name: options?.salesLedger || 'Sales Account',
      party_ledger_name: partyName,
      cgst_ledger_name: cgstLedgerName,
      sgst_ledger_name: sgstLedgerName,
      igst_ledger_name: igstLedgerName,
      round_off_ledger_name: roundOffLedgerName,
      auto_create_ledgers: options?.autoCreateLedgers ?? true,
      include_line_items: includeLineItems,
      include_inventory_items: includeInventoryItems, // False enforces strict Accounting Voucher Mode
      gst_wise_summarized: true,
      educational_mode: options?.educationalMode ?? false,
      narration: options?.narration,
      port: targetPort,
      host: targetHost,
      tally_host: targetHost,
    },
    invoices: [
      {
        invoice: {
          invoice_number: invoice.invoiceNo,
          invoice_date: invoiceDateStr,
          entry_date: today,
          voucher_date: voucherDateStr,
          buyer_order_number: invoice.orderPoNo !== '—' ? invoice.orderPoNo : '',
          irn: invoice.rawPayload?.invoice?.irn || invoice.rawPayload?.irn || '',
        },
        seller: {
          name: invoice.vendor.name,
          gstin: invoice.vendor.gstin !== '—' ? invoice.vendor.gstin : '',
          address: invoice.vendor.address !== '—' ? invoice.vendor.address : '',
        },
        buyer: {
          name: invoice.buyer.name,
          gstin: invoice.buyer.gstin !== '—' ? invoice.buyer.gstin : '',
          address: invoice.buyer.address !== '—' ? invoice.buyer.address : '',
        },
        party_name: partyName,
        items,
        gst_groups: gstGroups,
        totals: {
          subtotal,
          cgst_total: cgst,
          sgst_total: sgst,
          igst_total: igst,
          round_off: roundOffDiff,
          grand_total: grandTotal,
        },
      },
    ],
  };

  try {
    const baseUrl = CONFIG.backendApiUrl.startsWith('http')
      ? CONFIG.backendApiUrl
      : `${window.location.origin}${CONFIG.backendApiUrl.startsWith('/') ? '' : '/'}${CONFIG.backendApiUrl}`;

    const url = new URL(`${baseUrl}/api/tally/write`);
    url.searchParams.set('host', targetHost);
    url.searchParams.set('port', String(targetPort));

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const resData = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errMsg = resData.errors?.[0] || resData.message || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errMsg);
    }

    const isSuccess = resData.success === true || resData.createdCount > 0;
    return {
      correlationId,
      status: isSuccess ? 'Created' : 'Failed',
      message: isSuccess
        ? (resData.message || `Successfully imported 1 voucher into Tally Prime.`)
        : resData.errors?.[0] || 'Tally returned an error.',
      voucherDate: resData.voucherDate || invoiceDateStr,
      voucherNumber: resData.voucherNumber || invoice.invoiceNo,
      company: resData.company || company,
      amount: resData.amount ?? grandTotal,
      targetSystem: `${targetHost}:${targetPort}`,
    };
  } catch (err: any) {
    console.error('Error posting to Tally:', err);
    throw new Error(formatOneLineError(err));
  }
}

export const exportToTally = postInvoiceToTally;

