export interface DarajaConfig {
  consumer_key: string;
  consumer_secret: string;
  shortcode: string;
  passkey: string;
  callback_url?: string;
  environment: "sandbox" | "production";
}

export interface StkPushInput {
  phone: string;
  amountMinor: number;
  orderNumber: string;
  description?: string;
}

export interface StkPushResult {
  checkoutRequestId: string;
  merchantRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
}

const BASE_URLS = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
} as const;

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("+")) return digits.slice(1);
  return digits;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
}

function password(config: DarajaConfig, when: string): string {
  return Buffer.from(
    `${config.shortcode}${config.passkey}${when}`,
    "utf8",
  ).toString("base64");
}

export async function darajaToken(config: DarajaConfig): Promise<string> {
  const url = `${BASE_URLS[config.environment]}/oauth/v1/generate?grant_type=client_credentials`;
  const credentials = Buffer.from(
    `${config.consumer_key}:${config.consumer_secret}`,
    "utf8",
  ).toString("base64");
  const response = await fetch(url, {
    method: "GET",
    headers: { authorization: `Basic ${credentials}` },
  });
  if (!response.ok) {
    throw new Error(`daraja_oauth_failed_${response.status}`);
  }
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("daraja_oauth_missing_token");
  return body.access_token;
}

export interface StkQueryResult {
  resultCode: number;
  resultDesc: string;
}

export async function queryStkStatus(
  config: DarajaConfig,
  checkoutRequestId: string,
): Promise<StkQueryResult> {
  const token = await darajaToken(config);
  const when = timestamp();
  const url = `${BASE_URLS[config.environment]}/mpesa/stkpushquery/v1/query`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: password(config, when),
      Timestamp: when,
      CheckoutRequestID: checkoutRequestId,
    }),
  });
  if (!response.ok) {
    throw new Error(`daraja_query_failed_${response.status}`);
  }
  const body = (await response.json()) as {
    ResultCode?: string;
    ResultDesc?: string;
    errorCode?: string;
  };
  if (body.errorCode) throw new Error(body.errorCode);
  return {
    resultCode: Number(body.ResultCode ?? -1),
    resultDesc: body.ResultDesc ?? "No result",
  };
}

export async function stkPush(
  config: DarajaConfig,
  input: StkPushInput,
): Promise<StkPushResult> {
  const token = await darajaToken(config);
  const when = timestamp();
  const url = `${BASE_URLS[config.environment]}/mpesa/stkpush/v1/processrequest`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: password(config, when),
      Timestamp: when,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(input.amountMinor / 100),
      PartyA: normalizePhone(input.phone),
      PartyB: config.shortcode,
      PhoneNumber: normalizePhone(input.phone),
      CallBackURL: config.callback_url,
      AccountReference: input.orderNumber,
      TransactionDesc: input.description ?? "POS payment",
    }),
  });

  if (!response.ok) {
    throw new Error(`daraja_stk_failed_${response.status}`);
  }

  const body = (await response.json()) as {
    CheckoutRequestID?: string;
    MerchantRequestID?: string;
    ResponseCode?: string;
    ResponseDescription?: string;
    CustomerMessage?: string;
    errorCode?: string;
    errorDescription?: string;
  };

  if (body.errorCode || !body.CheckoutRequestID) {
    throw new Error(body.errorDescription ?? "daraja_stk_rejected");
  }

  return {
    checkoutRequestId: body.CheckoutRequestID,
    merchantRequestId: body.MerchantRequestID ?? "",
    responseCode: body.ResponseCode ?? "0",
    responseDescription: body.ResponseDescription ?? "Accepted",
    customerMessage: body.CustomerMessage ?? "Check your phone",
  };
}
