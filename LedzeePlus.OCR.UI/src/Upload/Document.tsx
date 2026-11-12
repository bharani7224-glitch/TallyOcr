import { useState, useEffect } from 'react';
import type {
  ExtractedInvoiceData,
  VoucherResult,
  TallyStatusResponse,
  TallyLedgerItem,
  TallyCompanyItem,
  ParsedTallyHierarchy,
} from '../types/invoice';
import {
  getTallyParties,
  postInvoiceToTally,
  testTallyConnection,
  getLedgerHierarchy,
  parseTallyHierarchy,
  formatOneLineError,
  detectClientLocalIp,
} from '../services/tallyService';
import { SuccessModal } from '../components/SuccessModal';
import { UniqueSelect, type SelectOption } from './UniqueSelect';
import { NeatDatePicker } from './NeatDatePicker';
import { WriteToTallyButton } from '../features/tally';
import { authService } from '../services/authService';

interface DocumentProps {
  data?: ExtractedInvoiceData | null;
  onBack?: () => void;
}

// Strict live workspace: displays only real OCR-extracted data and live Tally API entities
export function Document({ data, onBack }: DocumentProps) {
  if (!data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', gap: '16px', color: '#555' }}>
        <i className="bi bi-file-earmark-arrow-up" style={{ fontSize: '48px', color: '#9fcc2e' }}></i>
        <h2 style={{ margin: 0, fontWeight: '600' }}>No Invoice Data Available</h2>
        <p style={{ margin: 0, color: '#888' }}>Please upload an invoice first to extract its contents and sync with Tally.</p>
        <button
          onClick={onBack}
          style={{ padding: '10px 24px', cursor: 'pointer', backgroundColor: '#9fcc2e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
        >
          Upload Invoice
        </button>
      </div>
    );
  }

  const invoiceData = data;

  // Tab state
  const [activeTab, setActiveTab] = useState<'invoice' | 'docinfo'>('invoice');
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Tally live connection state
  const [tallyStatus, setTallyStatus] = useState<TallyStatusResponse>({
    isOnline: false,
    companies: [],
    activeCompany: '',
  });
  const [selectedCompany, setSelectedCompany] = useState<string>(
    () => localStorage.getItem('tally_selected_company') || ''
  );
  const [selectedPartyLedger, setSelectedPartyLedger] = useState<string>(invoiceData.vendor.name || '');
  const [tallyParties, setTallyParties] = useState<TallyLedgerItem[]>([]);
  const [isTallyMapped, setIsTallyMapped] = useState(false);
  const [isWritingToTally, setIsWritingToTally] = useState(false);
  const [showTallyModal, setShowTallyModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showTallyConfig, setShowTallyConfig] = useState(false);

  // Connection settings with persistent localStorage
  const [tallyHost, setTallyHost] = useState(() => localStorage.getItem('tally_host') || '127.0.0.1');
  const [tallyPort, setTallyPort] = useState(() => localStorage.getItem('tally_port') || '9000');
  const [targetSystem, setTargetSystem] = useState<string>(() => localStorage.getItem('tally_target_system') || '127.0.0.1:9000');
  const [educationalMode, setEducationalMode] = useState<boolean>(false);
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastVoucherResult, setLastVoucherResult] = useState<VoucherResult | null>(null);

  // Verified Company GSTIN & latency from test-connection
  const [companyGstin, setCompanyGstin] = useState<string>('');
  const [connectionLatency, setConnectionLatency] = useState<number>(0);
  const [connectionErrorMsg, setConnectionErrorMsg] = useState<string | null>(null);
  const [availableCompaniesWithDetails, setAvailableCompaniesWithDetails] = useState<TallyCompanyItem[]>([]);

  // Dynamic Ledger State from Hierarchy
  const [selectedPurchaseLedger, setSelectedPurchaseLedger] = useState<string>('');
  const [selectedCgstLedger, setSelectedCgstLedger] = useState<string>('');
  const [selectedSgstLedger, setSelectedSgstLedger] = useState<string>('');
  const [selectedIgstLedger, setSelectedIgstLedger] = useState<string>('');
  const [selectedRoundOffLedger, setSelectedRoundOffLedger] = useState<string>('');
  const [ledgerGroup, setLedgerGroup] = useState<string>('Sundry Creditors');
  const [purchaseGroup, setPurchaseGroup] = useState<string>('Purchase Accounts');
  const [taxGroup, setTaxGroup] = useState<string>('Duties & Taxes');
  const [roundOffGroup, setRoundOffGroup] = useState<string>('Indirect Expenses');
  const [invoiceDate, setInvoiceDate] = useState<string>(
    (invoiceData.invoiceDate || new Date().toLocaleDateString('en-GB')).replace(/-/g, '/')
  );
  const [entryDate, setEntryDate] = useState<string>(
    (invoiceData.entryDate || new Date().toLocaleDateString('en-GB')).replace(/-/g, '/')
  );
  const [invoiceNo, setInvoiceNo] = useState<string>(invoiceData.invoiceNo || '');
  const [orderPoNo, setOrderPoNo] = useState<string>(invoiceData.orderPoNo || '');
  const [purchaseAmount, setPurchaseAmount] = useState<string>(
    invoiceData.subtotal != null ? String(Number(invoiceData.subtotal || 0).toFixed(2)) : '0.00'
  );
  const [cgstAmount, setCgstAmount] = useState<string>(
    invoiceData.cgst != null ? String(Number(invoiceData.cgst || 0).toFixed(2)) : '0.00'
  );
  const [sgstAmount, setSgstAmount] = useState<string>(
    invoiceData.sgst != null ? String(Number(invoiceData.sgst || 0).toFixed(2)) : '0.00'
  );
  const [igstAmount, setIgstAmount] = useState<string>(
    invoiceData.igst != null ? String(Number(invoiceData.igst || 0).toFixed(2)) : '0.00'
  );
  const initialRoundOff = Number(
    (Number(parseFloat(invoiceData.grandTotal) || 0) -
      (Number(parseFloat(invoiceData.subtotal) || 0) +
        Number(parseFloat(invoiceData.cgst) || 0) +
        Number(parseFloat(invoiceData.sgst) || 0) +
        Number(parseFloat(invoiceData.igst) || 0))).toFixed(2)
  );
  const [roundOffAmount, setRoundOffAmount] = useState<string>(
    isNaN(initialRoundOff) ? '0.00' : String(initialRoundOff.toFixed(2))
  );

  const [voucherType, setVoucherType] = useState<string>('Purchase');
  const [includeLineItems, setIncludeLineItems] = useState<boolean>(true);
  const [includePurchase, setIncludePurchase] = useState<boolean>(true);
  const [includeCgst, setIncludeCgst] = useState<boolean>(Number(invoiceData.cgst || 0) > 0);
  const [includeSgst, setIncludeSgst] = useState<boolean>(Number(invoiceData.sgst || 0) > 0);
  const [includeIgst, setIncludeIgst] = useState<boolean>(Number(invoiceData.igst || 0) > 0);
  const [includeRoundOff, setIncludeRoundOff] = useState<boolean>(true);
  const [narration, setNarration] = useState<string>('');
  const [mobileActiveCard, setMobileActiveCard] = useState<'both' | 'extract' | 'tally'>('both');

  // Live dynamic totals calculated from user-editable fields
  const calcPurchase = parseFloat(purchaseAmount) || 0;
  const calcCgst = includeCgst ? (parseFloat(cgstAmount) || 0) : 0;
  const calcSgst = includeSgst ? (parseFloat(sgstAmount) || 0) : 0;
  const calcIgst = includeIgst ? (parseFloat(igstAmount) || 0) : 0;
  const calcRoundOff = includeRoundOff ? (parseFloat(roundOffAmount) || 0) : 0;
  const calcPayable = (calcPurchase + calcCgst + calcSgst + calcIgst + calcRoundOff).toFixed(2);
  const [, setIsLoadingHierarchy] = useState(false);
  const [hierarchyLedgers, setHierarchyLedgers] = useState<ParsedTallyHierarchy>({
    purchaseLedgers: [],
    salesLedgers: [],
    dutiesAndTaxes: [],
    cgstLedgers: [],
    sgstLedgers: [],
    igstLedgers: [],
    roundOffLedgers: [],
    creditorLedgers: [],
    allLedgers: [],
  });

  // 3-Way GST Matching Logic:
  // 1) If both GSTINs in extracted invoice are null/empty/not provided -> Allow user to select company and post entry!
  // 2) Otherwise -> Tally Company GSTIN, Bill GSTIN (Buyer or Seller), and Logged-in User GSTIN (from users.json) MUST ALL 3 MATCH!
  const cleanGst = (gst?: string | null) => {
    const s = (gst || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return s === '—' || s === 'NA' || s === 'NONE' || s === 'NULL' ? '' : s;
  };

  const activeCompanyGstin = cleanGst(
    companyGstin ||
    availableCompaniesWithDetails.find((c) => c.companyName === selectedCompany)?.gstin
  );

  const vendorGstClean = cleanGst(invoiceData.vendor?.gstin);
  const buyerGstClean = cleanGst(invoiceData.buyer?.gstin);
  const isInvoiceNonGst = !vendorGstClean && !buyerGstClean;

  const currentUser = authService.getCurrentUser();
  const userGstClean = cleanGst(currentUser?.gstin);

  const matchedBillGst =
    buyerGstClean && buyerGstClean === activeCompanyGstin
      ? buyerGstClean
      : vendorGstClean && vendorGstClean === activeCompanyGstin
      ? vendorGstClean
      : '';

  const billGstMatches = Boolean(matchedBillGst);

  const isAllThreeMatched = Boolean(
    activeCompanyGstin &&
    userGstClean &&
    activeCompanyGstin === userGstClean &&
    billGstMatches
  );

  const isGstMatched = Boolean(
    tallyStatus.isOnline &&
    selectedCompany &&
    (isInvoiceNonGst || isAllThreeMatched)
  );

  const runTestConnection = async (hostOverride?: string, portOverride?: string) => {
    const h = hostOverride !== undefined ? hostOverride : tallyHost;
    const p = portOverride !== undefined ? portOverride : tallyPort;
    setIsTestingConn(true);
    setConnectionErrorMsg(null);
    try {
      const resp = await testTallyConnection(h, Number(p) || 9000, selectedCompany);
      const data = resp.data;
      if (resp.success && data?.connected) {
        localStorage.setItem('tally_host', h);
        localStorage.setItem('tally_port', p);

        const cos = data.availableCompanies?.map((c) => c.companyName) || [];
        const activeCo = data.companyName || cos[0] || '';

        setTallyStatus({
          isOnline: true,
          companies: cos,
          activeCompany: activeCo,
          connectorName: 'TallyPrime Server',
        });
        setAvailableCompaniesWithDetails(data.availableCompanies || []);

        // Automatic company selection if GST matches an open company (Buyer or Seller)
        const matched = data.availableCompanies?.find(
          (c) => c.gstin && (cleanGst(c.gstin) === buyerGstClean || cleanGst(c.gstin) === vendorGstClean)
        );

        if (matched) {
          setSelectedCompany(matched.companyName);
          localStorage.setItem('tally_selected_company', matched.companyName);
          setCompanyGstin(matched.gstin || '');
        } else if (activeCo) {
          setSelectedCompany(activeCo);
          const gstinVal = data.company?.gstin ||
            data.availableCompanies?.find((c) => c.companyName === activeCo)?.gstin ||
            '';
          if (gstinVal) {
            setCompanyGstin(gstinVal);
          }
        }

        setConnectionLatency(data.latencyMs || 0);
      } else {
        setTallyStatus({
          isOnline: false,
          companies: [],
          activeCompany: '',
        });
        setConnectionLatency(data?.latencyMs || 0);
        const err = resp.message || (data?.errors && data.errors[0]) || 'The target system is reachable, but TallyPrime is not running or port 9000 refused connection.';
        setConnectionErrorMsg(err);
      }
    } catch (err: any) {
      setTallyStatus({
        isOnline: false,
        companies: [],
        activeCompany: '',
      });
      setConnectionErrorMsg(err.message || 'Connection test failed');
    } finally {
      setIsTestingConn(false);
    }
  };

  // Check Tally & Connector status on mount with WebRTC discovery & 4-tier diagnostic
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const savedHost = localStorage.getItem('tally_host');
      if (!savedHost) {
        try {
          const detectedIp = await detectClientLocalIp();
          if (detectedIp && isMounted) {
            setTallyHost(detectedIp);
            setTargetSystem(`${detectedIp}:${tallyPort}`);
            runTestConnection(detectedIp, tallyPort);
            return;
          }
        } catch {
          // ignore error
        }
      }
      if (isMounted) {
        runTestConnection();
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch Tally party ledgers & auto-match with Vendor GSTIN
  useEffect(() => {
    let isMounted = true;
    if (selectedCompany && tallyStatus.isOnline) {
      getTallyParties(selectedCompany, invoiceData.vendor.gstin, tallyHost, tallyPort).then((res) => {
        if (!isMounted) return;
        if (res.allParties.length > 0) {
          setTallyParties(res.allParties);
        }
        if (res.matched && res.party) {
          setSelectedPartyLedger(res.party.name);
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [selectedCompany, invoiceData.vendor.gstin, tallyHost, tallyPort, tallyStatus.isOnline]);

  // Fetch Tally Ledger Hierarchy for auto-mapping when company changes
  useEffect(() => {
    let isMounted = true;
    if (selectedCompany && tallyStatus.isOnline) {
      setIsLoadingHierarchy(true);
      getLedgerHierarchy(selectedCompany, tallyHost, Number(tallyPort))
        .then((res) => {
          if (!isMounted) return;
          const parsed = parseTallyHierarchy(res);
          setHierarchyLedgers(parsed);

          // Auto-select Purchase Ledger
          if (parsed.purchaseLedgers.length > 0) {
            const firstItemDesc = (invoiceData.items[0]?.description || '').toLowerCase();
            const matched = parsed.purchaseLedgers.find((l) => {
              const lower = l.toLowerCase();
              return firstItemDesc.includes(lower) || lower.includes(firstItemDesc) || lower.includes('18%');
            });
            if (matched) {
              setSelectedPurchaseLedger(matched);
            } else {
              const pref = parsed.purchaseLedgers.find((l) => /purchase\s*account/i.test(l)) ||
                           parsed.purchaseLedgers.find((l) => /^purchase$/i.test(l)) ||
                           parsed.purchaseLedgers[0];
              setSelectedPurchaseLedger(pref);
            }
          }

          // Auto-select CGST Ledger
          if (parsed.cgstLedgers.length > 0) {
            const pref = parsed.cgstLedgers.find((l) => /input\s*cgst/i.test(l)) ||
                         parsed.cgstLedgers.find((l) => /^cgst$/i.test(l)) ||
                         parsed.cgstLedgers[0];
            setSelectedCgstLedger(pref);
          } else if (parsed.dutiesAndTaxes.length > 0) {
            const pref = parsed.dutiesAndTaxes.find((l) => /cgst/i.test(l)) || parsed.dutiesAndTaxes[0];
            setSelectedCgstLedger(pref);
          }

          // Auto-select SGST Ledger
          if (parsed.sgstLedgers.length > 0) {
            const pref = parsed.sgstLedgers.find((l) => /input\s*sgst/i.test(l)) ||
                         parsed.sgstLedgers.find((l) => /^sgst$/i.test(l)) ||
                         parsed.sgstLedgers[0];
            setSelectedSgstLedger(pref);
          } else if (parsed.dutiesAndTaxes.length > 0) {
            const pref = parsed.dutiesAndTaxes.find((l) => /sgst/i.test(l)) || parsed.dutiesAndTaxes[0];
            setSelectedSgstLedger(pref);
          }

          // Auto-select IGST Ledger
          if (parsed.igstLedgers.length > 0) {
            const pref = parsed.igstLedgers.find((l) => /input\s*igst/i.test(l)) ||
                         parsed.igstLedgers.find((l) => /^igst$/i.test(l)) ||
                         parsed.igstLedgers[0];
            setSelectedIgstLedger(pref);
          } else if (parsed.dutiesAndTaxes.length > 0) {
            const pref = parsed.dutiesAndTaxes.find((l) => /igst/i.test(l)) || parsed.dutiesAndTaxes[0];
            setSelectedIgstLedger(pref);
          }

          // Auto-select Round Off Ledger
          if (parsed.roundOffLedgers.length > 0) {
            setSelectedRoundOffLedger(parsed.roundOffLedgers[0]);
          }

          // Party Ledger auto-match from Creditors in hierarchy if needed
          if (parsed.creditorLedgers && parsed.creditorLedgers.length > 0) {
            const vendorName = (invoiceData.vendor.name || '').trim().toLowerCase();
            const matchedCreditor = parsed.creditorLedgers.find((c) => {
              const lower = c.toLowerCase();
              return lower === vendorName || lower.includes(vendorName) || vendorName.includes(lower);
            });
            if (matchedCreditor && (!selectedPartyLedger || selectedPartyLedger === invoiceData.vendor.name)) {
              setSelectedPartyLedger(matchedCreditor);
            }
          }
        })
        .catch((err) => {
          console.warn('Failed to load ledger hierarchy:', err);
        })
        .finally(() => {
          if (isMounted) setIsLoadingHierarchy(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [selectedCompany, tallyHost, tallyPort, tallyStatus.isOnline]);

  const rawJsonPayload = JSON.stringify(invoiceData.rawPayload || invoiceData, null, 2);

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(rawJsonPayload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const handleCompanySelectChange = (newCo: string) => {
    setSelectedCompany(newCo);
    localStorage.setItem('tally_selected_company', newCo);
    const matched = availableCompaniesWithDetails.find((c) => c.companyName === newCo);
    if (matched?.gstin) {
      setCompanyGstin(matched.gstin);
    }
  };

  const handleTargetSystemChange = (val: string) => {
    setTargetSystem(val);
    localStorage.setItem('tally_target_system', val);
    const parts = val.split(':');
    if (parts[0]) {
      setTallyHost(parts[0].trim());
      localStorage.setItem('tally_host', parts[0].trim());
    }
    if (parts[1]) {
      setTallyPort(parts[1].trim());
      localStorage.setItem('tally_port', parts[1].trim());
    }
  };

  const handleWriteToTallyClick = () => {
    if (isWritingToTally) return;

    if (!tallyStatus.isOnline) {
      alert('Tally is offline or not reachable on ' + tallyHost + ':' + tallyPort);
      return;
    }

    if (!selectedCompany) {
      alert('Please select an active company in Tally first.');
      return;
    }

    if (!isGstMatched) {
      if (!isInvoiceNonGst) {
        if (!userGstClean) {
          alert('Logged-in user has no registered GSTIN in users.json.');
          return;
        }
        if (activeCompanyGstin !== userGstClean) {
          alert(`GSTIN Mismatch: Logged-in user GSTIN (${userGstClean}) does not match open Tally company GSTIN (${activeCompanyGstin || 'Not set'}).`);
          return;
        }
        if (!billGstMatches) {
          alert(`GSTIN Mismatch: Neither Invoice Buyer GSTIN (${buyerGstClean || 'None'}) nor Seller GSTIN (${vendorGstClean || 'None'}) matches Tally company GSTIN (${activeCompanyGstin}).`);
          return;
        }
      }
      alert('GST is not mapped. All 3 GSTINs (Tally Company, Invoice Buyer/Seller, and Logged-in user) must match.');
      return;
    }

    setShowConfirmModal(true);
  };

  const executeWriteToTally = async () => {
    setIsWritingToTally(true);
    setSyncError(null);
    try {
      const parts = targetSystem.split(':');
      const resolvedHost = parts[0]?.trim() || tallyHost || '127.0.0.1';
      const resolvedPort = Number(parts[1]?.trim()) || Number(tallyPort) || 9000;
      const targetCompany = (selectedCompany || tallyStatus.activeCompany || tallyStatus.companies[0] || '').trim();
      if (!targetCompany) {
        throw new Error('Target company is required. Please ensure an active company is open in TallyPrime.');
      }
      const targetParty = (selectedPartyLedger || invoiceData.vendor.name || '').trim();
      if (!targetParty) {
        throw new Error('Party ledger is required. Please select or enter a party ledger.');
      }

      const result = await postInvoiceToTally(
        {
          ...invoiceData,
          invoiceNo,
          orderPoNo,
          invoiceDate,
          entryDate,
          subtotal: purchaseAmount,
          cgst: cgstAmount,
          sgst: sgstAmount,
          igst: igstAmount,
          payable: calcPayable,
          grandTotal: calcPayable,
        },
        targetCompany,
        targetParty,
        resolvedHost,
        resolvedPort,
        {
          purchaseLedger: selectedPurchaseLedger,
          cgstLedger: selectedCgstLedger,
          sgstLedger: selectedSgstLedger,
          igstLedger: selectedIgstLedger,
          roundOffLedger: selectedRoundOffLedger,
          partyLedger: targetParty,
          voucherType: voucherType,
          autoCreateLedgers: true,
          educationalMode: educationalMode,
          narration: narration || undefined,
          includeLineItems: includeLineItems,
          includePurchase: includePurchase,
          includeCgst: includeCgst,
          includeSgst: includeSgst,
          includeIgst: includeIgst,
          includeRoundOff: includeRoundOff,
          includeInventoryItems: false,
        }
      );
      setLastVoucherResult(result);
      setIsTallyMapped(true);
      setShowConfirmModal(false);
      setShowTallyModal(true);
    } catch (err: any) {
      console.error('Push to Tally error:', err);
      setSyncError(formatOneLineError(err));
      setShowConfirmModal(false);
    } finally {
      setIsWritingToTally(false);
    }
  };

  const buildOptions = (
    items: string[],
    currentVal: string,
    meta: { badge?: string; badgeColor?: SelectOption['badgeColor']; icon?: string } = {}
  ): SelectOption[] => {
    const merged = Array.from(new Set([...(currentVal ? [currentVal] : []), ...items].filter(Boolean)));
    return merged.map((item) => ({
      value: item,
      label: item,
      ...meta,
    }));
  };

  const companyOptions = buildOptions(
    tallyStatus.companies.length > 0 ? tallyStatus.companies : (selectedCompany ? [selectedCompany] : []),
    selectedCompany,
    { badge: 'Co', badgeColor: 'blue', icon: 'bi-building' }
  );

  const voucherTypeOptions: SelectOption[] = [
    { value: 'Purchase', label: 'Purchase', badge: 'Vch', badgeColor: 'blue', icon: 'bi-cart-check' },
    { value: 'Sales', label: 'Sales', badge: 'Vch', badgeColor: 'green', icon: 'bi-receipt' },
    { value: 'Payment', label: 'Payment', badge: 'Dr', badgeColor: 'amber', icon: 'bi-cash-stack' },
    { value: 'Journal', label: 'Journal', badge: 'Jrn', badgeColor: 'purple', icon: 'bi-journal-text' },
  ];

  const ledgerGroupOptions: SelectOption[] = [
    { value: 'Sundry Creditors', label: 'Sundry Creditors', badge: 'Liability', badgeColor: 'amber', icon: 'bi-building' },
    { value: 'Current Liabilities', label: 'Current Liabilities', badge: 'Liability', badgeColor: 'amber', icon: 'bi-shield-exclamation' },
    { value: 'Direct Expenses', label: 'Direct Expenses', badge: 'Exp', badgeColor: 'blue', icon: 'bi-cash-coin' },
    { value: 'Duties & Taxes', label: 'Duties & Taxes', badge: 'Tax', badgeColor: 'purple', icon: 'bi-percent' },
    { value: 'Bank Accounts', label: 'Bank Accounts', badge: 'Asset', badgeColor: 'green', icon: 'bi-bank' },
  ];

  const partySource =
    tallyParties.length > 0
      ? tallyParties.map((p) => p.name)
      : hierarchyLedgers.creditorLedgers;

  const partyLedgerOptions = buildOptions(
    partySource.length > 0 ? partySource : (invoiceData.vendor.name ? [invoiceData.vendor.name] : []),
    selectedPartyLedger,
    {
      badge: 'Cr',
      badgeColor: 'blue',
      icon: 'bi-hospital',
    }
  );

  const purchaseGroupOptions: SelectOption[] = [
    { value: 'Purchase Accounts', label: 'Purchase Accounts', badge: 'Grp', badgeColor: 'blue', icon: 'bi-folder2-open' },
    { value: 'Direct Expenses', label: 'Direct Expenses', badge: 'Exp', badgeColor: 'amber', icon: 'bi-folder2-open' },
  ];

  const purchaseLedgerOptions = buildOptions(
    hierarchyLedgers.purchaseLedgers,
    selectedPurchaseLedger,
    { badge: 'Dr', badgeColor: 'blue', icon: 'bi-bag-check' }
  );

  const taxGroupOptions: SelectOption[] = [
    { value: 'Duties & Taxes', label: 'Duties & Taxes', badge: 'Tax', badgeColor: 'purple', icon: 'bi-percent' },
  ];

  const cgstOptions = buildOptions(
    hierarchyLedgers.cgstLedgers.length > 0 ? hierarchyLedgers.cgstLedgers : hierarchyLedgers.dutiesAndTaxes,
    selectedCgstLedger,
    { badge: 'CGST', badgeColor: 'green', icon: 'bi-percent' }
  );

  const sgstOptions = buildOptions(
    hierarchyLedgers.sgstLedgers.length > 0 ? hierarchyLedgers.sgstLedgers : hierarchyLedgers.dutiesAndTaxes,
    selectedSgstLedger,
    { badge: 'SGST', badgeColor: 'green', icon: 'bi-percent' }
  );

  const igstOptions = buildOptions(
    hierarchyLedgers.igstLedgers.length > 0 ? hierarchyLedgers.igstLedgers : hierarchyLedgers.dutiesAndTaxes,
    selectedIgstLedger,
    { badge: 'IGST', badgeColor: 'amber', icon: 'bi-percent' }
  );

  const roundOffGroupOptions: SelectOption[] = [
    { value: 'Indirect Expenses', label: 'Indirect Expenses', badge: 'Exp', badgeColor: 'amber', icon: 'bi-folder2-open' },
  ];

  const roundOffLedgerOptions = buildOptions(
    hierarchyLedgers.roundOffLedgers,
    selectedRoundOffLedger,
    { badge: 'Adj', badgeColor: 'slate', icon: 'bi-plus-slash-minus' }
  );

  return (
    <>
      <div className="workspace-container">
        {/* Mobile View Switcher Pill Bar (Visible only on <= 1024px screens) */}
        <div className="mobile-workspace-switcher" role="tablist" aria-label="Mobile View Switcher">
          <button
            type="button"
            className={`mobile-switch-pill ${mobileActiveCard === 'extract' ? 'active' : ''}`}
            onClick={() => setMobileActiveCard('extract')}
            role="tab"
            aria-selected={mobileActiveCard === 'extract'}
          >
            <i className="bi bi-file-earmark-text"></i>
            <span>Extracted Data</span>
          </button>
          <button
            type="button"
            className={`mobile-switch-pill tally-pill ${mobileActiveCard === 'tally' ? 'active' : ''}`}
            onClick={() => setMobileActiveCard('tally')}
            role="tab"
            aria-selected={mobileActiveCard === 'tally'}
          >
            <i className="bi bi-cloud-arrow-up"></i>
            <span>Tally Voucher</span>
          </button>
          <button
            type="button"
            className={`mobile-switch-pill ${mobileActiveCard === 'both' ? 'active' : ''}`}
            onClick={() => setMobileActiveCard('both')}
            role="tab"
            aria-selected={mobileActiveCard === 'both'}
          >
            <i className="bi bi-layout-split"></i>
            <span>Both Views</span>
          </button>
        </div>

        <div className="workspace-grid">
          {/* COLUMN 1: EXTRACTED DETAILS (50%) */}
          <div className={`panel-card extracted-panel ${mobileActiveCard === 'tally' ? 'mobile-hidden-panel' : ''}`}>
            {/* Soft Lime Header Banner */}
            <div className="extracted-topbar-banner">
              <div className="extracted-title-wrap">
                {onBack && (
                  <button
                    type="button"
                    className="btn-back-extracted"
                    onClick={onBack}
                    title="Back to Upload"
                    aria-label="Back to Upload"
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M9 14L4 9l5-5" />
                      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
                    </svg>
                  </button>
                )}
                <h3 className="extracted-panel-title">Extracted Details</h3>
              </div>
              <div className="extracted-pill-tabs">
                <button
                  type="button"
                  className={`extracted-tab-btn ${activeTab === 'invoice' ? 'active' : 'inactive'}`}
                  onClick={() => setActiveTab('invoice')}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: '5px', display: 'inline-block', verticalAlign: 'middle' }} aria-hidden="true">
                    <path d="M3 0h10a2 2 0 0 1 2 2v13l-2-1-2 1-2-1-2 1-2-1-2 1V2a2 2 0 0 1 2-2zm0 1a1 1 0 0 0-1 1v12.2l1.5-.75 2 1 2-1 2 1 2-1 1.5.75V2a1 1 0 0 0-1-1H3z"/>
                    <path d="M4 4h8v1H4V4zm0 3h8v1H4V7zm0 3h5v1H4v-1z"/>
                  </svg>
                  <span>Invoice</span>
                </button>
                <button
                  type="button"
                  className={`extracted-tab-btn ${activeTab === 'docinfo' ? 'active' : 'inactive'}`}
                  onClick={() => setActiveTab('docinfo')}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: '5px', display: 'inline-block', verticalAlign: 'middle' }} aria-hidden="true">
                    <path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/>
                    <path d="M4.5 12.5A.5.5 0 0 1 5 12h3a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0-2A.5.5 0 0 1 5 10h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zm0-2A.5.5 0 0 1 5 8h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5z"/>
                  </svg>
                  <span>Doc Info</span>
                </button>
              </div>
            </div>

            {activeTab === 'invoice' ? (
              <>
                {/* Meta Row: Invoice No, Invoice Date, Order / PO No, Currency */}
                <div className="meta-infobar">
                  <div className="meta-col">
                    <span className="meta-lbl">Invoice No :</span>
                    <span className="meta-val-invoice">{invoiceData.invoiceNo}</span>
                  </div>
                  <div className="meta-col">
                    <span className="meta-lbl">Invoice Date :</span>
                    <NeatDatePicker value={invoiceDate} onChange={setInvoiceDate} />
                  </div>
                  <div className="meta-col">
                    <span className="meta-lbl">Order / PO No :</span>
                    <span className="meta-val-dash">{invoiceData.orderPoNo}</span>
                  </div>
                  <div className="meta-col">
                    <span className="meta-lbl">Currency :</span>
                    <span className="meta-val-curr">{invoiceData.currency}</span>
                  </div>
                </div>

                {/* Vendor & Buyer Cards */}
                <div className="vendor-buyer-grid">
                  <div className="party-box">
                    <div className="party-field-row">
                      <span className="p-lbl">Vendor Name:</span>
                      <span className="p-val">{invoiceData.vendor.name}</span>
                    </div>
                    <div className="party-field-row">
                      <span className="p-lbl">Gstin:</span>
                      <span className="p-val">{invoiceData.vendor.gstin}</span>
                    </div>
                    <div className="party-field-row address-row">
                      <span className="p-lbl">Address:</span>
                      <span className="p-val address-val">{invoiceData.vendor.address}</span>
                    </div>
                  </div>

                  <div className="party-box">
                    <div className="party-field-row">
                      <span className="p-lbl">Buyer Name:</span>
                      <span className="p-val">{invoiceData.buyer.name}</span>
                    </div>
                    <div className="party-field-row">
                      <span className="p-lbl">Gstin:</span>
                      <span className="p-val">{invoiceData.buyer.gstin}</span>
                    </div>
                    <div className="party-field-row address-row">
                      <span className="p-lbl">Address:</span>
                      <span className="p-val address-val">{invoiceData.buyer.address}</span>
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div className="items-table-area">
                  <table className="line-table">
                    <thead>
                      <tr>
                        <th style={{ width: '38px', textAlign: 'center' }}>#</th>
                        <th style={{ textAlign: 'left' }}>ITEM DESCRIPTION</th>
                        <th style={{ width: '75px', textAlign: 'center' }}>HSN/SAC</th>
                        <th style={{ width: '65px', textAlign: 'center' }}>QTY</th>
                        <th style={{ width: '80px', textAlign: 'right' }}>RATE</th>
                        <th style={{ width: '85px', textAlign: 'right' }}>TAXABLE</th>
                        <th style={{ width: '85px', textAlign: 'right' }}>TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceData.items.map((item) => (
                        <tr key={item.sno}>
                          <td style={{ textAlign: 'center', color: '#64748b' }}>{item.sno}</td>
                          <td style={{ textAlign: 'left' }}>{item.description}</td>
                          <td style={{ textAlign: 'center', color: '#64748b' }}>{item.hsnSac}</td>
                          <td style={{ textAlign: 'center' }}>{item.qty}</td>
                          <td style={{ textAlign: 'right' }}>{Number(item.rate).toFixed(2)}</td>
                          <td style={{ textAlign: 'right' }}>{Number(item.taxable).toFixed(2)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(item.total).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals Summary */}
                <div className="totals-breakdown-row">
                  <div>
                    Subtotal: <strong>{invoiceData.subtotal}</strong>
                  </div>
                  <div>
                    CGST: <strong>{invoiceData.cgst}</strong>
                  </div>
                  <div>
                    SGST: <strong>{invoiceData.sgst}</strong>
                  </div>
                  <div>
                    IGST: <strong>{invoiceData.igst || '0.00'}</strong>
                  </div>
                  <div>
                    Total Tax: <strong>{invoiceData.totalTax}</strong>
                  </div>
                </div>

                <div style={{ padding: '0 16px 12px 16px' }}>
                  <span className="grand-total-tag">
                    Grand Total: ({invoiceData.currency}) {invoiceData.grandTotal}
                  </span>
                </div>
              </>
            ) : (
              /* DOC INFO VIEW */
              <div className="docinfo-view-container">
                <div className="docinfo-meta-grid">
                  <div className="docinfo-meta-card">
                    <span className="docinfo-card-label">FILE NAME</span>
                    <span className="docinfo-card-val bold" title={invoiceData.fileName}>
                      {invoiceData.fileName || 'Invoice-Document.pdf'}
                    </span>
                  </div>
                  <div className="docinfo-meta-card">
                    <span className="docinfo-card-label">UPLOADED AT</span>
                    <span className="docinfo-card-val bold">{invoiceData.uploadedAt}</span>
                  </div>
                  <div className="docinfo-meta-card">
                    <span className="docinfo-card-label">STATUS</span>
                    <span className="docinfo-status-pill success">
                      <span className="docinfo-dot green"></span>
                      <span>Success</span>
                    </span>
                  </div>
                  <div className="docinfo-meta-card">
                    <span className="docinfo-card-label">MALWARE SCAN</span>
                    <span className="docinfo-status-pill clean">
                      <i className="bi bi-shield-check"></i>
                      <span>Clean</span>
                    </span>
                  </div>
                </div>

                <div className="docinfo-confidence-card">
                  <span className="docinfo-conf-label">EXTRACTION CONFIDENCE</span>
                  <div className="docinfo-progress-track">
                    <div className="docinfo-progress-fill" style={{ width: `${invoiceData.confidence || 95}%` }}></div>
                  </div>
                  <span className="docinfo-conf-pct">{invoiceData.confidence || 95}%</span>
                </div>

                <div className="docinfo-payload-card">
                  <div className="docinfo-payload-header">
                    <span className="docinfo-payload-title">RAW EXTRACTED PAYLOAD</span>
                    <button
                      type="button"
                      className="btn-copy-payload"
                      onClick={handleCopyPayload}
                    >
                      <i className={`bi ${copiedPayload ? 'bi-check-lg' : 'bi-files'}`}></i>
                      <span>{copiedPayload ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="docinfo-payload-body">
                    <pre>
                      <code>{rawJsonPayload}</code>
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* COLUMN 2: TALLY INTEGRATION (50%) */}
          <div className={`tally-card-exact ${mobileActiveCard === 'extract' ? 'mobile-hidden-panel' : ''}`}>
            {/* Header */}
            <div className="tally-header-exact">
              <div className="tally-brand-wrap">
                <span className="tally-brand-name">Tally</span>
                <button
                  type="button"
                  className={`tally-config-toggle-btn ${showTallyConfig ? 'active' : ''}`}
                  onClick={() => setShowTallyConfig(!showTallyConfig)}
                  title="Configure Tally Remote IP &amp; Port Settings"
                  aria-label="Configure Tally Remote IP &amp; Port Settings"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className="tally-sliders-icon"
                    aria-hidden="true"
                    style={{ display: 'inline-block', verticalAlign: 'middle' }}
                  >
                    <path fillRule="evenodd" d="M11.5 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM9.05 3a2.5 2.5 0 0 1 4.9 0H16v1h-2.05a2.5 2.5 0 0 1-4.9 0H0V3h9.05zM4.5 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM2.05 8a2.5 2.5 0 0 1 4.9 0H16v1H6.95a2.5 2.5 0 0 1-4.9 0H0V8h2.05zm9.45 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-2.45 1a2.5 2.5 0 0 1 4.9 0H16v1h-2.05a2.5 2.5 0 0 1-4.9 0H0v-1h9.05z"/>
                  </svg>
                </button>
              </div>

              {/* Dynamic Connection / GST Status Badge */}
              {isTestingConn ? (
                <div
                  style={{
                    padding: '3px 10px',
                    borderRadius: '12px',
                    backgroundColor: '#f3f4f6',
                    color: '#4b5563',
                    fontSize: '11px',
                    fontWeight: '600',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <span
                    className="spinner-border spinner-border-sm"
                    style={{ width: '8px', height: '8px', borderWidth: '1px' }}
                  />
                  <span>Connecting...</span>
                </div>
              ) : !tallyStatus.isOnline ? (
                <div
                  title={connectionErrorMsg || 'TallyPrime is offline or unreachable'}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '12px',
                    backgroundColor: '#fef2f2',
                    color: '#b91c1c',
                    border: '1px solid #fecaca',
                    fontSize: '11px',
                    fontWeight: '700',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: '#ef4444',
                      display: 'inline-block',
                    }}
                  />
                  <span>● Offline</span>
                </div>
              ) : isTallyMapped ? (
                <div
                  style={{
                    padding: '3px 10px',
                    borderRadius: '12px',
                    backgroundColor: '#dcfce7',
                    color: '#15803d',
                    fontSize: '11px',
                    fontWeight: '700',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <span>✓ Synced to Tally</span>
                </div>
              ) : isGstMatched ? (
                <div
                  className="tally-gst-badge-pill"
                  title={
                    isInvoiceNonGst
                      ? `Non-GST invoice: Company "${selectedCompany}" selected. Ready to export.`
                      : `All 3 GSTINs match: Tally Company (${activeCompanyGstin}) == Bill (${matchedBillGst}) == Logged-in User (${userGstClean})`
                  }
                  style={{
                    backgroundColor: '#eefbf0',
                    color: '#16a34a',
                    borderColor: '#c2ecc9',
                    padding: '3px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '600',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: '#16a34a',
                      display: 'inline-block',
                    }}
                  />
                  <span>{isInvoiceNonGst ? '• Non-GST Bill' : '• GST mapped'}</span>
                </div>
              ) : (
                <div
                  className="tally-gst-badge-pill"
                  title={
                    !selectedCompany
                      ? 'Please select a company in Tally'
                      : !activeCompanyGstin
                      ? `Selected Tally company "${selectedCompany}" has no registered GSTIN`
                      : !userGstClean
                      ? 'Logged-in user has no registered GSTIN in users.json'
                      : activeCompanyGstin !== userGstClean
                      ? `GST Mismatch: Logged-in user GST (${userGstClean}) does not match Tally company GST (${activeCompanyGstin})`
                      : `GST Mismatch: Invoice GST (${buyerGstClean || vendorGstClean || 'None'}) does not match Tally company GST (${activeCompanyGstin})`
                  }
                  style={{
                    backgroundColor: '#fffbeb',
                    color: '#b45309',
                    borderColor: '#fde68a',
                    padding: '3px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '600',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: '#f59e0b',
                      display: 'inline-block',
                    }}
                  />
                  <span>⚠ GST not mapped</span>
                </div>
              )}
            </div>

            {/* Sync error alert */}
            {syncError && (
              <div
                style={{
                  margin: '0 0 6px 0',
                  padding: '8px 12px',
                  backgroundColor: '#fff1f0',
                  border: '1px solid #ffccc7',
                  borderRadius: '8px',
                  color: '#cf1322',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <i className="bi bi-exclamation-triangle-fill"></i>
                <div style={{ flex: 1 }}>{syncError}</div>
                <button
                  type="button"
                  onClick={() => setSyncError(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cf1322' }}
                >
                  <i className="bi bi-x"></i>
                </button>
              </div>
            )}

            {showTallyConfig ? (
              /* TALLY CONFIGURATION DRAWER (Remote IP, Port, Educational Mode) */
              <div className="tally-config-view-wrap" style={{ flex: 1, overflowY: 'auto' }}>
                <div className="tally-config-main-box">
                  <div className="config-header-row">
                    <div className="config-title-left">
                      <div className="config-slider-icon-box">
                        <i className="bi bi-sliders"></i>
                      </div>
                      <span className="config-title-text">TALLY SERVER &amp; MAPPING CONFIGURATION</span>
                    </div>
                    <div className="config-status-pill online">
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: tallyStatus.isOnline ? '#28a745' : '#dc3545',
                        }}
                      ></span>
                      <span>{tallyStatus.isOnline ? 'Online' : 'Offline'}</span>
                    </div>
                  </div>

                  <div className="config-settings-card">
                    <div className="config-row-top">
                      <div>
                        <div className="config-label-row">
                          <label className="config-field-label">TARGET SYSTEM (IP : PORT)</label>
                        </div>
                        <input
                          type="text"
                          className="config-input-pill"
                          value={targetSystem}
                          onChange={(e) => handleTargetSystemChange(e.target.value)}
                          placeholder="192.23.2.18:9000"
                        />
                      </div>
                      <div>
                        <label className="config-field-label">PORT</label>
                        <input
                          type="text"
                          className="config-input-pill"
                          value={tallyPort}
                          onChange={(e) => {
                            setTallyPort(e.target.value);
                            localStorage.setItem('tally_port', e.target.value);
                            setTargetSystem(`${tallyHost}:${e.target.value}`);
                          }}
                        />
                      </div>
                      <div>
                        <button
                          type="button"
                          className="btn-test-connection"
                          onClick={() => {
                            const [h, p] = targetSystem.split(':');
                            runTestConnection(h?.trim(), p?.trim());
                          }}
                          disabled={isTestingConn}
                        >
                          <i className="bi bi-wifi test-wifi-icon" style={{ color: '#16a34a' }}></i>
                          <span>{isTestingConn ? 'Testing...' : 'Test Connection'}</span>
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                        <input
                          type="checkbox"
                          checked={educationalMode}
                          onChange={(e) => setEducationalMode(e.target.checked)}
                          style={{ marginRight: '6px', accentColor: '#0b66c2' }}
                        />
                        <span>Educational Mode (Off: preserves exact dates)</span>
                      </label>
                    </div>

                    {/* Diagnostic Feedback */}
                    {tallyStatus.isOnline ? (
                      <div style={{ marginTop: '10px', fontSize: '11px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="bi bi-check-circle-fill"></i>
                        <span>Connected to TallyPrime ({connectionLatency}ms latency). Active company: <strong>{selectedCompany}</strong> {companyGstin ? `(${companyGstin})` : ''}</span>
                      </div>
                    ) : connectionErrorMsg ? (
                      <div style={{ marginTop: '10px', fontSize: '11px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className="bi bi-x-circle-fill"></i>
                        <span>{connectionErrorMsg}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="tally-footer-exact" style={{ marginTop: 'auto' }}>
                    <button
                      type="button"
                      className="btn-tally-combined-pill"
                      style={{ background: '#2563eb' }}
                      onClick={() => setShowTallyConfig(false)}
                    >
                      <span style={{ color: '#ffffff', fontWeight: 'bold' }}>Save &amp; Return to Postings</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* REGULAR VOUCHER & LEDGER POSTINGS VIEW (EXACT 1:1 REPLICA) */
              <>
                {/* Top Meta Card */}
                <div className="tally-white-box-meta">
                  <div className="meta-3col-row">
                    <div>
                      <div className="meta-lbl-exact">COMPANY</div>
                      <UniqueSelect
                        options={companyOptions}
                        value={selectedCompany}
                        onChange={handleCompanySelectChange}
                        placeholder="Select Company..."
                        variant="inline"
                        searchable={true}
                        allowClear={false}
                        minMenuWidth={240}
                      />
                    </div>
                    <div>
                      <div className="meta-lbl-exact">VOUCHER TYPE</div>
                      <UniqueSelect
                        options={voucherTypeOptions}
                        value={voucherType}
                        onChange={setVoucherType}
                        placeholder="Purchase"
                        variant="inline"
                        searchable={true}
                        allowClear={false}
                      />
                    </div>
                    <div>
                      <div className="meta-lbl-exact">INVOICE NO</div>
                      <input
                        type="text"
                        className="meta-val-input"
                        value={invoiceNo}
                        onChange={(e) => setInvoiceNo(e.target.value)}
                        placeholder="Invoice No"
                      />
                    </div>
                  </div>

                  <hr className="meta-divider-line" />

                  <div className="meta-3col-row">
                    <div>
                      <div className="meta-lbl-exact">INVOICE DATE</div>
                      <NeatDatePicker
                        value={invoiceDate}
                        onChange={setInvoiceDate}
                        theme="tally"
                        ariaLabel="Invoice Date"
                      />
                    </div>
                    <div>
                      <div className="meta-lbl-exact">ENTRY DATE</div>
                      <NeatDatePicker
                        value={entryDate}
                        onChange={setEntryDate}
                        theme="tally"
                        ariaLabel="Entry Date"
                      />
                    </div>
                    <div>
                      <div className="meta-lbl-exact">ORDER / PO NO</div>
                      <input
                        type="text"
                        className="meta-val-input"
                        value={orderPoNo}
                        onChange={(e) => setOrderPoNo(e.target.value)}
                        placeholder="—"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 1: Party */}
                <div className="sec-heading-exact">
                  <span className="blue-circle-icon">1</span>
                  <span>Party</span>
                </div>

                <div className="tally-white-box-section">
                  <div className="party-2col-grid">
                    <div>
                      <div className="field-lbl-exact">LEDGER GROUP</div>
                      <UniqueSelect
                        options={ledgerGroupOptions}
                        value={ledgerGroup}
                        onChange={setLedgerGroup}
                        placeholder="Select Group..."
                        variant="default"
                        searchable={true}
                        allowClear={false}
                      />
                    </div>
                    <div>
                      <div className="field-lbl-exact">PARTY LEDGER</div>
                      <UniqueSelect
                        options={partyLedgerOptions}
                        value={selectedPartyLedger}
                        onChange={setSelectedPartyLedger}
                        placeholder="Select Party Ledger..."
                        variant="default"
                        searchable={true}
                        allowClear={false}
                        minMenuWidth={250}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Ledger postings */}
                <div className="sec-heading-exact">
                  <span className="blue-circle-icon">2</span>
                  <span>Ledger postings</span>
                </div>

                <div className="tally-white-box-postings">
                  {/* Group 1: Purchase Accounts */}
                  <div className="posting-subcard">
                    <div className="posting-subhead-row">
                      <div className="group-chip-tag">
                        <span className="group-text-lbl">GROUP</span>
                        <UniqueSelect
                          options={purchaseGroupOptions}
                          value={purchaseGroup}
                          onChange={setPurchaseGroup}
                          placeholder="Select Group"
                          variant="chip"
                          searchable={true}
                          allowClear={false}
                          minMenuWidth={220}
                        />
                      </div>
                      <label className="include-chk-label">
                        <input
                          type="checkbox"
                          checked={includeLineItems}
                          onChange={(e) => setIncludeLineItems(e.target.checked)}
                        />
                        <span>Include line items</span>
                      </label>
                    </div>

                    <div className="posting-rows-list">
                      <div className="posting-grid-row">
                        <label className="posting-label-name">
                          <input
                            type="checkbox"
                            checked={includePurchase}
                            onChange={(e) => setIncludePurchase(e.target.checked)}
                          />
                          <span>Purchase</span>
                        </label>
                        <UniqueSelect
                          options={purchaseLedgerOptions}
                          value={selectedPurchaseLedger}
                          onChange={setSelectedPurchaseLedger}
                          placeholder="Select Purchase Ledger..."
                          variant="default"
                          searchable={true}
                          allowClear={false}
                          minMenuWidth={240}
                        />
                        <input
                          type="number"
                          step="0.01"
                          className="amount-pill-control bold"
                          value={purchaseAmount}
                          onChange={(e) => setPurchaseAmount(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Group 2: Duties & Taxes */}
                  <div className="posting-subcard">
                    <div className="posting-subhead-row">
                      <div className="group-chip-tag">
                        <span className="group-text-lbl">GROUP</span>
                        <UniqueSelect
                          options={taxGroupOptions}
                          value={taxGroup}
                          onChange={setTaxGroup}
                          placeholder="Select Tax Group"
                          variant="chip"
                          searchable={true}
                          allowClear={false}
                          minMenuWidth={200}
                        />
                      </div>
                    </div>

                    <div className="posting-rows-list">
                      {/* CGST Row */}
                      <div className="posting-grid-row">
                        <label className="posting-label-name">
                          <input
                            type="checkbox"
                            checked={includeCgst}
                            onChange={(e) => setIncludeCgst(e.target.checked)}
                          />
                          <span>CGST</span>
                        </label>
                        <UniqueSelect
                          options={cgstOptions}
                          value={selectedCgstLedger}
                          onChange={setSelectedCgstLedger}
                          placeholder="Select CGST Ledger..."
                          variant="default"
                          searchable={true}
                          allowClear={false}
                        />
                        <input
                          type="number"
                          step="0.01"
                          className="amount-pill-control bold"
                          value={cgstAmount}
                          onChange={(e) => setCgstAmount(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>

                      {/* SGST Row */}
                      <div className="posting-grid-row">
                        <label className="posting-label-name">
                          <input
                            type="checkbox"
                            checked={includeSgst}
                            onChange={(e) => setIncludeSgst(e.target.checked)}
                          />
                          <span>SGST</span>
                        </label>
                        <UniqueSelect
                          options={sgstOptions}
                          value={selectedSgstLedger}
                          onChange={setSelectedSgstLedger}
                          placeholder="Select SGST Ledger..."
                          variant="default"
                          searchable={true}
                          allowClear={false}
                        />
                        <input
                          type="number"
                          step="0.01"
                          className="amount-pill-control bold"
                          value={sgstAmount}
                          onChange={(e) => setSgstAmount(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>

                      {/* IGST Row */}
                      <div className="posting-grid-row">
                        <label className="posting-label-name">
                          <input
                            type="checkbox"
                            checked={includeIgst}
                            onChange={(e) => setIncludeIgst(e.target.checked)}
                          />
                          <span>IGST</span>
                        </label>
                        <UniqueSelect
                          options={igstOptions}
                          value={selectedIgstLedger}
                          onChange={setSelectedIgstLedger}
                          placeholder="Select IGST Ledger..."
                          variant="default"
                          searchable={true}
                          allowClear={false}
                        />
                        <input
                          type="number"
                          step="0.01"
                          className="amount-pill-control bold"
                          value={igstAmount}
                          onChange={(e) => setIgstAmount(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Group 3: Indirect Expenses */}
                  <div className="posting-subcard">
                    <div className="posting-subhead-row">
                      <div className="group-chip-tag">
                        <span className="group-text-lbl">GROUP</span>
                        <UniqueSelect
                          options={roundOffGroupOptions}
                          value={roundOffGroup}
                          onChange={setRoundOffGroup}
                          placeholder="Select Group"
                          variant="chip"
                          searchable={true}
                          allowClear={false}
                          minMenuWidth={220}
                        />
                      </div>
                    </div>

                    <div className="posting-rows-list">
                      <div className="posting-grid-row">
                        <label className="posting-label-name">
                          <input
                            type="checkbox"
                            checked={includeRoundOff}
                            onChange={(e) => setIncludeRoundOff(e.target.checked)}
                          />
                          <span>Round off</span>
                        </label>
                        <UniqueSelect
                          options={roundOffLedgerOptions}
                          value={selectedRoundOffLedger}
                          onChange={setSelectedRoundOffLedger}
                          placeholder="Select Round Off Ledger..."
                          variant="default"
                          searchable={true}
                          allowClear={false}
                        />
                        <input
                          type="number"
                          step="0.01"
                          className="amount-pill-control bold"
                          value={roundOffAmount}
                          onChange={(e) => setRoundOffAmount(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Narration input */}
                <div className="narration-box-pill">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="#94a3b8" style={{ marginRight: '6px', flexShrink: 0 }} aria-hidden="true">
                    <path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z"/>
                    <path fillRule="evenodd" d="M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5v11z"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Narration (optional)"
                    maxLength={250}
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                  />
                  <span className="narration-counter">{narration.length}/250</span>
                </div>

                {/* Bottom Footer Bar */}
                <div className="tally-footer-exact">
                  <div className="payable-col">
                    <span className="payable-title">PAYABLE</span>
                    <span className="payable-value">₹ {calcPayable}</span>
                  </div>

                  <WriteToTallyButton
                    isGstMapped={isGstMatched}
                    invoice={{
                      ...invoiceData,
                      invoiceNo,
                      orderPoNo,
                      invoiceDate,
                      entryDate,
                      subtotal: purchaseAmount,
                      cgst: cgstAmount,
                      sgst: sgstAmount,
                      igst: igstAmount,
                      payable: calcPayable,
                      grandTotal: calcPayable,
                    }}
                    options={{
                      host: tallyHost,
                      port: Number(tallyPort),
                      companyName: selectedCompany,
                      voucherType: voucherType as any,
                      purchaseLedger: selectedPurchaseLedger,
                      partyLedger: selectedPartyLedger,
                      cgstLedger: selectedCgstLedger,
                      sgstLedger: selectedSgstLedger,
                      igstLedger: selectedIgstLedger,
                      roundOffLedger: selectedRoundOffLedger,
                      educationalMode: educationalMode,
                      narration: narration,
                      includeLineItems: includeLineItems,
                    }}
                    onClick={handleWriteToTallyClick}
                    disabled={isWritingToTally}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => !isWritingToTally && setShowConfirmModal(false)}>
          <div className="modal-dialog-box" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
            <i
              className="bi bi-question-circle"
              style={{
                fontSize: '44px',
                color: '#0b66c2',
                marginBottom: '8px',
                display: 'inline-block',
              }}
            ></i>
            <h3>Confirm Export to Tally Prime</h3>
            <p>Are you sure you want to export this invoice to Tally Prime? Review the double-entry mappings below.</p>

            <div className="modal-detail-card">
              <div className="modal-detail-row">
                <span style={{ color: '#666' }}>Target System (IP:Port):</span>
                <span style={{ fontWeight: 'bold', color: '#0b66c2' }}>{targetSystem}</span>
              </div>
              <div className="modal-detail-row">
                <span style={{ color: '#666' }}>Target Company:</span>
                <span style={{ fontWeight: 'bold', color: '#0b66c2' }}>{selectedCompany}</span>
              </div>
              <div className="modal-detail-row">
                <span style={{ color: '#666' }}>Invoice No &amp; Date:</span>
                <span style={{ fontWeight: '600' }}>{invoiceNo} ({invoiceDate})</span>
              </div>
              <div className="modal-detail-row">
                <span style={{ color: '#666' }}>Voucher Type:</span>
                <span style={{ fontWeight: '600' }}>{voucherType}</span>
              </div>
              <div className="modal-detail-row">
                <span style={{ color: '#666' }}>Party Ledger (Cr):</span>
                <span style={{ fontWeight: '600' }}>{selectedPartyLedger || invoiceData.vendor.name}</span>
              </div>
              <div className="modal-detail-row">
                <span style={{ color: '#666' }}>Purchase Ledger (Dr):</span>
                <span style={{ fontWeight: '600' }}>{selectedPurchaseLedger} (₹{purchaseAmount})</span>
              </div>
              <div className="modal-detail-row">
                <span style={{ color: '#666' }}>Taxes (Dr):</span>
                <span style={{ fontWeight: '600' }}>
                  {Number(cgstAmount) > 0 ? `${selectedCgstLedger} (₹${cgstAmount}), ` : ''}
                  {Number(sgstAmount) > 0 ? `${selectedSgstLedger} (₹${sgstAmount}), ` : ''}
                  {Number(igstAmount) > 0 ? `${selectedIgstLedger} (₹${igstAmount})` : ''}
                  {Number(cgstAmount) <= 0 && Number(sgstAmount) <= 0 && Number(igstAmount) <= 0 ? '—' : ''}
                </span>
              </div>
              <div className="modal-detail-row">
                <span style={{ color: '#666' }}>Round Off:</span>
                <span style={{ fontWeight: '600' }}>{selectedRoundOffLedger} (₹{roundOffAmount})</span>
              </div>
              <div className="modal-detail-row" style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '6px', marginTop: '6px' }}>
                <span style={{ color: '#1a2a17', fontWeight: 'bold' }}>Grand Total / Payable:</span>
                <span style={{ fontWeight: 'bold', color: '#10b981', fontSize: '13px' }}>
                  ₹ {calcPayable}
                </span>
              </div>
            </div>

            <div className="modal-btn-row">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setShowConfirmModal(false)}
                disabled={isWritingToTally}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-confirm"
                onClick={executeWriteToTally}
                disabled={isWritingToTally}
              >
                {isWritingToTally ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" style={{ width: '14px', height: '14px', borderWidth: '2px', display: 'inline-block', borderRadius: '50%', border: '2px solid #fff', borderTopColor: 'transparent', animation: 'spin 0.6s linear infinite' }}></span>
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <i className="bi bi-cloud-arrow-up-fill"></i>
                    <span>Confirm &amp; Export</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      <SuccessModal
        isOpen={showTallyModal}
        onClose={() => setShowTallyModal(false)}
        result={lastVoucherResult}
        targetSystem={targetSystem}
        companyName={selectedCompany}
        voucherNumber={invoiceData.invoiceNo}
        voucherDate={invoiceDate}
        amount={invoiceData.payable || invoiceData.grandTotal}
        partyLedger={selectedPartyLedger || invoiceData.vendor.name}
      />
    </>
  );
}

export default Document;
