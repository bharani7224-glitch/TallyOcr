import React, { useRef, useState } from 'react';
import type { ExtractedInvoiceData } from '../types/invoice';
import { uploadAndExtractInvoice } from '../services/ocrService';
import { UploadAmbientBg, UploadWorkflowVisual } from './UploadAmbientBg';

interface UploadProps {
  onUploadComplete: (data: ExtractedInvoiceData) => void;
}

export function Upload({ onUploadComplete }: UploadProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [procProgress, setProcProgress] = useState(15);
  const [procStep, setProcStep] = useState(1);
  const [procStatusText, setProcStatusText] = useState('Uploading invoice file to server...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processFile = async (file: File) => {
    setIsDragOver(false);
    setIsProcessing(true);
    setErrorMessage(null);
    setProcProgress(20);
    setProcStep(1);
    setProcStatusText('Uploading invoice file to OCR service...');

    // Progress animation ticker
    const interval = setInterval(() => {
      setProcProgress((prev) => {
        if (prev < 90) return prev + 3;
        return prev;
      });
    }, 2000);

    try {
      const extractedData = await uploadAndExtractInvoice(file, (step, text) => {
        setProcStep(step);
        setProcStatusText(text);
        setProcProgress(step * 25);
      });

      clearInterval(interval);
      setProcProgress(100);
      setProcStep(4);
      setProcStatusText('Data extraction complete! Preparing workspace...');

      setTimeout(() => {
        setIsProcessing(false);
        onUploadComplete(extractedData);
      }, 500);
    } catch (err: any) {
      clearInterval(interval);
      setIsProcessing(false);
      console.error('Invoice processing error:', err);
      setErrorMessage(err.message || 'Failed to extract invoice data. Please verify OCR service connection.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <>
      {!isProcessing ? (
        <div className="upload-center-container">
          <UploadAmbientBg />
          <div className="upload-card">
            <div className="upload-header-banner">
              <h2>
                <i className="bi bi-file-earmark-arrow-up me-2"></i> Document &amp; Invoice Processing
              </h2>
              <p>Upload purchase bills, vouchers, or tax invoices to automatically extract data and sync directly with Tally.</p>
            </div>

            {errorMessage && (
              <div style={{
                margin: '16px 24px 0 24px',
                padding: '12px 16px',
                backgroundColor: '#fff1f0',
                border: '1px solid #ffccc7',
                borderRadius: '8px',
                color: '#cf1322',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
              }}>
                <i className="bi bi-exclamation-octagon-fill" style={{ fontSize: '18px' }}></i>
                <div style={{ flex: 1 }}>{errorMessage}</div>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cf1322' }}
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
            )}

            {/* Drag & Drop Zone */}
            <div
              className={`dropzone-area ${isDragOver ? 'dragover' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!isDragOver) setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              <div className="dropzone-icon-circle">
                <i className="bi bi-cloud-arrow-up"></i>
              </div>
              <div className="dropzone-title">Click to browse or drag &amp; drop invoice document here</div>
              <div className="dropzone-sub">Supported formats: PDF, PNG, JPG, JPEG (Up to 15MB)</div>
              <button type="button" className="btn-browse">
                <i className="bi bi-folder2-open"></i> Browse Document
              </button>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*,application/pdf"
                onChange={handleFileChange}
              />
            </div>
          </div>

          <UploadWorkflowVisual />
        </div>
      ) : (
        <div className="processing-center-container">
          <UploadAmbientBg />
          <div className="processing-card">
            <div
              className="ocr-reticle-loader"
              role="progressbar"
              aria-valuenow={procProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="OCR Processing Progress"
            >
              {/* Inner project-green waterfill circle */}
              <div className="ocr-inner-circle-fill" aria-hidden="true">
                <div
                  className="water-level"
                  style={{ transform: `translateY(${100 - procProgress}%)` }}
                >
                  <div className="water-wave water-wave-back" />
                  <div className="water-wave water-wave-front" />
                </div>
              </div>

              {/* Viewfinder brackets + crosshair target rings + crisp OCR text */}
              <svg
                className="ocr-reticle-svg"
                viewBox="0 0 120 120"
                fill="none"
                aria-hidden="true"
              >
                {/* 4 Rounded Viewfinder Corner Brackets */}
                <g className="ocr-reticle-brackets" stroke="#84b819" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 27V16a4 4 0 0 1 4-4h11" />
                  <path d="M93 12h11a4 4 0 0 1 4 4v11" />
                  <path d="M108 93v11a4 4 0 0 1-4 4H93" />
                  <path d="M27 108H16a4 4 0 0 1-4-4V93" />
                </g>

                {/* Outer Crosshair Circle + 4 Ticks */}
                <g className="ocr-reticle-outer" stroke="#0f172a" strokeWidth="2.4" strokeLinecap="round">
                  <circle cx="60" cy="60" r="36" />
                  <line x1="60" y1="19" x2="60" y2="28" />
                  <line x1="60" y1="92" x2="60" y2="101" />
                  <line x1="19" y1="60" x2="28" y2="60" />
                  <line x1="92" y1="60" x2="101" y2="60" />
                </g>

                {/* Inner Segmented Circle */}
                <g className="ocr-reticle-inner" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round">
                  <circle
                    cx="60"
                    cy="60"
                    r="28.5"
                    strokeDasharray="62 11 40 12 44 10"
                  />
                </g>
              </svg>

              <span className="ocr-center-word">OCR</span>
            </div>
            <h3 className="proc-title">Processing Document...</h3>
            <p className="proc-subtitle">{procStatusText}</p>

            <div className="proc-bar-bg">
              <div className="proc-bar-fill" style={{ width: `${procProgress}%` }}></div>
            </div>

            <div className="proc-steps-list">
              <div className={`proc-step-row ${procStep === 1 ? 'active' : procStep > 1 ? 'done' : ''}`}>
                <i className={`step-icon bi ${procStep > 1 ? 'bi-check-circle-fill' : 'bi-circle'}`}></i>
                <span>1. Uploading invoice file to server</span>
              </div>
              <div className={`proc-step-row ${procStep === 2 ? 'active' : procStep > 2 ? 'done' : ''}`}>
                <i className={`step-icon bi ${procStep > 2 ? 'bi-check-circle-fill' : 'bi-circle'}`}></i>
                <span>2. Scanning document header, vendor &amp; buyer information</span>
              </div>
              <div className={`proc-step-row ${procStep === 3 ? 'active' : procStep > 3 ? 'done' : ''}`}>
                <i className={`step-icon bi ${procStep > 3 ? 'bi-check-circle-fill' : 'bi-circle'}`}></i>
                <span>3. Extracting tabular line items and calculating GST breakdown</span>
              </div>
              <div className={`proc-step-row ${procStep === 4 ? 'active' : procStep > 4 ? 'done' : ''}`}>
                <i className={`step-icon bi ${procStep > 4 ? 'bi-check-circle-fill' : 'bi-circle'}`}></i>
                <span>4. AI Vision Model mapping ledgers &amp; preparing Tally voucher</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Upload;
