import crypto from "crypto";

export type TrialSmsProvider = "mock" | "aliyun" | "aliyun-pnvs";

export interface TrialSmsSendResult {
  ok: boolean;
  provider: TrialSmsProvider;
  error?: string;
  externalVerification?: boolean;
  outId?: string;
}

export interface TrialSmsVerifyResult {
  ok: boolean;
  provider: TrialSmsProvider;
  verified: boolean;
  error?: string;
}

export interface TrialSmsSendOptions {
  outId?: string;
  ttlSeconds?: number;
  cooldownSeconds?: number;
}

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function envFirst(...names: string[]): string {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  return "";
}

function smsProvider(): TrialSmsProvider {
  const configured = env("SSA_TRIAL_SMS_PROVIDER").toLowerCase();
  if (configured === "mock") return "mock";
  if (configured === "aliyun") return "aliyun";
  if (configured === "aliyun-pnvs" || configured === "pnvs") return "aliyun-pnvs";
  return process.env.NODE_ENV === "test" ? "mock" : "aliyun";
}

function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

function aliyunTimestamp(now = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function signedAliyunRpcRequest(input: {
  endpoint: string;
  action: string;
  accessKeyId: string;
  accessKeySecret: string;
  params: Record<string, string>;
  regionId?: string;
  version?: string;
}): { url: string; body: string } {
  const params: Record<string, string> = {
    AccessKeyId: input.accessKeyId,
    Action: input.action,
    Format: "JSON",
    RegionId: input.regionId || "cn-hangzhou",
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: "1.0",
    Timestamp: aliyunTimestamp(),
    Version: input.version || "2017-05-25",
    ...input.params,
  };

  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
  const stringToSign = `POST&%2F&${percentEncode(canonical)}`;
  const signature = crypto
    .createHmac("sha1", `${input.accessKeySecret}&`)
    .update(stringToSign)
    .digest("base64");
  return {
    url: input.endpoint,
    body: new URLSearchParams({ ...params, Signature: signature }).toString(),
  };
}

function signedAliyunSmsRequest(phone: string, code: string): { url: string; body: string } {
  const accessKeyId = env("ALIYUN_SMS_ACCESS_KEY_ID");
  const accessKeySecret = env("ALIYUN_SMS_ACCESS_KEY_SECRET");
  const signName = env("ALIYUN_SMS_SIGN_NAME");
  const templateCode = env("ALIYUN_SMS_TEMPLATE_CODE");
  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    throw new Error("Aliyun SMS credentials, sign name, and template code are required.");
  }

  return signedAliyunRpcRequest({
    endpoint: "https://dysmsapi.aliyuncs.com/",
    action: "SendSms",
    accessKeyId,
    accessKeySecret,
    regionId: env("ALIYUN_SMS_REGION_ID") || "cn-hangzhou",
    params: {
      PhoneNumbers: phone,
      SignName: signName,
      TemplateCode: templateCode,
      TemplateParam: JSON.stringify({ code }),
    },
  });
}

function pnvsTemplateParam(ttlSeconds: number): string {
  const configured = env("ALIYUN_PNVS_TEMPLATE_PARAM_JSON");
  if (configured) return configured;
  return JSON.stringify({ code: "##code##", min: String(Math.ceil(ttlSeconds / 60)) });
}

function signedAliyunPnvsSendRequest(phone: string, options: TrialSmsSendOptions): { url: string; body: string; outId: string } {
  const accessKeyId = envFirst("ALIYUN_PNVS_ACCESS_KEY_ID", "ALIYUN_SMS_ACCESS_KEY_ID");
  const accessKeySecret = envFirst("ALIYUN_PNVS_ACCESS_KEY_SECRET", "ALIYUN_SMS_ACCESS_KEY_SECRET");
  const signName = envFirst("ALIYUN_PNVS_SIGN_NAME", "ALIYUN_SMS_SIGN_NAME");
  const templateCode = envFirst("ALIYUN_PNVS_TEMPLATE_CODE", "ALIYUN_SMS_TEMPLATE_CODE");
  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    throw new Error("Aliyun PNVS credentials, gifted sign name, and gifted template code are required.");
  }

  const ttlSeconds = options.ttlSeconds || 300;
  const outId = options.outId || crypto.randomUUID();
  const request = signedAliyunRpcRequest({
    endpoint: "https://dypnsapi.aliyuncs.com/",
    action: "SendSmsVerifyCode",
    accessKeyId,
    accessKeySecret,
    regionId: envFirst("ALIYUN_PNVS_REGION_ID", "ALIYUN_SMS_REGION_ID") || "cn-hangzhou",
    params: {
      CountryCode: "86",
      PhoneNumber: phone,
      SignName: signName,
      TemplateCode: templateCode,
      TemplateParam: pnvsTemplateParam(ttlSeconds),
      OutId: outId,
      CodeLength: "6",
      ValidTime: String(ttlSeconds),
      DuplicatePolicy: "1",
      Interval: String(options.cooldownSeconds || 60),
      CodeType: "1",
      ReturnVerifyCode: "false",
      AutoRetry: "1",
      ...(env("ALIYUN_PNVS_SCHEME_NAME") ? { SchemeName: env("ALIYUN_PNVS_SCHEME_NAME") } : {}),
    },
  });
  return {
    ...request,
    outId,
  };
}

function signedAliyunPnvsCheckRequest(phone: string, code: string, options: { outId?: string }): { url: string; body: string } {
  const accessKeyId = envFirst("ALIYUN_PNVS_ACCESS_KEY_ID", "ALIYUN_SMS_ACCESS_KEY_ID");
  const accessKeySecret = envFirst("ALIYUN_PNVS_ACCESS_KEY_SECRET", "ALIYUN_SMS_ACCESS_KEY_SECRET");
  if (!accessKeyId || !accessKeySecret) {
    throw new Error("Aliyun PNVS credentials are required.");
  }

  return signedAliyunRpcRequest({
    endpoint: "https://dypnsapi.aliyuncs.com/",
    action: "CheckSmsVerifyCode",
    accessKeyId,
    accessKeySecret,
    regionId: envFirst("ALIYUN_PNVS_REGION_ID", "ALIYUN_SMS_REGION_ID") || "cn-hangzhou",
    params: {
      CountryCode: "86",
      PhoneNumber: phone,
      VerifyCode: code,
      CaseAuthPolicy: "1",
      ...(options.outId ? { OutId: options.outId } : {}),
      ...(env("ALIYUN_PNVS_SCHEME_NAME") ? { SchemeName: env("ALIYUN_PNVS_SCHEME_NAME") } : {}),
    },
  });
}

async function fetchAliyunJson(request: { url: string; body: string }): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const response = await fetch(request.url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: request.body,
  });
  const json = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, json };
}

export async function sendTrialSmsVerificationCode(
  phone: string,
  code: string,
  options: TrialSmsSendOptions = {}
): Promise<TrialSmsSendResult> {
  const provider = smsProvider();
  if (provider === "mock") return { ok: true, provider };

  try {
    if (provider === "aliyun-pnvs") {
      const request = signedAliyunPnvsSendRequest(phone, options);
      const response = await fetchAliyunJson(request);
      const model = response.json.Model as { OutId?: unknown } | undefined;
      if (response.ok && response.json.Code === "OK" && response.json.Success !== false) {
        return {
          ok: true,
          provider,
          externalVerification: true,
          outId: typeof model?.OutId === "string" ? model.OutId : request.outId,
        };
      }
      return {
        ok: false,
        provider,
        error: typeof response.json.Message === "string" ? response.json.Message : `Aliyun PNVS failed with status ${response.status}`,
      };
    }

    const response = await fetchAliyunJson(signedAliyunSmsRequest(phone, code));
    if (response.ok && response.json.Code === "OK") return { ok: true, provider };
    return {
      ok: false,
      provider,
      error: typeof response.json.Message === "string" ? response.json.Message : `Aliyun SMS failed with status ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      provider,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function verifyTrialSmsVerificationCode(
  phone: string,
  code: string,
  options: { outId?: string } = {}
): Promise<TrialSmsVerifyResult> {
  const provider = smsProvider();
  if (provider === "mock") return { ok: true, provider, verified: true };
  if (provider !== "aliyun-pnvs") return { ok: true, provider, verified: false };

  try {
    const response = await fetchAliyunJson(signedAliyunPnvsCheckRequest(phone, code, options));
    const model = response.json.Model as { VerifyResult?: unknown } | undefined;
    if (response.ok && response.json.Code === "OK" && response.json.Success !== false) {
      return { ok: true, provider, verified: model?.VerifyResult === "PASS" };
    }
    return {
      ok: false,
      provider,
      verified: false,
      error: typeof response.json.Message === "string" ? response.json.Message : `Aliyun PNVS verify failed with status ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      provider,
      verified: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
