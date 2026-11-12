import React from 'react';

/**
 * Clean, minimal ambient background with subtle dual-tone (OCR Lime + Tally Blue)
 * atmospheric waves and optical light sweep.
 */
export const UploadAmbientBg: React.FC = () => {
  return (
    <div className="ocr-ambient-bg" aria-hidden="true">
      <div className="ambient-dot-grid" />
      <div className="ambient-aura ambient-aura-left" />
      <div className="ambient-aura ambient-aura-right" />
      <div className="ambient-horizon-sweep" />
    </div>
  );
};

/**
 * Simple, clear 3-step animated workflow bar:
 * Invoice Upload -> OCR Extract -> Tally Sync
 */
export const UploadWorkflowVisual: React.FC = () => {
  return (
    <div className="upload-workflow-strip" aria-hidden="true">
      {/* Step 1: Invoice Upload */}
      <div className="wf-step wf-step-1">
        <div className="wf-icon-box">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <path className="wf-arrow-up" d="M12 17v-5m-2.5 2.5L12 12l2.5 2.5" />
          </svg>
        </div>
        <div className="wf-text">
          <span className="wf-title">Upload Invoice</span>
          <span className="wf-sub">PDF / Image Bill</span>
        </div>
      </div>

      {/* Connector 1 -> 2 */}
      <div className="wf-connector wf-conn-1">
        <span className="wf-track" />
        <span className="wf-pulse" />
      </div>

      {/* Step 2: OCR Extraction (with animated scan beam inside icon) */}
      <div className="wf-step wf-step-2">
        <div className="wf-icon-box wf-icon-ocr">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            <line x1="7" y1="9" x2="17" y2="9" opacity="0.45" />
            <line x1="7" y1="15" x2="14" y2="15" opacity="0.45" />
            <line className="wf-scan-line" x1="5" y1="12" x2="19" y2="12" strokeWidth="2.2" />
          </svg>
        </div>
        <div className="wf-text">
          <span className="wf-title">Smart OCR Extract</span>
          <span className="wf-sub">Items, GST &amp; Totals</span>
        </div>
      </div>

      {/* Connector 2 -> 3 */}
      <div className="wf-connector wf-conn-2">
        <span className="wf-track" />
        <span className="wf-pulse" />
      </div>

      {/* Step 3: Tally Sync */}
      <div className="wf-step wf-step-3">
        <div className="wf-icon-box wf-icon-tally">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <path d="M7 9h10" opacity="0.45" />
            <path className="wf-check-draw" d="M8.5 14l2.2 2.2 4.8-4.7" strokeWidth="2.2" />
          </svg>
        </div>
        <div className="wf-text">
          <span className="wf-title">Sync to Tally</span>
          <span className="wf-sub">Auto Ledger Voucher</span>
        </div>
      </div>
    </div>
  );
};
