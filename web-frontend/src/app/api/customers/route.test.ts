import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalAuthTokens = process.env.SSA_BETA_AUTH_TOKENS;
let tempRoot = "";

function request(url: string, token?: string): NextRequest {
  return new NextRequest(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

function writeJson(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-customers-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalAuthTokens === undefined) delete process.env.SSA_BETA_AUTH_TOKENS;
  else process.env.SSA_BETA_AUTH_TOKENS = originalAuthTokens;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("/api/customers route", () => {
  it("uses a one-workspace alpha token as the default customer workspace", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "alpha-a-token", workspaces: ["alpha-a"] },
    ]);
    const projectRoot = path.join(tempRoot, "companies", "alpha-a");
    writeJson(path.join(projectRoot, "customers", "accounts.json"), [
      {
        id: "alpha-a-buyer.example",
        companyName: "Alpha A Buyer",
        country: "USA",
        website: "https://alpha-a-buyer.example",
        domain: "alpha-a-buyer.example",
        industry: "Cable distributor",
        status: "Prospect",
        sources: [],
        intelligence: { status: "queued" },
        createdAt: "2026-06-04T08:00:00.000Z",
        updatedAt: "2026-06-04T08:00:00.000Z",
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/customers", "alpha-a-token"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.customers).toEqual([
      expect.objectContaining({ id: "alpha-a-buyer.example", companyName: "Alpha A Buyer" }),
    ]);
    expect(JSON.stringify(json)).not.toContain("farreach");
  });

  it("blocks a scoped alpha token from writing another workspace customer status", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "alpha-a-token", workspaces: ["alpha-a"] },
    ]);

    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost/api/customers?project=alpha-b", {
      method: "POST",
      headers: { Authorization: "Bearer alpha-a-token" },
      body: JSON.stringify({
        action: "set-status-override",
        customerId: "alpha-b-buyer.example",
        status: "Risk",
        reason: "Should not write across workspaces.",
      }),
    }));

    expect(response.status).toBe(403);
  });

  it("requires wildcard alpha tokens to choose a workspace for customer data", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "admin-token", workspaces: ["*"] },
    ]);

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/customers", "admin-token"));

    expect(response.status).toBe(400);
  });

  it("sets and clears a manual customer lifecycle override with timeline evidence", async () => {
    const projectRoot = path.join(tempRoot, "companies", "farreach");
    writeJson(path.join(projectRoot, "customers", "accounts.json"), [
      {
        id: "override-buyer.example",
        companyName: "Override Buyer",
        country: "USA",
        website: "https://override-buyer.example",
        domain: "override-buyer.example",
        industry: "Cable distributor",
        status: "Prospect",
        sources: [
          {
            type: "lead",
            companyName: "Override Buyer",
            contact: "Olivia",
            role: "Buyer",
            email: "olivia@override-buyer.example",
            website: "https://override-buyer.example",
            country: "USA",
            industry: "Cable distributor",
            category: "Tier2 Partner",
            reason: "Imported customer",
            confidence: "74%",
            importedAt: "2026-06-04T08:00:00.000Z",
          },
        ],
        intelligence: { status: "queued", queuedAt: "2026-06-04T08:00:00.000Z" },
        createdAt: "2026-06-04T08:00:00.000Z",
        updatedAt: "2026-06-04T08:00:00.000Z",
      },
    ]);
    writeJson(path.join(projectRoot, "documents", "pi-records", "PI-OVERRIDE-001.json"), {
      piNo: "PI-OVERRIDE-001",
      customer: "Override Buyer",
      date: "2026-06-05",
      amount: "USD 12000.00",
      productSummary: "USB-C cable program",
      paymentStatus: "paid",
      fulfillmentStatus: "preparing",
      updatedAt: "2026-06-05T09:00:00.000Z",
      source: "documents.generate",
      data: {},
    });

    const { GET, POST } = await import("./route");
    const setResponse = await POST(new NextRequest("http://localhost/api/customers", {
      method: "POST",
      body: JSON.stringify({
        action: "set-status-override",
        workspaceId: "farreach",
        customerId: "override-buyer.example",
        status: "Risk",
        reason: "Finance requested hold until payment terms are reviewed.",
        now: "2026-06-06T10:00:00.000Z",
      }),
    }));
    const setJson = await setResponse.json();

    expect(setResponse.status).toBe(200);
    expect(setJson).toMatchObject({
      success: true,
      data: {
        customerId: "override-buyer.example",
        status: "Risk",
        manualOverride: true,
      },
    });

    const overridden = await GET(request("http://localhost/api/customers?project=farreach&query=Override%20Buyer"));
    const overriddenJson = await overridden.json();
    const overriddenCustomer = overriddenJson.data.customers[0];

    expect(overriddenCustomer).toMatchObject({
      companyName: "Override Buyer",
      status: "Risk",
      statusExplanation: expect.objectContaining({
        status: "Risk",
        manualOverride: true,
        ruleId: "manual.override.risk",
        priority: 100,
        reason: expect.stringContaining("Finance requested hold"),
      }),
    });
    expect(overriddenCustomer.interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "Lifecycle",
        summary: expect.stringContaining("Manual status set to Risk"),
      }),
    ]));
    expect(JSON.stringify(overriddenCustomer)).not.toContain("jobId");
    expect(JSON.stringify(overriddenCustomer)).not.toContain("workflow");
    expect(JSON.stringify(overriddenCustomer)).not.toContain("/Users/");
    expect(JSON.stringify(overriddenCustomer)).not.toContain("PI-OVERRIDE-001");

    const clearResponse = await POST(new NextRequest("http://localhost/api/customers", {
      method: "POST",
      body: JSON.stringify({
        action: "clear-status-override",
        workspaceId: "farreach",
        customerId: "override-buyer.example",
        reason: "Payment terms reviewed; return to automatic lifecycle.",
        now: "2026-06-06T11:00:00.000Z",
      }),
    }));
    const clearJson = await clearResponse.json();

    expect(clearResponse.status).toBe(200);
    expect(clearJson).toMatchObject({
      success: true,
      data: {
        customerId: "override-buyer.example",
        manualOverride: false,
      },
    });

    const cleared = await GET(request("http://localhost/api/customers?project=farreach&query=Override%20Buyer"));
    const clearedJson = await cleared.json();
    const clearedCustomer = clearedJson.data.customers[0];

    expect(clearedCustomer).toMatchObject({
      status: "Active Customer",
      statusExplanation: expect.objectContaining({
        status: "Active Customer",
        manualOverride: false,
        ruleId: "active.order",
      }),
    });
    expect(clearedCustomer.interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "Lifecycle",
        summary: expect.stringContaining("Manual status cleared"),
      }),
    ]));
    expect(JSON.stringify(clearedCustomer)).not.toContain("PI-OVERRIDE-001");
  });

  it("creates a managed customer account when overriding an activity-only customer", async () => {
    const projectRoot = path.join(tempRoot, "companies", "farreach");
    writeJson(path.join(projectRoot, "customers", "activity.json"), [
      {
        id: "email:activity-only",
        workspaceId: "farreach",
        customerId: "activity-only.example",
        customerName: "Activity Only Buyer",
        kind: "email_received",
        occurredAt: "2026-06-04T08:30:00.000Z",
        createdAt: "2026-06-04T08:31:00.000Z",
        contactName: "Ava",
        contactEmail: "ava@activity-only.example",
        subject: "RFQ for HDMI cables",
        summary: "RFQ for HDMI cables - Please quote this week.",
        status: "received",
        source: "test-inbox",
      },
    ]);

    const { GET, POST } = await import("./route");
    const setResponse = await POST(new NextRequest("http://localhost/api/customers", {
      method: "POST",
      body: JSON.stringify({
        action: "set-status-override",
        workspaceId: "farreach",
        customerId: "activity-only.example",
        status: "Risk",
        reason: "Manual review required before follow-up.",
        now: "2026-06-06T10:00:00.000Z",
      }),
    }));
    const setJson = await setResponse.json();

    expect(setResponse.status).toBe(200);
    expect(setJson).toMatchObject({
      success: true,
      data: {
        customerId: "activity-only.example",
        status: "Risk",
        manualOverride: true,
      },
    });

    const accounts = JSON.parse(fs.readFileSync(path.join(projectRoot, "customers", "accounts.json"), "utf-8"));
    expect(accounts[0]).toMatchObject({
      id: "activity-only.example",
      companyName: "Activity Only Buyer",
      status: "Risk",
      statusOverride: expect.objectContaining({
        status: "Risk",
        reason: "Manual review required before follow-up.",
      }),
      sources: [
        expect.objectContaining({
          type: "email",
          contact: "Ava",
          email: "ava@activity-only.example",
        }),
      ],
    });

    const response = await GET(request("http://localhost/api/customers?project=farreach&query=Activity%20Only"));
    const json = await response.json();
    const customer = json.data.customers[0];

    expect(customer).toMatchObject({
      id: "activity-only.example",
      companyName: "Activity Only Buyer",
      status: "Risk",
      statusExplanation: expect.objectContaining({
        manualOverride: true,
        reason: expect.stringContaining("Manual review required"),
      }),
    });
    expect(customer.interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "Lifecycle",
        summary: expect.stringContaining("Manual status set to Risk"),
      }),
      expect.objectContaining({
        type: "Email",
        summary: expect.stringContaining("RFQ for HDMI cables"),
      }),
    ]));
    expect(JSON.stringify(customer)).not.toContain("jobId");
    expect(JSON.stringify(customer)).not.toContain("workflow");
    expect(JSON.stringify(customer)).not.toContain("/Users/");
  });

  it("creates a managed customer account when overriding a lead-only customer from the visible directory", async () => {
    const projectRoot = path.join(tempRoot, "companies", "farreach");
    const leadsDir = path.join(projectRoot, "leads");
    fs.mkdirSync(leadsDir, { recursive: true });
    fs.writeFileSync(
      path.join(leadsDir, "lead-only.csv"),
      [
        "company,contact_name,email,website,country,industry,tier,position,confidence,reason",
        "Lead Only Buyer,Lena,lena@lead-only.example,https://lead-only.example,USA,Electronics,Tier2 Partner,Owner,81%,Imported visible lead",
      ].join("\n"),
      "utf-8"
    );

    const { GET, POST } = await import("./route");
    const initialResponse = await GET(request("http://localhost/api/customers?project=farreach&query=Lead%20Only"));
    const initialJson = await initialResponse.json();
    const visibleCustomerId = initialJson.data.customers[0].id;

    const setResponse = await POST(new NextRequest("http://localhost/api/customers", {
      method: "POST",
      body: JSON.stringify({
        action: "set-status-override",
        workspaceId: "farreach",
        customerId: visibleCustomerId,
        status: "Risk",
        reason: "Hold outreach until business review is complete.",
        now: "2026-06-06T10:00:00.000Z",
      }),
    }));
    const setJson = await setResponse.json();

    expect(setResponse.status).toBe(200);
    expect(setJson).toMatchObject({
      success: true,
      data: {
        customerId: visibleCustomerId,
        status: "Risk",
        manualOverride: true,
      },
    });

    const accounts = JSON.parse(fs.readFileSync(path.join(projectRoot, "customers", "accounts.json"), "utf-8"));
    expect(accounts[0]).toMatchObject({
      id: visibleCustomerId,
      companyName: "Lead Only Buyer",
      country: "USA",
      website: "https://lead-only.example",
      domain: "lead-only.example",
      status: "Risk",
      statusOverride: expect.objectContaining({
        status: "Risk",
        reason: "Hold outreach until business review is complete.",
      }),
      sources: [
        expect.objectContaining({
          type: "lead",
          contact: "Lena",
          email: "lena@lead-only.example",
          reason: "Imported visible lead",
        }),
      ],
    });

    const response = await GET(request("http://localhost/api/customers?project=farreach&query=Lead%20Only"));
    const json = await response.json();
    const customer = json.data.customers[0];

    expect(customer).toMatchObject({
      id: visibleCustomerId,
      companyName: "Lead Only Buyer",
      status: "Risk",
      statusExplanation: expect.objectContaining({
        manualOverride: true,
        reason: expect.stringContaining("Hold outreach"),
      }),
    });
    expect(customer.interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "Lifecycle",
        summary: expect.stringContaining("Manual status set to Risk"),
      }),
    ]));
    expect(JSON.stringify(customer)).not.toContain("jobId");
    expect(JSON.stringify(customer)).not.toContain("workflow");
    expect(JSON.stringify(customer)).not.toContain("/Users/");
  });

  it("serves Customer/Account records even when lead source files are unavailable", async () => {
    writeJson(path.join(tempRoot, "companies", "farreach", "customers", "accounts.json"), [
      {
        id: "stored.example",
        companyName: "Stored Account",
        country: "Canada",
        website: "https://stored.example",
        domain: "stored.example",
        industry: "Industrial cable distributor",
        status: "Prospect",
        sources: [
          {
            type: "lead",
            companyName: "Stored Account",
            contact: "Mia",
            role: "Buyer",
            email: "mia@stored.example",
            website: "https://stored.example",
            country: "Canada",
            industry: "Industrial cable distributor",
            category: "Tier2 Partner",
            reason: "Imported from CRM",
            confidence: "70%",
            importedAt: "2026-06-03T08:00:00.000Z",
          },
        ],
        intelligence: { status: "queued", queuedAt: "2026-06-03T08:00:00.000Z" },
        createdAt: "2026-06-03T08:00:00.000Z",
        updatedAt: "2026-06-03T08:00:00.000Z",
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/customers?project=farreach&query=Stored%20Account"));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.customers[0]).toMatchObject({
      id: "stored.example",
      companyName: "Stored Account",
      country: "Canada",
      status: "Prospect",
      contacts: [
        expect.objectContaining({
          name: "Mia",
          email: "mia@stored.example",
        }),
      ],
      intelligence: expect.objectContaining({
        status: "queued",
      }),
    });
  });

  it("merges account and lead buckets that resolve to the same customer id", async () => {
    const projectRoot = path.join(tempRoot, "companies", "farreach");
    writeJson(path.join(projectRoot, "customers", "accounts.json"), [
      {
        id: "cable-demo",
        companyName: "Cable Demo",
        country: "USA",
        website: "",
        domain: "",
        industry: "Cable distributor",
        status: "Prospect",
        sources: [],
        intelligence: { status: "queued", queuedAt: "2026-06-03T08:00:00.000Z" },
        createdAt: "2026-06-03T08:00:00.000Z",
        updatedAt: "2026-06-03T08:00:00.000Z",
      },
    ]);
    fs.mkdirSync(path.join(projectRoot, "leads"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, "leads", "cable-demo.csv"),
      [
        "company,contact_name,email,website,country,industry,tier,position,confidence,reason",
        "Cable Demo,Dana,dana@cable-demo.example,,USA,Cable distributor,Tier2 Partner,Buyer,75%,Imported demo lead",
      ].join("\n"),
      "utf-8"
    );

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/customers?project=farreach&query=Cable%20Demo&pageSize=20"));
    const json = await response.json();
    const ids = json.data.customers.map((customer: { id: string }) => customer.id);

    expect(response.status).toBe(200);
    expect(ids.filter((id: string) => id === "cable-demo")).toHaveLength(1);
    expect(json.data.customers[0]).toMatchObject({
      id: "cable-demo",
      companyName: "Cable Demo",
      contacts: [
        expect.objectContaining({
          name: "Dana",
          email: "dana@cable-demo.example",
        }),
      ],
    });
  });

  it("lists a customer immediately after lead import queues company-intel", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();

    const imported = runtime.importLeads({
      workspaceId: "farreach",
      fileName: "imported-customers.csv",
      csv: [
        "company,contact_name,email,website,country,industry,tier,position,confidence",
        "Imported Buyer,Ada,ada@imported.example,https://imported.example,USA,Connectors,Tier2 Partner,Buyer,76%",
      ].join("\n"),
    });
    expect(imported.companyIntel).toMatchObject({ queued: 1, skipped: 0 });
    expect(imported.customers).toMatchObject({
      upserted: 1,
      accounts: ["imported.example"],
    });
    const accountsPath = path.join(tempRoot, "companies", "farreach", "customers", "accounts.json");
    expect(JSON.parse(fs.readFileSync(accountsPath, "utf-8"))[0]).toMatchObject({
      id: "imported.example",
      companyName: "Imported Buyer",
      status: "Prospect",
      sources: [
        expect.objectContaining({
          type: "lead",
          companyName: "Imported Buyer",
          email: "ada@imported.example",
        }),
      ],
      intelligence: expect.objectContaining({
        status: "queued",
      }),
    });

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/customers?project=farreach&query=Imported%20Buyer"));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.customers[0]).toMatchObject({
      companyName: "Imported Buyer",
      country: "USA",
      status: "Prospect",
      contacts: [
        expect.objectContaining({
          name: "Ada",
          email: "ada@imported.example",
        }),
      ],
    });
    expect(runtime.snapshot().jobs[0]).toMatchObject({
      workflow: "company_intel.run",
      status: "queued",
    });
  });

  it("returns a clean customer list/detail view without backend audit or path fields", async () => {
    const projectRoot = path.join(tempRoot, "companies", "farreach");
    const leadsDir = path.join(projectRoot, "leads");
    fs.mkdirSync(leadsDir, { recursive: true });
    fs.writeFileSync(
      path.join(leadsDir, "g-beres.csv"),
      [
        "company,contact_name,email,website,country,industry,tier,position,confidence,reason",
        "G. Beres Marketing (1983) Ltd,Roee Ran,roee@beres.co.il,https://www.beres.co.il,Israel,Telecom cables and passive communications accessories,Tier1 Buyer,Quality & Engineering Manager,88%,FOA lists Beres as Israel cable distributor; PO #BERES-2026-034; follow-up workflow ready",
      ].join("\n"),
      "utf-8"
    );

    writeJson(path.join(projectRoot, "intelligence", "clients", "beres.co", "client-intel.json"), {
      company: {
        name: "G. Beres Marketing (1983) Ltd",
        country: "Israel",
        website: "https://www.beres.co.il",
        domain: "beres.co.il",
        status: "active",
        confidence: "high",
      },
      channel_audit: [
        {
          channel: "linkedin_public",
          status: "not_configured",
          provider: "public_search:linkedin",
          checked_at: "2026-06-03T00:33:40.700Z",
          note: "LinkedIn public search needs a configured public-search provider.",
        },
      ],
      financial_data: { revenue: null, currency: null, employees: null, source: "not configured", confidence: "low" },
      recent_developments: [{ date: "N/A", event: "No public update found.", source_url: "" }],
      product_portfolio: {
        main_products: ["Telecom cables", "Passive communications accessories"],
        brands: [],
        oem_or_private_label: "unknown",
        price_positioning: "unknown",
      },
      sales_entry: {
        product_match: "Farreach cables match Beres telecom accessories demand.",
        angle: "Open with cable replacement and OEM accessory sourcing.",
        opener_business: "Beres is an Israel cable distributor.",
        opener_product: "Start from HDMI/DP/USB cable program fit.",
        evidence: ["Line card and lead-pool signal"],
      },
      contacts: [
        {
          name: "Roee Ran",
          role: "Quality & Engineering Manager",
          email: "roee@beres.co.il",
          verification_status: "not_checked",
          source_note: "From lead import.",
        },
      ],
      email_candidates: [],
      lead_score: 96,
      rating: "Hot",
      recommended_next_actions: ["Verify contact", "Prepare outreach"],
      source_list: [{ label: "Official website", url: "https://www.beres.co.il", note: "Fetched official website." }],
      generated_at: "2026-06-03T00:33:40.700Z",
      skill: "company-intel",
      workflow: "company_intel.run",
    });

    writeJson(path.join(projectRoot, "clients", "g-beres", "client-profile.json"), {
      company: "G. Beres Marketing",
      country: "Israel",
      contact: "Roee Ran",
      industry: "ProAV / Cable Brand",
      status: "Active - Quotation in Progress",
      stage: "Negotiation",
      products_quoted: ["HDMI cables", "DP cables"],
      rfq_date: "2026-05-28",
      last_updated: "2026-05-29",
    });

    writeJson(path.join(projectRoot, ".jadenos", "manifest", "files.json"), [
      {
        id: "QT-20260602-001:pdf:/Users/wilson/.ssa/data/companies/farreach/quotations/QT-20260602-001.pdf",
        kind: "quotation",
        documentNo: "QT-20260602-001",
        fileName: "QT-20260602-001.pdf",
        path: path.join(projectRoot, "quotations", "QT-20260602-001.pdf"),
        format: "pdf",
        customer: "G. Beres Marketing (1983) Ltd",
        amount: "USD 12800.00",
        mainProducts: "HDMI cables, DP cables",
        sourceAction: "quotation.generate",
        updatedAt: "2026-06-02T12:00:00.000Z",
      },
    ]);
    fs.mkdirSync(path.join(projectRoot, "quotations"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "quotations", "QT-20260602-001.pdf"), "fake-pdf", "utf-8");

    writeJson(path.join(projectRoot, "documents", "pi-records", "PI-20260603-001.json"), {
      piNo: "PI-20260603-001",
      customer: "G. Beres Marketing (1983) Ltd",
      date: "2026-06-03",
      amount: "USD 9400.00",
      productSummary: "USB-C to HDMI Active",
      updatedAt: "2026-06-03T08:00:00.000Z",
      source: "documents.generate",
      data: {},
    });

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/customers?project=farreach&query=G%20Beres"));
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.customers[0]).toMatchObject({
      id: "beres.co",
      companyName: "G. Beres Marketing (1983) Ltd",
      country: "Israel",
      status: "Active Customer",
      statusExplanation: expect.objectContaining({
        status: "Active Customer",
        reason: expect.stringContaining("order"),
      }),
      intelligence: {
        score: 96,
        rating: "Hot",
      },
    });
    expect(json.data.customers[0].contacts[0]).toMatchObject({
      name: "Roee Ran",
      role: "Quality & Engineering Manager",
      email: "roee@beres.co.il",
      emailStatus: "not_checked",
    });
    expect(json.data.customers[0].orders).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "QT",
        date: "2026-05-28",
        productType: "HDMI cables, DP cables",
        status: "Negotiation",
        lifecycle: expect.objectContaining({
          stage: "quote",
          nextStep: expect.any(String),
        }),
      }),
      expect.objectContaining({
        type: "PI",
        productType: "USB-C to HDMI Active",
        amount: "USD 9400.00",
        lifecycle: expect.objectContaining({
          stage: "payment",
          paymentStatus: "pending",
          fulfillmentStatus: "not_started",
        }),
      }),
      expect.objectContaining({
        type: "QT",
        productType: "HDMI cables, DP cables",
        amount: "USD 12800.00",
        lifecycle: expect.objectContaining({
          stage: "quote",
        }),
      }),
    ]));
    expect(json.data.customers[0].interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "Lifecycle",
        summary: expect.stringContaining("Active Customer"),
      }),
      expect.objectContaining({
        type: "Payment",
        summary: expect.stringContaining("USD 9400.00"),
      }),
      expect.objectContaining({
        type: "Shipment",
        summary: expect.stringContaining("USB-C to HDMI Active"),
      }),
    ]));
    for (const order of json.data.customers[0].orders) {
      expect(order).not.toHaveProperty("id");
    }

    expect(serialized).not.toContain("channel_audit");
    expect(serialized).not.toContain("linkedin_public");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("client-intel.json");
    expect(serialized).not.toContain("client-intel.md");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("paths");
    expect(serialized).not.toContain("workspaceId");
    expect(serialized).not.toContain("jobId");
    expect(serialized).not.toContain("workflow");
    expect(serialized).not.toContain("PO #BERES-2026-034");
    expect(serialized).not.toContain("RFQ-20260528-BERES-CO-IL");
    expect(serialized).not.toContain("PI-20260603-001");
    expect(serialized).not.toContain("QT-20260602-001");
  });

  it("syncs inbound email into CRM customers with automatic status and timeline", async () => {
    const { createSalesRuntime, syncInboxEmailsToCustomers } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();

    const synced = syncInboxEmailsToCustomers(runtime, "farreach", [
      {
        id: "email-rfq-1",
        from_email: "buyer@new-cable.example",
        from_name: "Nora Buyer",
        subject: "RFQ for USB-C cable program",
        body_text: "Please quote 3000 pcs USB-C to HDMI cables this week.",
        received_at: "2026-06-04T08:30:00.000Z",
        status: "pending_decision",
        analysis: {
          intent: "inquiry_rfq",
          confidence: 0.92,
          urgency: "high",
          sentiment: "positive",
          key_points: ["3000 pcs USB-C to HDMI", "Quote needed this week"],
          customer_level: "Buyer",
          tags: [],
        },
      },
    ], {
      now: "2026-06-04T08:31:00.000Z",
      source: "test-inbox",
    });

    expect(synced).toMatchObject({
      newActivities: 1,
      customersUpserted: 1,
      companyIntelQueued: 1,
    });

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/customers?project=farreach&query=New%20Cable"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.customers[0]).toMatchObject({
      companyName: "New Cable",
      status: "Active Customer",
      statusExplanation: expect.objectContaining({
        status: "Active Customer",
        reason: expect.stringContaining("inbound email"),
      }),
      intelligence: expect.objectContaining({
        status: "queued",
      }),
    });
    expect(json.data.customers[0].contacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "Nora Buyer",
        email: "buyer@new-cable.example",
      }),
    ]));
    expect(json.data.customers[0].interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "Email",
        summary: expect.stringContaining("RFQ for USB-C cable program"),
      }),
    ]));
    expect(json.data.customers[0].recentSummary).toContain("RFQ for USB-C cable program");
  });

  it("uses explicit lifecycle rules with priority, conditions, manual override, and timeline evidence", async () => {
    const projectRoot = path.join(tempRoot, "companies", "farreach");
    writeJson(path.join(projectRoot, "customers", "accounts.json"), [
      {
        id: "manual-risk.example",
        companyName: "Manual Risk Account",
        country: "USA",
        website: "https://manual-risk.example",
        domain: "manual-risk.example",
        industry: "Cable distributor",
        status: "Risk",
        sources: [
          {
            type: "lead",
            companyName: "Manual Risk Account",
            contact: "Ria",
            role: "Buyer",
            email: "ria@manual-risk.example",
            website: "https://manual-risk.example",
            country: "USA",
            industry: "Cable distributor",
            category: "Tier2 Partner",
            reason: "Imported customer",
            confidence: "78%",
            importedAt: "2026-06-04T08:00:00.000Z",
          },
        ],
        intelligence: { status: "queued", queuedAt: "2026-06-04T08:00:00.000Z" },
        createdAt: "2026-06-04T08:00:00.000Z",
        updatedAt: "2026-06-04T08:00:00.000Z",
      },
    ]);
    writeJson(path.join(projectRoot, "documents", "pi-records", "PI-MANUAL-RISK.json"), {
      piNo: "PI-MANUAL-RISK",
      customer: "Manual Risk Account",
      date: "2026-06-05",
      amount: "USD 12000.00",
      productSummary: "USB-C cable program",
      paymentStatus: "paid",
      fulfillmentStatus: "preparing",
      updatedAt: "2026-06-05T09:00:00.000Z",
      source: "documents.generate",
      data: {},
    });

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/customers?project=farreach&query=Manual%20Risk"));
    const json = await response.json();
    const customer = json.data.customers[0];

    expect(response.status).toBe(200);
    expect(customer).toMatchObject({
      companyName: "Manual Risk Account",
      status: "Risk",
      statusExplanation: expect.objectContaining({
        status: "Risk",
        manualOverride: true,
        ruleId: "manual.override.risk",
        priority: 100,
        enteredWhen: expect.stringContaining("manually"),
        exitsWhen: expect.stringContaining("manual override"),
      }),
    });
    expect(customer.statusExplanation.reason).toContain("manual");
    expect(customer.statusExplanation.signals).toEqual(expect.arrayContaining(["manual override: Risk"]));
    expect(customer.interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "Lifecycle",
        summary: expect.stringContaining("manually set to Risk"),
      }),
    ]));
    expect(JSON.stringify(customer.interactions)).not.toContain("manual.override.risk");
    expect(JSON.stringify(customer.interactions)).not.toContain("priority 100");
    expect(JSON.stringify(customer)).not.toContain("PI-MANUAL-RISK.json");
    expect(JSON.stringify(customer)).not.toContain("PI-MANUAL-RISK");
    expect(JSON.stringify(customer)).not.toContain("workflow");
    expect(JSON.stringify(customer)).not.toContain("jobId");
  });

  it("adds exception order nodes to timeline and risk lifecycle evaluation", async () => {
    const projectRoot = path.join(tempRoot, "companies", "farreach");
    writeJson(path.join(projectRoot, "customers", "accounts.json"), [
      {
        id: "exception-order.example",
        companyName: "Exception Order Buyer",
        country: "USA",
        website: "https://exception-order.example",
        domain: "exception-order.example",
        industry: "Cable distributor",
        status: "Prospect",
        sources: [
          {
            type: "lead",
            companyName: "Exception Order Buyer",
            contact: "Evan",
            role: "Buyer",
            email: "evan@exception-order.example",
            website: "https://exception-order.example",
            country: "USA",
            industry: "Cable distributor",
            category: "Tier2 Partner",
            reason: "Imported customer",
            confidence: "74%",
            importedAt: "2026-06-04T08:00:00.000Z",
          },
        ],
        intelligence: { status: "queued", queuedAt: "2026-06-04T08:00:00.000Z" },
        createdAt: "2026-06-04T08:00:00.000Z",
        updatedAt: "2026-06-04T08:00:00.000Z",
      },
    ]);
    writeJson(path.join(projectRoot, "documents", "pi-records", "PI-EXCEPTION-001.json"), {
      piNo: "PI-EXCEPTION-001",
      customer: "Exception Order Buyer",
      date: "2026-06-06",
      amount: "USD 8600.00",
      productSummary: "DisplayPort cable order",
      paymentStatus: "overdue",
      fulfillmentStatus: "exception",
      lifecycleStage: "exception",
      status: "Exception",
      updatedAt: "2026-06-06T09:00:00.000Z",
      source: "documents.generate",
      data: {},
    });

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/customers?project=farreach&query=Exception%20Order"));
    const json = await response.json();
    const customer = json.data.customers[0];

    expect(response.status).toBe(200);
    expect(customer).toMatchObject({
      companyName: "Exception Order Buyer",
      status: "Risk",
      statusExplanation: expect.objectContaining({
        ruleId: "risk.order_exception",
        reason: expect.stringContaining("exception"),
      }),
    });
    expect(customer.orders).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "PI",
        productType: "DisplayPort cable order",
        lifecycle: expect.objectContaining({
          stage: "exception",
          paymentStatus: "overdue",
          fulfillmentStatus: "exception",
          nextStep: expect.stringContaining("Review exception"),
        }),
      }),
    ]));
    expect(customer.interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "Exception",
        summary: expect.stringContaining("overdue"),
      }),
    ]));
    expect(JSON.stringify(customer)).not.toContain("PI-EXCEPTION-001.json");
    expect(JSON.stringify(customer)).not.toContain("PI-EXCEPTION-001");
  });

  it("adds after-sales and refund order nodes to the customer timeline", async () => {
    const projectRoot = path.join(tempRoot, "companies", "farreach");
    writeJson(path.join(projectRoot, "customers", "accounts.json"), [
      {
        id: "service-buyer.example",
        companyName: "Service Buyer",
        country: "USA",
        website: "https://service-buyer.example",
        domain: "service-buyer.example",
        industry: "Cable distributor",
        status: "Prospect",
        sources: [
          {
            type: "lead",
            companyName: "Service Buyer",
            contact: "Sam",
            role: "Buyer",
            email: "sam@service-buyer.example",
            website: "https://service-buyer.example",
            country: "USA",
            industry: "Cable distributor",
            category: "Tier2 Partner",
            reason: "Imported customer",
            confidence: "74%",
            importedAt: "2026-06-04T08:00:00.000Z",
          },
        ],
        intelligence: { status: "queued", queuedAt: "2026-06-04T08:00:00.000Z" },
        createdAt: "2026-06-04T08:00:00.000Z",
        updatedAt: "2026-06-04T08:00:00.000Z",
      },
    ]);
    writeJson(path.join(projectRoot, "documents", "pi-records", "PI-AFTER-SALES.json"), {
      piNo: "PI-AFTER-SALES",
      customer: "Service Buyer",
      date: "2026-06-06",
      amount: "USD 4200.00",
      productSummary: "HDMI cable replacement",
      paymentStatus: "paid",
      fulfillmentStatus: "delivered",
      lifecycleStage: "after_sales",
      status: "After-sales",
      updatedAt: "2026-06-06T09:00:00.000Z",
      source: "documents.generate",
      data: {},
    });
    writeJson(path.join(projectRoot, "documents", "pi-records", "PI-REFUND-001.json"), {
      piNo: "PI-REFUND-001",
      customer: "Service Buyer",
      date: "2026-06-07",
      amount: "USD 900.00",
      productSummary: "USB-C cable refund",
      paymentStatus: "refunded",
      fulfillmentStatus: "delivered",
      lifecycleStage: "refund",
      status: "Refund",
      updatedAt: "2026-06-07T09:00:00.000Z",
      source: "documents.generate",
      data: {},
    });

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/customers?project=farreach&query=Service%20Buyer"));
    const json = await response.json();
    const customer = json.data.customers[0];

    expect(response.status).toBe(200);
    expect(customer.orders).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "PI",
        productType: "HDMI cable replacement",
        lifecycle: expect.objectContaining({
          stage: "after_sales",
          nextStep: expect.stringContaining("after-sales"),
        }),
      }),
      expect.objectContaining({
        type: "PI",
        productType: "USB-C cable refund",
        lifecycle: expect.objectContaining({
          stage: "refund",
          paymentStatus: "refunded",
          nextStep: expect.stringContaining("refund"),
        }),
      }),
    ]));
    expect(customer.interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "After-sales",
        summary: expect.stringContaining("HDMI cable replacement"),
      }),
      expect.objectContaining({
        type: "Refund",
        summary: expect.stringContaining("USB-C cable refund"),
      }),
    ]));
    expect(JSON.stringify(customer)).not.toContain("PI-AFTER-SALES");
    expect(JSON.stringify(customer)).not.toContain("PI-REFUND-001");
  });

  it("persists order lifecycle activities into customer timeline and risk rules without exposing internal order numbers", async () => {
    const projectRoot = path.join(tempRoot, "companies", "farreach");
    writeJson(path.join(projectRoot, "customers", "accounts.json"), [
      {
        id: "activity-order.example",
        companyName: "Activity Order Buyer",
        country: "USA",
        website: "https://activity-order.example",
        domain: "activity-order.example",
        industry: "Cable distributor",
        status: "Prospect",
        sources: [
          {
            type: "lead",
            companyName: "Activity Order Buyer",
            contact: "Pat",
            role: "Buyer",
            email: "pat@activity-order.example",
            website: "https://activity-order.example",
            country: "USA",
            industry: "Cable distributor",
            category: "Tier2 Partner",
            reason: "Imported customer",
            confidence: "74%",
            importedAt: "2026-06-04T08:00:00.000Z",
          },
        ],
        intelligence: { status: "queued", queuedAt: "2026-06-04T08:00:00.000Z" },
        createdAt: "2026-06-04T08:00:00.000Z",
        updatedAt: "2026-06-04T08:00:00.000Z",
      },
    ]);

    const { appendCustomerOrderActivity } = await import("@/lib/runtime");
    appendCustomerOrderActivity({
      workspaceId: "farreach",
      customerId: "activity-order.example",
      customerName: "Activity Order Buyer",
      contactName: "Pat",
      contactEmail: "pat@activity-order.example",
      orderNumber: "PI-ACTIVITY-001",
      orderType: "PI",
      productType: "USB-C cable program",
      amount: "USD 6800.00",
      lifecycleStage: "payment",
      paymentStatus: "paid",
      fulfillmentStatus: "preparing",
      occurredAt: "2026-06-08T09:00:00.000Z",
      source: "test-order-update",
    });
    appendCustomerOrderActivity({
      workspaceId: "farreach",
      customerId: "activity-order.example",
      customerName: "Activity Order Buyer",
      contactName: "Pat",
      contactEmail: "pat@activity-order.example",
      orderNumber: "PI-ACTIVITY-001",
      orderType: "PI",
      productType: "USB-C cable program",
      amount: "USD 6800.00",
      lifecycleStage: "exception",
      paymentStatus: "paid",
      fulfillmentStatus: "exception",
      status: "Shipment exception",
      occurredAt: "2026-06-09T09:00:00.000Z",
      source: "test-order-update",
    });

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/customers?project=farreach&query=Activity%20Order"));
    const json = await response.json();
    const customer = json.data.customers[0];

    expect(response.status).toBe(200);
    expect(customer).toMatchObject({
      companyName: "Activity Order Buyer",
      status: "Risk",
      statusExplanation: expect.objectContaining({
        ruleId: "risk.order_activity_exception",
        reason: expect.stringContaining("order activity"),
      }),
    });
    expect(customer.interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "Payment",
        summary: expect.stringContaining("USD 6800.00"),
      }),
      expect.objectContaining({
        type: "Exception",
        summary: expect.stringContaining("shipment exception"),
      }),
    ]));
    const serialized = JSON.stringify(customer);
    expect(serialized).not.toContain("PI-ACTIVITY-001");
    expect(serialized).not.toContain("jobId");
    expect(serialized).not.toContain("workflow");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("/Users/");
  });

  it("lets a newer resolved order activity exit the order-risk lifecycle rule", async () => {
    const projectRoot = path.join(tempRoot, "companies", "farreach");
    writeJson(path.join(projectRoot, "customers", "accounts.json"), [
      {
        id: "resolved-order.example",
        companyName: "Resolved Order Buyer",
        country: "USA",
        website: "https://resolved-order.example",
        domain: "resolved-order.example",
        industry: "Cable distributor",
        status: "Prospect",
        sources: [
          {
            type: "lead",
            companyName: "Resolved Order Buyer",
            contact: "Rae",
            role: "Buyer",
            email: "rae@resolved-order.example",
            website: "https://resolved-order.example",
            country: "USA",
            industry: "Cable distributor",
            category: "Tier2 Partner",
            reason: "Imported customer",
            confidence: "74%",
            importedAt: "2026-06-04T08:00:00.000Z",
          },
        ],
        intelligence: { status: "queued", queuedAt: "2026-06-04T08:00:00.000Z" },
        createdAt: "2026-06-04T08:00:00.000Z",
        updatedAt: "2026-06-04T08:00:00.000Z",
      },
    ]);

    const { appendCustomerOrderActivity } = await import("@/lib/runtime");
    appendCustomerOrderActivity({
      workspaceId: "farreach",
      customerId: "resolved-order.example",
      customerName: "Resolved Order Buyer",
      contactName: "Rae",
      contactEmail: "rae@resolved-order.example",
      orderNumber: "PI-RESOLVED-001",
      orderType: "PI",
      productType: "USB-C cable program",
      amount: "USD 6800.00",
      lifecycleStage: "exception",
      paymentStatus: "overdue",
      fulfillmentStatus: "exception",
      status: "Shipment exception",
      occurredAt: "2026-06-08T09:00:00.000Z",
      source: "test-order-update",
    });
    appendCustomerOrderActivity({
      workspaceId: "farreach",
      customerId: "resolved-order.example",
      customerName: "Resolved Order Buyer",
      contactName: "Rae",
      contactEmail: "rae@resolved-order.example",
      orderNumber: "PI-RESOLVED-001",
      orderType: "PI",
      productType: "USB-C cable program",
      amount: "USD 6800.00",
      lifecycleStage: "shipment",
      paymentStatus: "paid",
      fulfillmentStatus: "delivered",
      status: "Delivered",
      occurredAt: "2026-06-09T09:00:00.000Z",
      source: "test-order-update",
    });

    const { GET } = await import("./route");
    const response = await GET(request("http://localhost/api/customers?project=farreach&query=Resolved%20Order"));
    const json = await response.json();
    const customer = json.data.customers[0];

    expect(response.status).toBe(200);
    expect(customer).toMatchObject({
      companyName: "Resolved Order Buyer",
      status: "Active Customer",
      statusExplanation: expect.objectContaining({
        ruleId: "active.order",
        exitsWhen: expect.stringContaining("Risk"),
      }),
    });
    expect(customer.orders).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "PI",
        productType: "USB-C cable program",
        lifecycle: expect.objectContaining({
          stage: "shipment",
          paymentStatus: "paid",
          fulfillmentStatus: "delivered",
        }),
      }),
    ]));
    expect(customer.interactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "Exception",
        summary: expect.stringMatching(/shipment exception/i),
      }),
      expect.objectContaining({
        type: "Shipment",
        summary: expect.stringContaining("delivered"),
      }),
    ]));
    const serialized = JSON.stringify(customer);
    expect(serialized).not.toContain("PI-RESOLVED-001");
    expect(serialized).not.toContain("jobId");
    expect(serialized).not.toContain("workflow");
  });
});
