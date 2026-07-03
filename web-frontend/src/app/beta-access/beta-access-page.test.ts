import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(__dirname, "page.tsx"), "utf-8");

describe("beta access page", () => {
  it("presents a non-technical phone trial gate without exposing runtime setup details", () => {
    expect(source).toContain("内测访问");
    expect(source).toContain("已有会员激活码");
    expect(source).toContain("没有会员激活码");
    expect(source).toContain("手机号");
    expect(source).toContain("短信验证码");
    expect(source).toContain("进入 14 天体验");
    expect(source).toContain("13800138000");
    expect(source).toContain("User guide");
    expect(source).toContain("使用指南");
    expect(source).toContain("/user-guide");
    expect(source).toContain("工作台");
    expect(source).toContain("客户跟进");
    expect(source).toContain("演示数据");

    expect(source).not.toContain("SSA_BETA_AUTH");
    expect(source).not.toContain("Authorization");
    expect(source).not.toContain("provider");
    expect(source).not.toContain("jobId");
    expect(source).not.toContain("workflow");
    expect(source).not.toContain("channel_audit");
    expect(source).not.toContain("dataRoot");
    expect(source).not.toContain(".ssa");
  });

  it("lets invited users enter with an existing activation code before any trial setup", () => {
    expect(source).toContain("/api/beta-access/verify");
    expect(source).toContain("accessPassInput");
    expect(source).toContain("verifyAccessPass");
    expect(source).toContain("applyBetaAccessSession(accessPassInput.trim()");
    expect(source.indexOf("/api/beta-access/verify")).toBeLessThan(source.indexOf("applyBetaAccessSession(accessPassInput.trim()"));
    expect(source).toContain("会员激活码无效");
    expect(source).toContain("Activation Code is invalid.");
    expect(source).toContain("Access pass is invalid.");
    expect(source).toContain("直接进入");
    expect(source).not.toContain("已有访问口令");
    expect(source).not.toContain("输入访问口令");
    expect(source).not.toContain("访问口令无效。");
  });

  it("uses the colored SSA brand icon instead of a text placeholder", () => {
    expect(source).toContain("next/image");
    expect(source).toContain("/brand/ssa-icon-192.png");
    expect(source).not.toContain(">SSA</span>");
  });

  it("verifies the phone code before applying the trial session", () => {
    expect(source).toContain("/api/trial-access/send-code");
    expect(source).toContain("/api/trial-access/verify-code");
    expect(source).toContain("applyBetaAccessSession(\"\"");
    expect(source.indexOf("/api/trial-access/verify-code")).toBeLessThan(source.indexOf("applyBetaAccessSession(\"\""));
    expect(source).toContain("验证码无效");

    expect(source).not.toContain("SSA_BETA_AUTH");
    expect(source).not.toContain("Authorization");
    expect(source).not.toContain("dataRoot");
  });

  it("gives beta access buttons visible hover and keyboard focus states", () => {
    expect(source).toContain("hover:-translate-y-0.5");
    expect(source).toContain("hover:bg-[#f59e0b]");
    expect(source).toContain("bg-[#a44912]");
    expect(source).toContain("hover:shadow-[0_0_0_3px_rgb(245_158_11_/_0.25)]");
    expect(source).toContain("focus-visible:ring-2");
    expect(source).toContain("focus-visible:ring-[#f59e0b]");
  });
});
