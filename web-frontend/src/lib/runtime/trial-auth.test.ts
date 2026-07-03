import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = {
  dataRoot: process.env.SSA_DATA_ROOT,
  enabled: process.env.SSA_TRIAL_ACCESS_ENABLED,
  smsProvider: process.env.SSA_TRIAL_SMS_PROVIDER,
  trialDays: process.env.SSA_TRIAL_DAYS,
  dailyNewLimit: process.env.SSA_TRIAL_DAILY_NEW_USERS_LIMIT,
  maxActiveLimit: process.env.SSA_TRIAL_MAX_ACTIVE_USERS,
  smsCooldown: process.env.SSA_TRIAL_SMS_COOLDOWN_SECONDS,
  smsPhoneDaily: process.env.SSA_TRIAL_SMS_PHONE_DAILY_LIMIT,
  smsIpDaily: process.env.SSA_TRIAL_SMS_IP_DAILY_LIMIT,
  heavyDaily: process.env.SSA_TRIAL_HEAVY_DAILY_LIMIT,
  contactPhone: process.env.SSA_TRIAL_EXPIRED_CONTACT_PHONE,
  pnvsAccessKeyId: process.env.ALIYUN_PNVS_ACCESS_KEY_ID,
  pnvsAccessKeySecret: process.env.ALIYUN_PNVS_ACCESS_KEY_SECRET,
  pnvsSignName: process.env.ALIYUN_PNVS_SIGN_NAME,
  pnvsTemplateCode: process.env.ALIYUN_PNVS_TEMPLATE_CODE,
};

let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-16T00:00:00.000Z"));
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-trial-auth-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.SSA_TRIAL_ACCESS_ENABLED = "true";
  process.env.SSA_TRIAL_SMS_PROVIDER = "mock";
  process.env.SSA_TRIAL_DAYS = "14";
  process.env.SSA_TRIAL_DAILY_NEW_USERS_LIMIT = "2";
  process.env.SSA_TRIAL_MAX_ACTIVE_USERS = "2";
  process.env.SSA_TRIAL_SMS_COOLDOWN_SECONDS = "60";
  process.env.SSA_TRIAL_SMS_PHONE_DAILY_LIMIT = "3";
  process.env.SSA_TRIAL_SMS_IP_DAILY_LIMIT = "4";
  process.env.SSA_TRIAL_HEAVY_DAILY_LIMIT = "2";
  process.env.SSA_TRIAL_EXPIRED_CONTACT_PHONE = "13800138000";
  delete process.env.ALIYUN_PNVS_ACCESS_KEY_ID;
  delete process.env.ALIYUN_PNVS_ACCESS_KEY_SECRET;
  delete process.env.ALIYUN_PNVS_SIGN_NAME;
  delete process.env.ALIYUN_PNVS_TEMPLATE_CODE;
});

afterEach(() => {
  vi.useRealTimers();
  if (originalEnv.dataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalEnv.dataRoot;
  if (originalEnv.enabled === undefined) delete process.env.SSA_TRIAL_ACCESS_ENABLED;
  else process.env.SSA_TRIAL_ACCESS_ENABLED = originalEnv.enabled;
  if (originalEnv.smsProvider === undefined) delete process.env.SSA_TRIAL_SMS_PROVIDER;
  else process.env.SSA_TRIAL_SMS_PROVIDER = originalEnv.smsProvider;
  if (originalEnv.trialDays === undefined) delete process.env.SSA_TRIAL_DAYS;
  else process.env.SSA_TRIAL_DAYS = originalEnv.trialDays;
  if (originalEnv.dailyNewLimit === undefined) delete process.env.SSA_TRIAL_DAILY_NEW_USERS_LIMIT;
  else process.env.SSA_TRIAL_DAILY_NEW_USERS_LIMIT = originalEnv.dailyNewLimit;
  if (originalEnv.maxActiveLimit === undefined) delete process.env.SSA_TRIAL_MAX_ACTIVE_USERS;
  else process.env.SSA_TRIAL_MAX_ACTIVE_USERS = originalEnv.maxActiveLimit;
  if (originalEnv.smsCooldown === undefined) delete process.env.SSA_TRIAL_SMS_COOLDOWN_SECONDS;
  else process.env.SSA_TRIAL_SMS_COOLDOWN_SECONDS = originalEnv.smsCooldown;
  if (originalEnv.smsPhoneDaily === undefined) delete process.env.SSA_TRIAL_SMS_PHONE_DAILY_LIMIT;
  else process.env.SSA_TRIAL_SMS_PHONE_DAILY_LIMIT = originalEnv.smsPhoneDaily;
  if (originalEnv.smsIpDaily === undefined) delete process.env.SSA_TRIAL_SMS_IP_DAILY_LIMIT;
  else process.env.SSA_TRIAL_SMS_IP_DAILY_LIMIT = originalEnv.smsIpDaily;
  if (originalEnv.heavyDaily === undefined) delete process.env.SSA_TRIAL_HEAVY_DAILY_LIMIT;
  else process.env.SSA_TRIAL_HEAVY_DAILY_LIMIT = originalEnv.heavyDaily;
  if (originalEnv.contactPhone === undefined) delete process.env.SSA_TRIAL_EXPIRED_CONTACT_PHONE;
  else process.env.SSA_TRIAL_EXPIRED_CONTACT_PHONE = originalEnv.contactPhone;
  if (originalEnv.pnvsAccessKeyId === undefined) delete process.env.ALIYUN_PNVS_ACCESS_KEY_ID;
  else process.env.ALIYUN_PNVS_ACCESS_KEY_ID = originalEnv.pnvsAccessKeyId;
  if (originalEnv.pnvsAccessKeySecret === undefined) delete process.env.ALIYUN_PNVS_ACCESS_KEY_SECRET;
  else process.env.ALIYUN_PNVS_ACCESS_KEY_SECRET = originalEnv.pnvsAccessKeySecret;
  if (originalEnv.pnvsSignName === undefined) delete process.env.ALIYUN_PNVS_SIGN_NAME;
  else process.env.ALIYUN_PNVS_SIGN_NAME = originalEnv.pnvsSignName;
  if (originalEnv.pnvsTemplateCode === undefined) delete process.env.ALIYUN_PNVS_TEMPLATE_CODE;
  else process.env.ALIYUN_PNVS_TEMPLATE_CODE = originalEnv.pnvsTemplateCode;
  vi.unstubAllGlobals();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function storedCodeFor(phone: string): string {
  const store = JSON.parse(fs.readFileSync(path.join(tempRoot, "security", "trial-access.json"), "utf-8"));
  const normalized = phone.replace(/^\+?86/, "");
  const challenge = [...store.challenges].reverse().find((item: { phone: string }) => item.phone === normalized);
  return challenge.mockCode;
}

describe("trial auth", () => {
  it("sends a mainland China mobile verification code and opens one 14-day trial", async () => {
    const { requestTrialSmsCode, verifyTrialSmsCode, validateTrialSessionToken } = await import("./trial-auth");

    const sent = await requestTrialSmsCode({ phone: "+8613800138000", ip: "203.0.113.10" });
    expect(sent).toMatchObject({ ok: true, phone: "13800138000", expiresInSeconds: 300 });

    const verified = await verifyTrialSmsCode({
      phone: "13800138000",
      code: storedCodeFor("13800138000"),
      ip: "203.0.113.10",
    });

    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.session.phone).toBe("13800138000");
      expect(verified.session.trialStartedAt).toBe("2026-06-16T00:00:00.000Z");
      expect(verified.session.trialExpiresAt).toBe("2026-06-30T00:00:00.000Z");
      expect(verified.session.contactPhone).toBe("13800138000");
      expect(validateTrialSessionToken(verified.sessionToken).ok).toBe(true);
    }
  });

  it("does not refresh the two-week trial when the same phone verifies again", async () => {
    const { requestTrialSmsCode, verifyTrialSmsCode } = await import("./trial-auth");

    await requestTrialSmsCode({ phone: "13800138000", ip: "203.0.113.10" });
    const first = await verifyTrialSmsCode({ phone: "13800138000", code: storedCodeFor("13800138000"), ip: "203.0.113.10" });
    vi.setSystemTime(new Date("2026-06-20T00:00:00.000Z"));
    await requestTrialSmsCode({ phone: "13800138000", ip: "203.0.113.10" });
    const second = await verifyTrialSmsCode({ phone: "13800138000", code: storedCodeFor("13800138000"), ip: "203.0.113.10" });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.session.trialStartedAt).toBe(first.session.trialStartedAt);
      expect(second.session.trialExpiresAt).toBe(first.session.trialExpiresAt);
    }
  });

  it("uses Aliyun PNVS to verify externally generated SMS codes", async () => {
    process.env.SSA_TRIAL_SMS_PROVIDER = "aliyun-pnvs";
    process.env.ALIYUN_PNVS_ACCESS_KEY_ID = "test-pnvs-access-key-id";
    process.env.ALIYUN_PNVS_ACCESS_KEY_SECRET = "test-pnvs-access-key-secret";
    process.env.ALIYUN_PNVS_SIGN_NAME = "速通互联验证码";
    process.env.ALIYUN_PNVS_TEMPLATE_CODE = "100001";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Code: "OK",
          Success: true,
          Model: { OutId: "trial-out-1", BizId: "biz-1" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Code: "OK",
          Success: true,
          Model: { OutId: "trial-out-1", VerifyResult: "PASS" },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const { requestTrialSmsCode, verifyTrialSmsCode } = await import("./trial-auth");

    const sent = await requestTrialSmsCode({ phone: "13800138000", ip: "203.0.113.10" });
    const verified = await verifyTrialSmsCode({ phone: "13800138000", code: "654321", ip: "203.0.113.10" });
    const sendBody = String(fetchMock.mock.calls[0][1]?.body);
    const verifyBody = String(fetchMock.mock.calls[1][1]?.body);

    expect(sent).toMatchObject({ ok: true, phone: "13800138000" });
    expect(verified.ok).toBe(true);
    expect(sendBody).toContain("Action=SendSmsVerifyCode");
    expect(sendBody).toContain("OutId=");
    expect(verifyBody).toContain("Action=CheckSmsVerifyCode");
    expect(verifyBody).toContain("VerifyCode=654321");
    expect(verifyBody).toContain("OutId=trial-out-1");
  });

  it("rejects expired trials and returns the local deployment contact phone", async () => {
    const { requestTrialSmsCode, verifyTrialSmsCode, validateTrialSessionToken } = await import("./trial-auth");

    await requestTrialSmsCode({ phone: "13800138000", ip: "203.0.113.10" });
    const first = await verifyTrialSmsCode({ phone: "13800138000", code: storedCodeFor("13800138000"), ip: "203.0.113.10" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));
    const session = validateTrialSessionToken(first.sessionToken);
    const sendAgain = await requestTrialSmsCode({ phone: "13800138000", ip: "203.0.113.10" });

    expect(session.ok).toBe(false);
    if (!session.ok) {
      expect(session.reason).toBe("trial_expired");
      expect(session.contactPhone).toBe("13800138000");
    }
    expect(sendAgain).toMatchObject({ ok: false, reason: "trial_expired", contactPhone: "13800138000" });
  });

  it("protects a small server with phone cooldown, IP SMS cap, and active trial caps", async () => {
    const { requestTrialSmsCode, verifyTrialSmsCode } = await import("./trial-auth");

    const firstSend = await requestTrialSmsCode({ phone: "13800138000", ip: "203.0.113.10" });
    const cooldown = await requestTrialSmsCode({ phone: "13800138000", ip: "203.0.113.10" });
    expect(firstSend.ok).toBe(true);
    expect(cooldown).toMatchObject({ ok: false, reason: "sms_cooldown" });

    vi.setSystemTime(new Date("2026-06-16T00:02:00.000Z"));
    await verifyTrialSmsCode({ phone: "13800138000", code: storedCodeFor("13800138000"), ip: "203.0.113.10" });

    await requestTrialSmsCode({ phone: "13700000001", ip: "203.0.113.10" });
    await verifyTrialSmsCode({ phone: "13700000001", code: storedCodeFor("13700000001"), ip: "203.0.113.10" });

    const overActiveLimit = await requestTrialSmsCode({ phone: "13700000002", ip: "203.0.113.11" });
    expect(overActiveLimit).toMatchObject({ ok: false, reason: "active_trial_limit" });
  });

  it("enforces daily SMS caps per phone and per IP", async () => {
    const { requestTrialSmsCode } = await import("./trial-auth");

    await requestTrialSmsCode({ phone: "13800138000", ip: "203.0.113.10" });
    vi.setSystemTime(new Date("2026-06-16T00:02:00.000Z"));
    await requestTrialSmsCode({ phone: "13800138000", ip: "203.0.113.10" });
    vi.setSystemTime(new Date("2026-06-16T00:04:00.000Z"));
    await requestTrialSmsCode({ phone: "13800138000", ip: "203.0.113.10" });
    vi.setSystemTime(new Date("2026-06-16T00:06:00.000Z"));
    const phoneLimited = await requestTrialSmsCode({ phone: "13800138000", ip: "203.0.113.10" });

    const tempRootForIp = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-trial-auth-ip-limit-test-"));
    fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = tempRootForIp;
    process.env.SSA_DATA_ROOT = tempRoot;
    vi.setSystemTime(new Date("2026-06-16T00:00:00.000Z"));
    for (const phone of ["13700000001", "13700000002", "13700000003", "13700000004"]) {
      await requestTrialSmsCode({ phone, ip: "203.0.113.20" });
    }
    const ipLimited = await requestTrialSmsCode({ phone: "13700000005", ip: "203.0.113.20" });

    expect(phoneLimited).toMatchObject({ ok: false, reason: "sms_phone_daily_limit" });
    expect(ipLimited).toMatchObject({ ok: false, reason: "sms_ip_daily_limit" });
  });

  it("limits heavy trial operations per phone per day", async () => {
    const { requestTrialSmsCode, verifyTrialSmsCode, consumeTrialQuota } = await import("./trial-auth");

    await requestTrialSmsCode({ phone: "13800138000", ip: "203.0.113.10" });
    const verified = await verifyTrialSmsCode({ phone: "13800138000", code: storedCodeFor("13800138000"), ip: "203.0.113.10" });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    expect(consumeTrialQuota(verified.session, "heavy")).toMatchObject({ ok: true, remaining: 1 });
    expect(consumeTrialQuota(verified.session, "heavy")).toMatchObject({ ok: true, remaining: 0 });
    expect(consumeTrialQuota(verified.session, "heavy")).toMatchObject({ ok: false, reason: "quota_exceeded" });
  });
});
