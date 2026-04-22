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
    throw new Error("Payment provider is not configured.");
  }

  const cleanKey = merchantKey.trim();

  const fetchOptions: RequestInit = {
    ...options,
    method: options.method || 'GET',
    headers: {
      'merchant_api_key': cleanKey,
      'Content-Type': 'application/json',
    },
  };

  const res = await fetch(`${BASE_URL}${path}`, fetchOptions);

  const json = await res.json();

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
