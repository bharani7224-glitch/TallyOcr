import React, { useEffect, useState } from 'react';
import { testTallyConnection, type TallyConnectionData } from '../services/tallyApi';

export interface TallyStatusBadgeProps {
  invoiceGstin?: string;
  host?: string;
  port?: number | string;
  companyName?: string;
}

export const TallyStatusBadge: React.FC<TallyStatusBadgeProps> = ({
  invoiceGstin,
  host = '127.0.0.1',
  port = 9000,
  companyName,
}) => {
  const [data, setData] = useState<TallyConnectionData | null>(null);
  const [loading, setLoading] = useState(false);

  const checkConnection = async () => {
    setLoading(true);
    try {
      const res = await testTallyConnection(host, port, companyName);
      setData(res);
    } catch {
      setData({ connected: false, message: 'Server unreachable' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConnection();
  }, [host, port, companyName]);

  const cleanGst = (g?: string) => (g || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const targetGst = cleanGst(invoiceGstin);

  const isGstMatched = Boolean(
    targetGst &&
      data?.availableCompanies?.some(
        (c) => c.gstin && cleanGst(c.gstin) === targetGst
      )
  );

  return (
    <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl border border-stone-200">
      {/* 1. Connection Status */}
      <div className="flex items-center gap-2">
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            data?.connected ? 'bg-emerald-500' : 'bg-red-500'
          }`}
        />
        <span className="text-xs font-semibold">
          {loading
            ? 'Checking Tally...'
            : data?.connected
            ? `Connected (${data.latencyMs}ms)`
            : 'Offline'}
        </span>
      </div>

      {/* 2. GST Mapping Badge */}
      {data?.connected && (
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
            isGstMatched
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-orange-100 text-orange-800'
          }`}
        >
          {isGstMatched ? '✓ GST MAPPED' : '⚠ GST NOT MAPPED'}
        </span>
      )}

      {/* 3. Refresh Button */}
      <button
        type="button"
        onClick={checkConnection}
        className="ml-auto text-xs text-blue-600 hover:underline cursor-pointer"
      >
        Refresh
      </button>
    </div>
  );
};

export default TallyStatusBadge;

