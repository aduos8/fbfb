import type {
  OxapayInvoiceRequest,
  OxapayInvoiceResponse,
  OxapayPaymentInfo,
} from './oxapay.types';

const BASE_URL = 'https://api.oxapay.com/v1';

function getMerchantKey(): string | null {
  return process.env.OXAPAY_MERCHANT_KEY ?? null;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const merchantKey = getMerchantKey();

  if (!merchantKey) {
    throw new Error('OXAPAY_MERCHANT_KEY is not configured. Please add OXAPAY_MERCHANT_KEY to your .env file.');
  }

  const cleanKey = merchantKey.trim();
  console.log('[Oxapay] DEBUG - Key from env:', JSON.stringify(cleanKey));
  console.log('[Oxapay] DEBUG - Key char codes:', Array.from(cleanKey).map(c => c.charCodeAt(0)));

  const fetchOptions: RequestInit = {
    ...options,
    method: options.method || 'GET',
    headers: {
      'merchant_api_key': cleanKey,
      'Content-Type': 'application/json',
    },
  };

  console.log('[Oxapay] DEBUG - Fetch options headers:', JSON.stringify(fetchOptions.headers));

  const res = await fetch(`${BASE_URL}${path}`, fetchOptions);

  const json = await res.json();
  console.log('[Oxapay] Response:', res.status, JSON.stringify(json).slice(0, 300));

  if (json.status !== 200) {
    const err = json.error ?? { message: `Oxapay request failed` };
    throw new Error(`Oxapay ${json.status}: ${err.message || json.message}`);
  }

  return json.data as T;
}

export async function createInvoice(
  params: OxapayInvoiceRequest
): Promise<OxapayInvoiceResponse> {
  return request<OxapayInvoiceResponse>('/payment/invoice', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getPaymentInfo(
  trackId: string
): Promise<OxapayPaymentInfo> {
  return request<OxapayPaymentInfo>(`/payment/${trackId}`);
}

export function isPaidStatus(status: string): boolean {
  return status === 'paid' || status === 'manual_accept';
}

export function isFinalStatus(status: string): boolean {
  return (
    status === 'paid' ||
    status === 'manual_accept' ||
    status === 'refunded' ||
    status === 'expired'
  );
}

export function isConfigured(): boolean {
  return !!getMerchantKey();
}
