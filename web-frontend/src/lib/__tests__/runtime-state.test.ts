import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import {
  createAuditEvent,
  deleteAuditEvent,
  deleteDraftRecord,
  deleteQuoteRecord,
  getAuditEvents,
  upsertDraftRecord,
  upsertQuoteRecord,
} from "../db";
import { getEmailDrafts } from "../emails";
import { getQuotations, invalidateQuotationCache } from "../quotations";
import { GET as getAuditRoute } from "../../app/api/audit/route";

describe("ssa-owned runtime state", () => {
  it("persists draft records and exposes them through the email draft list", () => {
    const id = `DRAFT-${randomUUID()}`;
    try {
      upsertDraftRecord({
        id,
        subject: "DB-backed reply draft",
        template: "runtime",
        body: "Draft body",
        source: "ssa-runtime",
        status: "draft",
      });

      const drafts = getEmailDrafts();
      expect(drafts.some((draft) => draft.id === id)).toBe(true);
    } finally {
      deleteDraftRecord(id);
    }
  });

  it("persists quotation records and exposes them through the quotation list", () => {
    const id = `QT-${randomUUID()}`;
    try {
      upsertQuoteRecord({
        id,
        type: "QT",
        customer: "Runtime Buyer",
        amount: "$12,500",
        status: "Draft",
        date: "2026-05-23",
        filePath: null,
        fileType: null,
      });
      invalidateQuotationCache();

      const quotations = getQuotations({ search: id });
      expect(quotations.quotations.some((quotation) => quotation.id === id)).toBe(true);
    } finally {
      deleteQuoteRecord(id);
      invalidateQuotationCache();
    }
  });

  it("stores audit events in SSA runtime state", () => {
    const id = `AUD-${randomUUID()}`;
    try {
      createAuditEvent({
        id,
        type: "draft_generated",
        actor: "test",
        target: "deal-001",
        summary: "Runtime draft created",
        metadata: { source: "test" },
      });

      const events = getAuditEvents(10, "draft_generated");
      expect(events.some((event) => event.id === id)).toBe(true);
    } finally {
      deleteAuditEvent(id);
    }
  });

  it("serves audit events through the API route", async () => {
    const id = `AUD-${randomUUID()}`;
    try {
      createAuditEvent({
        id,
        type: "quote_generated",
        actor: "test",
        target: "quote-001",
        summary: "Runtime quote created",
      });

      const response = await getAuditRoute(
        new Request("http://localhost/api/audit?limit=10&type=quote_generated") as never
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.data.some((event: { id: string }) => event.id === id)).toBe(true);
    } finally {
      deleteAuditEvent(id);
    }
  });
});
