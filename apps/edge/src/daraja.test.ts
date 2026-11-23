import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizePhone, stkPush, type DarajaConfig } from "./daraja.js";

const config: DarajaConfig = {
  environment: "sandbox",
  consumer_key: "key",
  consumer_secret: "secret",
  shortcode: "123456",
  passkey: "passkey",
  callback_url: "https://example.test/callback",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Daraja STK", () => {
  it("normalises Kenyan phone numbers", () => {
    expect(normalizePhone("0712345678")).toBe("254712345678");
    expect(normalizePhone("+254712345678")).toBe("254712345678");
  });

  it("requests a token then pushes an STK prompt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "token-123" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          CheckoutRequestID: "ws_CO_123",
          MerchantRequestID: "merchant-1",
          ResponseCode: "0",
          ResponseDescription: "Accepted",
          CustomerMessage: "Check your phone",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await stkPush(config, {
      phone: "0712345678",
      amountMinor: 100000,
      orderNumber: "#0001",
    });

    expect(result).toMatchObject({
      checkoutRequestId: "ws_CO_123",
      merchantRequestId: "merchant-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondCall = fetchMock.mock.calls[1];
    expect(secondCall?.[0]).toContain("/mpesa/stkpush/v1/processrequest");
    const body = JSON.parse(String(secondCall?.[1]?.body ?? "{}")) as {
      PhoneNumber: string;
      Amount: number;
      AccountReference: string;
    };
    expect(body).toMatchObject({
      PhoneNumber: "254712345678",
      Amount: 1000,
      AccountReference: "#0001",
    });
  });

  it("rejects a failed OAuth response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    await expect(
      stkPush(config, {
        phone: "0712345678",
        amountMinor: 1000,
        orderNumber: "#0001",
      }),
    ).rejects.toThrow("daraja_oauth_failed_401");
  });
});
