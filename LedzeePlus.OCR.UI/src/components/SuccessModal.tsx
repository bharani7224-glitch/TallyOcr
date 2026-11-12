import React from 'react';
import type { VoucherResult } from '../types/invoice';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: VoucherResult | null;
  targetSystem: string;
  companyName: string;
  voucherNumber?: string;
  voucherDate?: string;
  amount?: string | number;
  partyLedger?: string;
}

export const SuccessModal: React.FC<SuccessModalProps> = ({
  isOpen,
  onClose,
  result,
  targetSystem,
  companyName,
  voucherNumber,
  voucherDate,
  amount,
  partyLedger,
}) => {
  if (!isOpen) return null;

  const displayTarget = result?.targetSystem || targetSystem || '—';
  const displayCompany = result?.company || companyName || '—';
  const displayVoucherNo = result?.voucherNumber || voucherNumber || '—';
  const displayVoucherDate = result?.voucherDate || voucherDate || '—';
  const displayAmount = result?.amount !== undefined ? result.amount : amount;

  const formattedAmount =
    displayAmount !== undefined && displayAmount !== null
      ? typeof displayAmount === 'number'
        ? displayAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : displayAmount
      : '0.00';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog-box" onClick={(e) => e.stopPropagation()}>
        <i
          className="bi bi-check-circle-fill"
          style={{
            fontSize: '48px',
            color: '#9fcc2e',
            marginBottom: '12px',
            display: 'inline-block',
          }}
        ></i>
        <h3>Voucher Synced to Tally!</h3>
        <p>
          {result?.message || 'Accounting voucher has been successfully posted to remote Tally Prime.'}
        </p>

        <div className="modal-detail-card" style={{ marginBottom: '16px' }}>
          <div className="modal-detail-row">
            <span style={{ color: '#666' }}>Target System (IP:Port):</span>
            <span style={{ fontWeight: 'bold', color: '#059669' }}>{displayTarget}</span>
          </div>
          <div className="modal-detail-row">
            <span style={{ color: '#666' }}>Voucher Number:</span>
            <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{displayVoucherNo}</span>
          </div>
          <div className="modal-detail-row">
            <span style={{ color: '#666' }}>Voucher Date:</span>
            <span style={{ fontWeight: 'bold', color: '#0b66c2' }}>{displayVoucherDate}</span>
          </div>
          <div className="modal-detail-row">
            <span style={{ color: '#666' }}>Company:</span>
            <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{displayCompany}</span>
          </div>
          {partyLedger && (
            <div className="modal-detail-row">
              <span style={{ color: '#666' }}>Party Ledger:</span>
              <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{partyLedger}</span>
            </div>
          )}
          <div className="modal-detail-row">
            <span style={{ color: '#666' }}>Amount:</span>
            <span style={{ fontWeight: 'bold', color: '#0b66c2' }}>₹ {formattedAmount}</span>
          </div>
        </div>

        <div
          style={{
            margin: '0 0 16px 0',
            padding: '10px 12px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
            fontSize: '11.5px',
            color: '#166534',
            textAlign: 'left',
            lineHeight: '1.4',
          }}
        >
          <i className="bi bi-info-circle-fill" style={{ marginRight: '6px', color: '#15803d' }}></i>
          <strong>Accounting Voucher View:</strong> In Tally Prime <strong>Day Book</strong>, press{' '}
          <strong>Alt + F2</strong> to set the period to cover <code>{displayVoucherDate}</code>, or check{' '}
          <em>Gateway of Tally &gt; Display More Reports &gt; Account Books &gt; Ledger &gt; {partyLedger || 'Party'}</em>.
        </div>

        <button type="button" className="btn-modal-close" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
};

export default SuccessModal;

