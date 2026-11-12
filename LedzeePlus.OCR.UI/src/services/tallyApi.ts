import { CONFIG } from './config';

export interface TallyCompanyInfo {
  companyName: string;
  gstin?: string;
  state?: string;
}

export interface TallyConnectionData {
  connected: boolean;
  host?: string;
  port?: number | string;
  companyName?: string;
  endpoint?: string;
  status?: number;
  latencyMs?: number;
  message?: string;
  errors?: string[];
  company?: TallyCompanyInfo;
  availableCompanies?: TallyCompanyInfo[];
  taxUnits?: Array<{ taxType?: string; gstin?: string; state?: string }>;
}

/**
 * Probes the local client IP using WebRTC STUN candidate discovery
 */
export async function detectClientLocalIp(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      if (typeof window === 'undefined' || !window.RTCPeerConnection) {
        return resolve(null);
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      pc.createDataChannel('');

      const timer = setTimeout(() => {
        try {
          pc.close();
        } catch {
          // ignore
        }
        resolve(null);
      }, 1500);

      pc.onicecandidate = (event) => {
        if (!event || !event.candidate || !event.candidate.candidate) return;
        const candidateStr = event.candidate.candidate;
        const ipMatch = candidateStr.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
        if (ipMatch && ipMatch[1]) {
          const ip = ipMatch[1];
          // Check for private / LAN IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
          if (
            ip.startsWith('192.168.') ||
            ip.startsWith('10.') ||
            /^(172\.(1[6-9]|2[0-9]|3[0-1]))\./.test(ip)
          ) {
            clearTimeout(timer);
            try {
              pc.close();
            } catch {
              // ignore
            }
            localStorage.setItem('tally_system_host', ip);
            resolve(ip);
          }
        }
      };

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => {
          clearTimeout(timer);
          resolve(null);
        });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Tests TallyPrime connectivity via GET /api/tally/test-connection
 */
export const testTallyConnection = async (
  host = '127.0.0.1',
  port: number | string = 9000,
  companyName?: string
): Promise<TallyConnectionData> => {
  try {
    const baseUrl = CONFIG.backendApiUrl.startsWith('http')
      ? CONFIG.backendApiUrl
      : `${window.location.origin}${CONFIG.backendApiUrl.startsWith('/') ? '' : '/'}${CONFIG.backendApiUrl}`;

    const url = new URL(`${baseUrl}/api/tally/test-connection`);
    url.searchParams.set('host', String(host || '127.0.0.1').trim());
    url.searchParams.set('port', String(port || 9000));
    if (companyName) {
      url.searchParams.set('companyName', companyName.trim());
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const json = await response.json();
    return json?.data || json;
  } catch (err: any) {
    return {
      connected: false,
      host: String(host),
      port,
      status: 0,
      latencyMs: 0,
      message: err.message || 'Server unreachable',
      errors: [err.message || 'Client network error'],
    };
  }
};

