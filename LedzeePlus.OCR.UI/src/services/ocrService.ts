import { CONFIG } from './config';
import type { ExtractedInvoiceData, LineItem } from '../types/invoice';

/**
 * Normalizes raw OCR response from http://192.23.2.41:1010/extract into UI-ready ExtractedInvoiceData
 */
export function normalizeOcrResponse(raw: any, fileName: string): ExtractedInvoiceData {
  const inv = raw?.invoices?.[0] || raw?.invoice || raw || {};
  const invMeta = inv.invoice || {};
  const seller = inv.seller || inv.vendor || {};
  const buyer = inv.buyer || {};
  const totals = inv.totals || {};
  const rawItems: any[] = inv.items || [];

  const items: LineItem[] = rawItems.map((it: any, idx: number) => ({
    sno: Number(it.serial_number || idx + 1),
    description: it.description || 'Item ' + (idx + 1),
    hsnSac: it.hsn_sac || '—',
    qty: it.quantity != null ? `${it.quantity}` : '1',
    rate: Number(it.unit_price || it.rate || 0),
    taxable: Number(it.taxable_value || it.taxable || 0),
    total: Number(it.line_total || it.total || (it.taxable_value || 0) + (it.cgst_amount || 0) + (it.sgst_amount || 0) + (it.igst_amount || 0)),
    cgstRate: it.cgst_rate != null ? Number(it.cgst_rate) : undefined,
    sgstRate: it.sgst_rate != null ? Number(it.sgst_rate) : undefined,
    igstRate: it.igst_rate != null ? Number(it.igst_rate) : undefined,
  }));

  const subtotal = totals.subtotal != null ? Number(totals.subtotal).toFixed(2) :
    items.reduce((acc, item) => acc + (item.taxable || item.total), 0).toFixed(2);

  const cgst = totals.cgst_total != null ? Number(totals.cgst_total).toFixed(2) : '0.00';
  const sgst = totals.sgst_total != null ? Number(totals.sgst_total).toFixed(2) : '0.00';
  const igst = totals.igst_total != null ? Number(totals.igst_total).toFixed(2) : '0.00';
  const totalTax = totals.tax_total != null ? Number(totals.tax_total).toFixed(2) :
    (Number(cgst) + Number(sgst) + Number(igst)).toFixed(2);

  const grandTotal = totals.grand_total != null ? Number(totals.grand_total).toFixed(2) :
    (Number(subtotal) + Number(totalTax)).toFixed(2);

  const payable = grandTotal;

  // Format date DD/MM/YYYY or keep readable
  const rawDate = invMeta.invoice_date || '';
  let invoiceDate = rawDate;
  if (rawDate.includes('-')) {
    const parts = rawDate.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        invoiceDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      } else {
        invoiceDate = `${parts[0]}/${parts[1]}/${parts[2]}`;
      }
    }
  }

  const today = new Date();
  const entryDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  return {
    invoiceNo: invMeta.invoice_number || '—',
    invoiceDate: invoiceDate || entryDate,
    entryDate,
    orderPoNo: invMeta.buyer_order_number || invMeta.reference_number || '—',
    currency: totals.currency || 'INR',
    vendor: {
      name: seller.name || '—',
      gstin: seller.gstin || '—',
      address: seller.address || (seller.state ? `${seller.state}, India` : '—'),
    },
    buyer: {
      name: buyer.name || '—',
      gstin: buyer.gstin || '—',
      address: buyer.billing_address || buyer.address || (buyer.state ? `${buyer.state}, India` : '—'),
    },
    items,
    subtotal,
    cgst,
    sgst,
    igst,
    totalTax,
    grandTotal,
    payable,
    confidence: Number(raw.extraction_confidence || 95.0),
    fileName,
    uploadedAt: new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }),
    rawPayload: raw,
  };
}

/**
 * Uploads an invoice document to the Python OCR service
 */
export async function uploadAndExtractInvoice(
  file: File,
  onProgress?: (step: number, text: string) => void
): Promise<ExtractedInvoiceData> {
  const formData = new FormData();
  formData.append('file', file);

  onProgress?.(1, 'Uploading invoice file to server...');

  // Start visual progression while the VLM processes
  const timer1 = setTimeout(() => {
    onProgress?.(2, 'Scanning document header, Vendor & Buyer details...');
  }, 3000);

  const timer2 = setTimeout(() => {
    onProgress?.(3, 'Extracting tabular line items & calculating GST breakdown...');
  }, 12000);

  const timer3 = setTimeout(() => {
    onProgress?.(4, 'AI Vision Model analyzing ledgers & totals...');
  }, 30000);

  try {
    const response = await fetch(CONFIG.ocrExtractUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`OCR service failed with status ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return normalizeOcrResponse(data, file.name);
  } finally {
    clearTimeout(timer1);
    clearTimeout(timer2);
    clearTimeout(timer3);
  }
}

