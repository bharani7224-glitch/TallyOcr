import React, { useMemo } from 'react';
import type { ExtractedInvoiceData, ParsedTallyHierarchy, TallyLedgerItem } from '../types/invoice';

export interface WriteTallyFormProps {
  invoiceData: ExtractedInvoiceData;
  targetSystem: string;
  onTargetSystemChange: (val: string) => void;
  companyName: string;
  onCompanyNameChange: (val: string) => void;
  availableCompanies: string[];
  voucherType: string;
  onVoucherTypeChange: (val: string) => void;
  partyLedger: string;
  onPartyLedgerChange: (val: string) => void;
  purchaseLedger: string;
  onPurchaseLedgerChange: (val: string) => void;
  cgstLedger: string;
  onCgstLedgerChange: (val: string) => void;
  sgstLedger: string;
  onSgstLedgerChange: (val: string) => void;
  igstLedger: string;
  onIgstLedgerChange: (val: string) => void;
  roundOffLedger: string;
  onRoundOffLedgerChange: (val: string) => void;
  educationalMode: boolean;
  onEducationalModeChange: (val: boolean) => void;
  hierarchyLedgers: ParsedTallyHierarchy;
  tallyParties: TallyLedgerItem[];
  isOnline: boolean;
  isWritingToTally: boolean;
  onSubmit: () => void;
  onTestConnection: () => void;
  isTestingConn: boolean;
}

export const WriteTallyForm: React.FC<WriteTallyFormProps> = ({
  invoiceData,
  targetSystem,
  onTargetSystemChange,
  companyName,
  onCompanyNameChange,
  availableCompanies,
  voucherType,
  onVoucherTypeChange,
  partyLedger,
  onPartyLedgerChange,
  purchaseLedger,
  onPurchaseLedgerChange,
  cgstLedger,
  onCgstLedgerChange,
  sgstLedger,
  onSgstLedgerChange,
  igstLedger,
  onIgstLedgerChange,
  roundOffLedger,
  onRoundOffLedgerChange,
  educationalMode,
  onEducationalModeChange,
  hierarchyLedgers,
  tallyParties,
  isOnline,
  isWritingToTally,
  onSubmit,
  onTestConnection,
  isTestingConn,
}) => {
  // Validate Target System (IP:Port)
  const validationError = useMemo(() => {
    if (!targetSystem || !targetSystem.trim()) {
      return 'Target System (IP:Port) is required (e.g. 192.23.2.18:9000)';
    }

    const parts = targetSystem.trim().split(':');
    if (parts.length !== 2) {
      return 'Format must be IP:Port (e.g. 192.23.2.18:9000)';
    }

    const ip = parts[0].trim();
    const portStr = parts[1].trim();

    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) {
      return 'Invalid IP address format. Expected e.g. 192.23.2.18';
    }

    const octets = ip.split('.').map(Number);
    const validOctets = octets.every((o) => o >= 0 && o <= 255);
    if (!validOctets) {
      return 'IP octets must be between 0 and 255';
    }

    const portNum = Number(portStr);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return 'Port must be a number between 1 and 65535';
    }

    return null;
  }, [targetSystem]);

  const isFormValid = !validationError && companyName.trim().length > 0 && isOnline;

  return (
    <div className="write-tally-form-root" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* 1. Target System Configuration Header */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '14px 16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: '#0b66c2',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            >
              1
            </span>
            <span style={{ fontSize: '13.5px', fontWeight: '700', color: '#1e293b' }}>
              Target System &amp; Company
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: '600',
                padding: '2px 8px',
                borderRadius: '10px',
                background: '#ecfdf5',
                color: '#059669',
                border: '1px solid #a7f3d0',
              }}
            >
              Strict Accounting Voucher
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: '600',
                color: isOnline ? '#16a34a' : '#dc2626',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: isOnline ? '#16a34a' : '#dc2626',
                }}
              ></span>
              {isOnline ? 'Tally Connected' : 'Tally Offline'}
            </span>

            <button
              type="button"
              onClick={onTestConnection}
              disabled={isTestingConn}
              style={{
                fontSize: '11.5px',
                padding: '3px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                color: '#334155',
                cursor: 'pointer',
              }}
              title="Test direct ping to Tally server"
            >
              {isTestingConn ? 'Testing...' : 'Test Ping'}
            </button>
          </div>
        </div>

        {/* 2-Column Grid: Target System & Company Name */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.3fr', gap: '12px' }}>
          {/* Target System (IP:Port) */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: '700',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '4px',
              }}
            >
              Target System (IP : Port) *
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={targetSystem}
                onChange={(e) => onTargetSystemChange(e.target.value)}
                placeholder="192.23.2.18:9000"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: validationError ? '1px solid #ef4444' : '1px solid #cbd5e1',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  fontWeight: '600',
                  color: '#0f172a',
                  background: '#ffffff',
                }}
              />
            </div>
            {validationError ? (
              <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '3px', fontWeight: '500' }}>
                <i className="bi bi-exclamation-circle" style={{ marginRight: '4px' }}></i>
                {validationError}
              </div>
            ) : (
              <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
                Default: 192.23.2.18:9000 (persisted in localStorage)
              </div>
            )}
          </div>

          {/* Company Name */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: '700',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '4px',
              }}
            >
              Company Name (in Tally) *
            </label>
            <div className="select-pill-control" style={{ width: '100%' }}>
              {availableCompanies.length > 0 ? (
                <select
                  value={companyName}
                  onChange={(e) => onCompanyNameChange(e.target.value)}
                  style={{ width: '100%', fontWeight: '600', color: '#0b66c2' }}
                >
                  <option value="">-- Select Target Company --</option>
                  {availableCompanies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => onCompanyNameChange(e.target.value)}
                  placeholder="e.g. Company Name"
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#0b66c2',
                  }}
                />
              )}
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
              Target active company inside remote Tally
            </div>
          </div>
        </div>

        {/* Educational Mode Toggle & Voucher Type Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            marginTop: '12px',
            paddingTop: '10px',
            borderTop: '1px dashed #e2e8f0',
          }}
        >
          {/* Voucher Type */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: '700',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '4px',
              }}
            >
              Voucher Type
            </label>
            <div className="select-pill-control" style={{ width: '100%' }}>
              <select
                value={voucherType}
                onChange={(e) => onVoucherTypeChange(e.target.value)}
                style={{ width: '100%', fontWeight: '600' }}
              >
                <option value="Purchase">Purchase</option>
                <option value="Sales">Sales</option>
                <option value="Payment">Payment</option>
                <option value="Journal">Journal</option>
              </select>
            </div>
          </div>

          {/* Educational Mode Toggle */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: '700',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '4px',
              }}
            >
              Educational Mode (Must Stay OFF)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={educationalMode}
                  onChange={(e) => onEducationalModeChange(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#0b66c2', cursor: 'pointer' }}
                />
                <span
                  style={{
                    marginLeft: '8px',
                    fontSize: '12.5px',
                    fontWeight: educationalMode ? '700' : '600',
                    color: educationalMode ? '#d97706' : '#059669',
                  }}
                >
                  {educationalMode ? 'ON (Forces Day = 1)' : 'OFF (Preserves Exact Invoice Date)'}
                </span>
              </label>
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
              When OFF, invoice date ({invoiceData.invoiceDate}) is preserved in Tally.
            </div>
          </div>
        </div>
      </div>

      {/* 2. Party & Ledger Mapping Card (Strict Accounting Voucher Entries) */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '14px 16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span
            style={{
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              background: '#0b66c2',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            2
          </span>
          <span style={{ fontSize: '13.5px', fontWeight: '700', color: '#1e293b' }}>
            Accounting Voucher Ledger Mapping
          </span>
        </div>

        {/* Party Ledger Row */}
        <div style={{ marginBottom: '12px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: '700',
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              marginBottom: '4px',
            }}
          >
            Party A/c Name (Sundry Creditor) *
          </label>
          <div className="select-pill-control" style={{ width: '100%' }}>
            <select
              value={partyLedger}
              onChange={(e) => onPartyLedgerChange(e.target.value)}
              style={{ width: '100%', fontWeight: '600' }}
            >
              {partyLedger &&
                !tallyParties.some((p) => p.name === partyLedger) &&
                !hierarchyLedgers.creditorLedgers.includes(partyLedger) && (
                  <option value={partyLedger}>{partyLedger} (Detected Vendor)</option>
                )}
              {tallyParties.length > 0 ? (
                tallyParties.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} {p.partyGstin ? `[GSTIN: ${p.partyGstin}]` : ''}
                  </option>
                ))
              ) : hierarchyLedgers.creditorLedgers.length > 0 ? (
                hierarchyLedgers.creditorLedgers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))
              ) : (
                invoiceData.vendor.name && <option value={invoiceData.vendor.name}>{invoiceData.vendor.name}</option>
              )}
            </select>
          </div>
        </div>

        {/* Accounting Voucher Line Entries: Purchase / Expense Ledger + Taxes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {/* Purchase Ledger (e.g. Machinery 18%) */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: '700',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '4px',
              }}
            >
              Purchase / Expense Ledger *
            </label>
            <div className="select-pill-control" style={{ width: '100%' }}>
              <select
                value={purchaseLedger}
                onChange={(e) => onPurchaseLedgerChange(e.target.value)}
                style={{ width: '100%', fontWeight: '600' }}
              >
                {hierarchyLedgers.purchaseLedgers.length > 0 ? (
                  hierarchyLedgers.purchaseLedgers.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))
                ) : (
                  <option value="Purchase Account">Purchase Account</option>
                )}
                {purchaseLedger &&
                  !hierarchyLedgers.purchaseLedgers.includes(purchaseLedger) &&
                  purchaseLedger !== 'Purchase Account' && (
                    <option value={purchaseLedger}>{purchaseLedger}</option>
                  )}
              </select>
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
              Taxable Amount: ₹ {invoiceData.subtotal}
            </div>
          </div>

          {/* CGST Ledger */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: '700',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '4px',
              }}
            >
              CGST Ledger (e.g. Input CGST @ 9%)
            </label>
            <div className="select-pill-control" style={{ width: '100%' }}>
              <select
                value={cgstLedger}
                onChange={(e) => onCgstLedgerChange(e.target.value)}
                style={{ width: '100%' }}
              >
                {hierarchyLedgers.cgstLedgers.length > 0 ? (
                  hierarchyLedgers.cgstLedgers.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="Input CGST @ 9%">Input CGST @ 9%</option>
                    <option value="CGST">CGST</option>
                  </>
                )}
                {cgstLedger &&
                  !hierarchyLedgers.cgstLedgers.includes(cgstLedger) &&
                  cgstLedger !== 'Input CGST @ 9%' &&
                  cgstLedger !== 'CGST' && <option value={cgstLedger}>{cgstLedger}</option>}
              </select>
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
              CGST Amount: ₹ {invoiceData.cgst || '0.00'}
            </div>
          </div>

          {/* SGST Ledger */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: '700',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '4px',
              }}
            >
              SGST Ledger (e.g. Input SGST @ 9%)
            </label>
            <div className="select-pill-control" style={{ width: '100%' }}>
              <select
                value={sgstLedger}
                onChange={(e) => onSgstLedgerChange(e.target.value)}
                style={{ width: '100%' }}
              >
                {hierarchyLedgers.sgstLedgers.length > 0 ? (
                  hierarchyLedgers.sgstLedgers.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="Input SGST @ 9%">Input SGST @ 9%</option>
                    <option value="SGST">SGST</option>
                  </>
                )}
                {sgstLedger &&
                  !hierarchyLedgers.sgstLedgers.includes(sgstLedger) &&
                  sgstLedger !== 'Input SGST @ 9%' &&
                  sgstLedger !== 'SGST' && <option value={sgstLedger}>{sgstLedger}</option>}
              </select>
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
              SGST Amount: ₹ {invoiceData.sgst || '0.00'}
            </div>
          </div>

          {/* IGST Ledger */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: '700',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '4px',
              }}
            >
              IGST Ledger (e.g. Input IGST @ 18%)
            </label>
            <div className="select-pill-control" style={{ width: '100%' }}>
              <select
                value={igstLedger}
                onChange={(e) => onIgstLedgerChange(e.target.value)}
                style={{ width: '100%' }}
              >
                {hierarchyLedgers.igstLedgers.length > 0 ? (
                  hierarchyLedgers.igstLedgers.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="Input IGST @ 18%">Input IGST @ 18%</option>
                    <option value="IGST">IGST</option>
                  </>
                )}
                {igstLedger &&
                  !hierarchyLedgers.igstLedgers.includes(igstLedger) &&
                  igstLedger !== 'Input IGST @ 18%' &&
                  igstLedger !== 'IGST' && <option value={igstLedger}>{igstLedger}</option>}
              </select>
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
              IGST Amount: ₹ {invoiceData.igst || '0.00'}
            </div>
          </div>

          {/* Round Off */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: '700',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                marginBottom: '4px',
              }}
            >
              Round Off / Balancing Ledger
            </label>
            <div className="select-pill-control" style={{ width: '100%' }}>
              <select
                value={roundOffLedger}
                onChange={(e) => onRoundOffLedgerChange(e.target.value)}
                style={{ width: '100%' }}
              >
                {hierarchyLedgers.roundOffLedgers.length > 0 ? (
                  hierarchyLedgers.roundOffLedgers.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))
                ) : (
                  <option value="Round Off">Round Off</option>
                )}
              </select>
            </div>
            <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
              Total Voucher Amount: ₹ {invoiceData.payable}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Action Section: Write to Tally Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
        <button
          type="button"
          className="btn-tally-combined-pill"
          onClick={onSubmit}
          disabled={!isFormValid || isWritingToTally}
          style={
            !isFormValid || isWritingToTally
              ? { opacity: 0.55, cursor: 'not-allowed' }
              : { cursor: 'pointer' }
          }
          title={
            validationError
              ? validationError
              : !companyName
              ? 'Please select or enter a Company Name'
              : !isOnline
              ? 'Tally is offline'
              : `Write Accounting Voucher to ${targetSystem}`
          }
        >
          <div className="tally-pill-logo">
            <span className="tally-pill-logo-txt">Tally</span>
          </div>
          <div className="tally-pill-divider"></div>
          <div className="tally-pill-action">
            <i
              className={`bi ${
                isWritingToTally ? 'bi-hourglass-split' : 'bi-cloud-arrow-up'
              }`}
            ></i>
            <span>
              {isWritingToTally
                ? `Posting to ${targetSystem}...`
                : 'Write to Tally (Accounting Voucher)'}
            </span>
            <i className="bi bi-chevron-right"></i>
          </div>
        </button>
      </div>
    </div>
  );
};

export default WriteTallyForm;
