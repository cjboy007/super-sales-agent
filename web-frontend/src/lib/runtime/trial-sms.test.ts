import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = {
  provider: process.env.SSA_TRIAL_SMS_PROVIDER,
  accessKeyId: process.env.ALIYUN_SMS_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_SMS_ACCESS_KEY_SECRET,
  signName: process.env.ALIYUN_SMS_SIGN_NAME,
  templateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE,
  regionId: process.env.ALIYUN_SMS_REGION_ID,
  pnvsAccessKeyId: process.env.ALIYUN_PNVS_ACCESS_KEY_ID,
  pnvsAccessKeySecret: process.env.ALIYUN_PNVS_ACCESS_KEY_SECRET,
  pnvsSignName: process.env.ALIYUN_PNVS_SIGN_NAME,
  pnvsTemplateCode: process.env.ALIYUN_PNVS_TEMPLATE_CODE,
  pnvsSchemeName: process.env.ALIYUN_PNVS_SCHEME_NAME,
};

beforeEach(() => {
  vi.resetModules();
  process.env.SSA_TRIAL_SMS_PROVIDER = "aliyun";
  process.env.ALIYUN_SMS_ACCESS_KEY_ID = "test-access-key-id";
  process.env.ALIYUN_SMS_ACCESS_KEY_SECRET = "test-access-key-secret";
  process.env.ALIYUN_SMS_SIGN_NAME = "SuperSalesAgent";
  process.env.ALIYUN_SMS_TEMPLATE_CODE = "SMS_123456";
  process.env.ALIYUN_SMS_REGION_ID = "cn-hangzhou";
  delete process.env.ALIYUN_PNVS_ACCESS_KEY_ID;
  delete process.env.ALIYUN_PNVS_ACCESS_KEY_SECRET;
  delete process.env.ALIYUN_PNVS_SIGN_NAME;
  delete process.env.ALIYUN_PNVS_TEMPLATE_CODE;
  delete process.env.ALIYUN_PNVS_SCHEME_NAME;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalEnv.provider === undefined) delete process.env.SSA_TRIAL_SMS_PROVIDER;
  else process.env.SSA_TRIAL_SMS_PROVIDER = originalEnv.provider;
  if (originalEnv.accessKeyId === undefined) delete process.env.ALIYUN_SMS_ACCESS_KEY_ID;
  else process.env.ALIYUN_SMS_ACCESS_KEY_ID = originalEnv.accessKeyId;
  if (originalEnv.accessKeySecret === undefined) delete process.env.ALIYUN_SMS_ACCESS_KEY_SECRET;
  else process.env.ALIYUN_SMS_ACCESS_KEY_SECRET = originalEnv.accessKeySecret;
  if (originalEnv.signName === undefined) delete process.env.ALIYUN_SMS_SIGN_NAME;
  else process.env.ALIYUN_SMS_SIGN_NAME = originalEnv.signName;
  if (originalEnv.templateCode === undefined) delete process.env.ALIYUN_SMS_TEMPLATE_CODE;
  else process.env.ALIYUN_SMS_TEMPLATE_CODE = originalEnv.templateCode;
  if (originalEnv.regionId === undefined) delete process.env.ALIYUN_SMS_REGION_ID;
  else process.env.ALIYUN_SMS_REGION_ID = originalEnv.regionId;
  if (originalEnv.pnvsAccessKeyId === undefined) delete process.env.ALIYUN_PNVS_ACCESS_KEY_ID;
  else process.env.ALIYUN_PNVS_ACCESS_KEY_ID = originalEnv.pnvsAccessKeyId;
  if (originalEnv.pnvsAccessKeySecret === undefined) delete process.env.ALIYUN_PNVS_ACCESS_KEY_SECRET;
  else process.env.ALIYUN_PNVS_ACCESS_KEY_SECRET = originalEnv.pnvsAccessKeySecret;
  if (originalEnv.pnvsSignName === undefined) delete process.env.ALIYUN_PNVS_SIGN_NAME;
  else process.env.ALIYUN_PNVS_SIGN_NAME = originalEnv.pnvsSignName;
  if (originalEnv.pnvsTemplateCode === undefined) delete process.env.ALIYUN_PNVS_TEMPLATE_CODE;
  else process.env.ALIYUN_PNVS_TEMPLATE_CODE = originalEnv.pnvsTemplateCode;
  if (originalEnv.pnvsSchemeName === undefined) delete process.env.ALIYUN_PNVS_SCHEME_NAME;
  else process.env.ALIYUN_PNVS_SCHEME_NAME = originalEnv.pnvsSchemeName;
});

describe("trial SMS provider", () => {
  it("sends Aliyun SendSms requests without exposing the access key secret in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ Code: "OK" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { sendTrialSmsVerificationCode } = await import("./trial-sms");

    const result = await sendTrialSmsVerificationCode("13800138000", "123456");
    const url = String(fetchMock.mock.calls[0][0]);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = String(init.body);

    expect(result).toEqual({ ok: true, provider: "aliyun" });
    expect(url).toBe("https://dysmsapi.aliyuncs.com/");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/x-www-form-urlencoded" });
    expect(body).toContain("Action=SendSms");
    expect(body).toContain("PhoneNumbers=13800138000");
    expect(body).toContain("SignName=SuperSalesAgent");
    expect(body).toContain("TemplateCode=SMS_123456");
    expect(body).toContain("TemplateParam=");
    expect(body).toContain("Signature=");
    expect(url).not.toContain("test-access-key-secret");
    expect(body).not.toContain("test-access-key-secret");
  });

  it("sends PNVS SMS verify requests with the gifted sign and template", async () => {
    process.env.SSA_TRIAL_SMS_PROVIDER = "aliyun-pnvs";
    process.env.ALIYUN_PNVS_ACCESS_KEY_ID = "test-pnvs-access-key-id";
    process.env.ALIYUN_PNVS_ACCESS_KEY_SECRET = "test-pnvs-access-key-secret";
    process.env.ALIYUN_PNVS_SIGN_NAME = "速通互联验证码";
    process.env.ALIYUN_PNVS_TEMPLATE_CODE = "100001";
    process.env.ALIYUN_PNVS_SCHEME_NAME = "SuperSalesAgent";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Code: "OK",
        Success: true,
        Model: { BizId: "biz-1", OutId: "trial-out-1" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { sendTrialSmsVerificationCode } = await import("./trial-sms");

    const result = await sendTrialSmsVerificationCode("13800138000", "123456", {
      outId: "trial-out-1",
      ttlSeconds: 300,
      cooldownSeconds: 60,
    });
    const url = String(fetchMock.mock.calls[0][0]);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = String(init.body);

    expect(result).toEqual({ ok: true, provider: "aliyun-pnvs", externalVerification: true, outId: "trial-out-1" });
    expect(url).toBe("https://dypnsapi.aliyuncs.com/");
    expect(init.method).toBe("POST");
    expect(body).toContain("Action=SendSmsVerifyCode");
    expect(body).toContain("PhoneNumber=13800138000");
    expect(body).toContain("SignName=%E9%80%9F%E9%80%9A%E4%BA%92%E8%81%94%E9%AA%8C%E8%AF%81%E7%A0%81");
    expect(body).toContain("TemplateCode=100001");
    expect(body).toContain("SchemeName=SuperSalesAgent");
    expect(body).toContain("TemplateParam=");
    expect(decodeURIComponent(body)).toContain('"code":"##code##"');
    expect(body).toContain("CodeLength=6");
    expect(body).toContain("ValidTime=300");
    expect(body).toContain("Interval=60");
    expect(body).toContain("Signature=");
    expect(body).not.toContain("test-pnvs-access-key-secret");
  });

  it("checks PNVS SMS verify codes using Aliyun verification result", async () => {
    process.env.SSA_TRIAL_SMS_PROVIDER = "aliyun-pnvs";
    process.env.ALIYUN_PNVS_ACCESS_KEY_ID = "test-pnvs-access-key-id";
    process.env.ALIYUN_PNVS_ACCESS_KEY_SECRET = "test-pnvs-access-key-secret";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Code: "OK",
        Success: true,
        Model: { OutId: "trial-out-1", VerifyResult: "PASS" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { verifyTrialSmsVerificationCode } = await import("./trial-sms");

    const result = await verifyTrialSmsVerificationCode("13800138000", "123456", { outId: "trial-out-1" });
    const url = String(fetchMock.mock.calls[0][0]);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = String(init.body);

    expect(result).toEqual({ ok: true, provider: "aliyun-pnvs", verified: true });
    expect(url).toBe("https://dypnsapi.aliyuncs.com/");
    expect(init.method).toBe("POST");
    expect(body).toContain("Action=CheckSmsVerifyCode");
    expect(body).toContain("PhoneNumber=13800138000");
    expect(body).toContain("VerifyCode=123456");
    expect(body).toContain("OutId=trial-out-1");
    expect(body).toContain("Signature=");
    expect(body).not.toContain("test-pnvs-access-key-secret");
  });
});
