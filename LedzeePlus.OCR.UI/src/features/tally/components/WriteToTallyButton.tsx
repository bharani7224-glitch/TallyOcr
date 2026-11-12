import React from 'react';
import type { WriteToTallyButtonProps } from '../types/tallyExport.types';
import { useTallyExport } from '../hooks/useTallyExport';
import { TallyLogoBadge } from './TallyLogoBadge';

export const WriteToTallyButton: React.FC<WriteToTallyButtonProps> = ({
  invoice,
  options = {},
  variant = 'primary',
  className = '',
  disabled = false,
  isGstMapped: isGstMappedProp,
  onSuccess,
  onError,
  onClick,
}) => {
  const {
    canExport,
    isExporting,
    isConnected,
    isGstMapped: hookGstMapped,
    unmetReasons,
    handleExport,
  } = useTallyExport(invoice, options);

  const effectiveGstMapped = isGstMappedProp !== undefined ? isGstMappedProp : hookGstMapped;
  const isCompact = variant === 'compact' || variant === 'table-action';
  const isActuallyDisabled = disabled || isExporting || !effectiveGstMapped || (!onClick && !canExport);

  // Determine State
  let buttonState: 'offline' | 'not_mapped' | 'mapped' | 'exporting' = 'not_mapped';
  if (isExporting) {
    buttonState = 'exporting';
  } else if (!isConnected) {
    buttonState = 'offline';
  } else if (effectiveGstMapped) {
    buttonState = 'mapped';
  } else {
    buttonState = 'not_mapped';
  }

  // Tooltip resolution
  let tooltipText = `Write invoice [${invoice?.invoiceNo || 'Voucher'}] to Tally Prime`;
  if (isExporting) {
    tooltipText = 'Writing voucher to Tally Prime...';
  } else if (!isConnected) {
    tooltipText = 'Cannot write: Tally is not connected on port 9000';
  } else if (!effectiveGstMapped) {
    tooltipText = unmetReasons.find((r) => r.includes('GST')) ||
      'Cannot write: GSTIN mismatch across Tally company, Bill, and logged-in user';
  }

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isActuallyDisabled) return;

    if (onClick) {
      onClick();
      return;
    }

    try {
      const res = await handleExport();
      if (res && onSuccess) {
        onSuccess(res);
      }
    } catch (err: any) {
      if (onError) {
        onError(err);
      }
    }
  };

  // State-specific styling: Dark Blue (#0b66c2) when mapped, Light (#d8e2eb) when not mapped
  const isDarkBlue = effectiveGstMapped;
  const containerBg = isDarkBlue ? '#0b66c2' : '#d8e2eb';
  const containerBorder = 'none';
  const textColor = '#ffffff';

  return (
    <button
      type="button"
      className={`btn-tally-combined-pill ${isDarkBlue ? 'mapped' : 'not-mapped'} ${buttonState} ${isCompact ? 'compact' : ''} ${className}`.trim()}
      onClick={handleClick}
      disabled={isActuallyDisabled}
      title={tooltipText}
      aria-label={tooltipText}
      style={{
        background: containerBg,
        border: containerBorder,
        borderRadius: '9999px',
        padding: isCompact ? '2px 10px 2px 3px' : '3.5px 14px 3.5px 4.5px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: isCompact ? '6px' : '8px',
        cursor: isActuallyDisabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
        userSelect: 'none',
        height: isCompact ? '30px' : '35px',
        boxShadow: isDarkBlue ? '0 2px 8px rgba(11, 102, 194, 0.35)' : 'none',
        boxSizing: 'border-box',
      }}
    >
      {/* Tally Brand Badge (White rounded box with official logo) */}
      <TallyLogoBadge variant={isCompact ? 'compact' : 'default'} />

      {/* Thin Vertical Divider */}
      <div
        className="tally-pill-divider"
        style={{
          width: '1px',
          height: isCompact ? '13px' : '15px',
          background: 'rgba(255, 255, 255, 0.65)',
        }}
      />

      {/* Action Text & Outlined Cloud Icon */}
      <div
        className="tally-pill-action"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: isCompact ? '5px' : '6px',
          color: textColor,
          fontSize: isCompact ? '11.5px' : '13px',
          fontWeight: 700,
          letterSpacing: '-0.1px',
          lineHeight: 1,
        }}
      >
        {isExporting ? (
          <svg
            className="animate-spin"
            width={isCompact ? '13' : '15'}
            height={isCompact ? '13' : '15'}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          /* Exact outlined cloud with upward arrow */
          <svg
            width={isCompact ? '14' : '16'}
            height={isCompact ? '14' : '16'}
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
            style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
          >
            <path
              fillRule="evenodd"
              d="M7.646 5.146a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1-.708.708L8.5 6.707V10.5a.5.5 0 0 1-1 0V6.707L6.354 7.854a.5.5 0 1 1-.708-.708l2-2z"
            />
            <path d="M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.723 1.464-2.383zm.653.757c-.757.653-1.153 1.44-1.153 2.056v.448l-.445.049C2.064 6.805 1 7.952 1 9.318 1 10.785 2.23 12 3.781 12h8.906C13.98 12 15 10.988 15 9.773c0-1.216-1.02-2.228-2.313-2.228h-.5v-.5C12.188 4.825 10.328 3 8 3a4.53 4.53 0 0 0-2.941 1.1z" />
          </svg>
        )}

        <span>
          {isExporting ? 'Writing to Tally...' : 'Write to Tally'}
        </span>

        {/* Chevron Right */}
        <svg
          width={isCompact ? '10' : '11'}
          height={isCompact ? '10' : '11'}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '3px', flexShrink: 0 }}
        >
          <path d="M5.5 3.5l4.5 4.5-4.5 4.5" />
        </svg>
      </div>
    </button>
  );
};

export default WriteToTallyButton;

