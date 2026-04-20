export interface OxapayInvoiceRequest {
  amount: number;
  currency?: string;
  lifetime?: number;
  callback_url?: string;
  return_url?: string;
  email?: string;
  order_id?: string;
  description?: string;
  fee_paid_by_payer?: boolean;
  under_paid_coverage?: number;
  sandbox?: boolean;
}

export interface OxapayInvoiceResponse {
  track_id: string;
  payment_url: string;
  expired_at: number;
  date: number;
}

export interface OxapayPaymentInfo {
  track_id: string;
  type: string;
  amount: number;
  currency: string;
  status: OxapayPaymentStatus;
  email?: string;
  order_id?: string;
  expired_at: number;
  date: number;
  txs?: OxapayTransaction[];
}

export type OxapayPaymentStatus =
  | 'new'
  | 'waiting'
  | 'paying'
  | 'paid'
  | 'manual_accept'
  | 'underpaid'
  | 'refunding'
  | 'refunded'
  | 'expired';

export interface OxapayTransaction {
  tx_hash: string;
  amount: number;
  currency: string;
  network: string;
  address: string;
  status: string;
  confirmations: number;
  date: number;
}

export interface OxapayApiError {
  type: string;
  key: string;
  message: string;
}
