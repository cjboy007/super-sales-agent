import fs from "fs";
import path from "path";
import { ensureDir, ssaCompanyDataPath } from "../ssa-data-paths";
import type { SalesRuntime } from "./sales-runtime";
import { syncInboxEmailsToCustomers } from "./customer-activity";

export interface DemoSeedResult {
  workspaceId: string;
  customersCreated: number;
  activitiesCreated: number;
  ordersCreated: number;
  companyIntelQueued: number;
  updatedAt: string;
}

export interface DemoEmailCrmDrillResult {
  workspaceId: string;
  mode: "local_demo";
  received: number;
  activitiesCreated: number;
  orderActivities: number;
  customersUpserted: number;
  companyIntelQueued: number;
  lifecycleStatuses: number;
  updatedAt: string;
}

const PROTECTED_REAL_WORKSPACES = new Set(["farreach", "hero-pumps"]);

function demoWritesAllowedOn(workspaceId: string): boolean {
  if (!PROTECTED_REAL_WORKSPACES.has(workspaceId)) return true;
  return process.env.SSA_ALLOW_DEMO_ON_PROTECTED_WORKSPACES === "true";
}

function assertDemoWritableWorkspace(workspaceId: string): void {
  if (demoWritesAllowedOn(workspaceId)) return;
  throw new Error(
    `Demo data is blocked for real project workspace "${workspaceId}". Use a demo workspace such as "demo-exporter", or set SSA_ALLOW_DEMO_ON_PROTECTED_WORKSPACES=true for an explicit temporary drill.`
  );
}

function piRecordPath(workspaceId: string, piNo: string): string {
  return ssaCompanyDataPath(workspaceId, "documents", "pi-records", `${piNo}.json`);
}

function writeDemoPiRecord(workspaceId: string, now: string): number {
  const filePath = piRecordPath(workspaceId, "PI-BETA-0001");
  ensureDir(path.dirname(filePath));
  const existed = fs.existsSync(filePath);
  fs.writeFileSync(filePath, JSON.stringify({
    piNo: "PI-BETA-0001",
    customer: "Beta Cable Labs",
    date: "2026-06-08",
    amount: "USD 12500.00",
    productSummary: "USB-C active cable pilot order",
    updatedAt: now,
    source: "demo.seed",
    paymentStatus: "pending",
    fulfillmentStatus: "not_started",
    lifecycleStage: "payment",
    data: {
      company: { name: "Farreach Electronic", address: "", phone: "", email: "" },
      customer: { company_name: "Beta Cable Labs", contact: "Nora Buyer", email: "nora@beta-cable.example", phone: "", address: "", country: "USA" },
      shipment: {
        date: "2026-06-08",
        vessel: "",
        departure_port: "Shenzhen",
        destination_port: "Los Angeles",
        incoterms: "FOB",
        country_of_origin: "China",
        marks: "N/M",
      },
      currency: "USD",
      freight: 0,
      insurance: 0,
      products: [
        {
          description: "USB-C active cable",
          specification: "2m / retail pack",
          hs_code: "854442",
          quantity: 5000,
          unit_price: 2.5,
          net_weight_kg: 0.08,
          gross_weight_kg: 0.1,
          dimensions_cm: "20x12x3",
          package_type: "Carton",
          packages: 50,
        },
      ],
      pi_info: { pi_no: "PI-BETA-0001", valid_until: "2026-07-08" },
      ci_info: { ci_no: "", ci_date: "2026-06-08", payment_terms: "30% deposit before production" },
      pl_info: { pl_no: "" },
    },
  }, null, 2), "utf-8");
  return existed ? 0 : 1;
}

export function seedDemoWorkspace(runtime: SalesRuntime, workspaceId: string): DemoSeedResult {
  const workspace = runtime.getWorkspace(workspaceId);
  assertDemoWritableWorkspace(workspace.id);
  const now = new Date().toISOString();
  const imported = runtime.importLeads({
    workspaceId: workspace.id,
    fileName: "beta-demo-customers.csv",
    csv: [
      "company,contact_name,email,website,country,industry,tier,position,confidence,reason",
      "Beta Cable Labs,Nora Buyer,nora@beta-cable.example,https://beta-cable.example,USA,Consumer electronics cable distributor,Tier1 Buyer,Procurement Lead,91%,Demo customer for beta onboarding",
      "Northstar AV Supply,Eric Stone,eric@northstar-av.example,https://northstar-av.example,USA,ProAV integrator,Tier2 Partner,Operations Manager,77%,Demo prospect for follow-up workflow",
    ].join("\n"),
  });
  const synced = syncInboxEmailsToCustomers(runtime, workspace.id, [
    {
      id: "beta-demo-email-1",
      from_email: "nora@beta-cable.example",
      from_name: "Nora Buyer",
      subject: "RFQ and PI confirmation for USB-C active cable pilot",
      body_text: "Please keep PI-BETA-0001 open while our finance team arranges the deposit. We also need the shipment date after payment.",
      received_at: "2026-06-08T08:30:00.000Z",
      status: "received",
      analysis: {
        intent: "order",
        confidence: 0.94,
        urgency: "high",
        sentiment: "positive",
        key_points: ["PI-BETA-0001", "deposit pending", "shipment date needed"],
        customer_level: "Buyer",
        tags: [{ label: "demo", color: "blue" }],
      },
    },
  ], {
    now,
    source: "demo.seed",
  });
  const ordersCreated = writeDemoPiRecord(workspace.id, now);

  runtime.recordEvent("demo.seeded", workspace.id, {
    customersCreated: imported.customers.upserted,
    activitiesCreated: synced.newActivities,
    ordersCreated,
    sideEffects: "local-only",
  });

  return {
    workspaceId: workspace.id,
    customersCreated: imported.customers.upserted,
    activitiesCreated: synced.newActivities,
    ordersCreated,
    companyIntelQueued: imported.companyIntel.queued + synced.companyIntelQueued,
    updatedAt: now,
  };
}

export function runDemoEmailCrmDrill(runtime: SalesRuntime, workspaceId: string, options: { now?: string } = {}): DemoEmailCrmDrillResult {
  const workspace = runtime.getWorkspace(workspaceId);
  assertDemoWritableWorkspace(workspace.id);
  const now = options.now || new Date().toISOString();
  const synced = syncInboxEmailsToCustomers(runtime, workspace.id, [
    {
      id: `demo-email-crm-${now}`,
      from_email: "maya@demo-mail-buyer.example",
      from_name: "Maya Mail",
      subject: "Payment received and shipment exception for PI-DEMO-MAIL-001",
      body_text: "Payment received for PI-DEMO-MAIL-001. HDMI 2.1 cable order USD 4800.00 shipped by DHL, but a customs hold created a shipment exception.",
      received_at: now,
      status: "received",
      analysis: {
        intent: "order",
        confidence: 0.93,
        urgency: "high",
        sentiment: "negative",
        key_points: ["payment received", "shipment exception", "USD 4800.00"],
        customer_level: "Operations",
        tags: [{ label: "demo", color: "blue" }],
      },
    },
  ], {
    now,
    source: "demo.email_crm_drill",
  });

  runtime.recordEvent("demo.email_crm_drill.completed", workspace.id, {
    received: synced.received,
    activitiesCreated: synced.newActivities,
    orderActivities: synced.orderActivities,
    customersUpserted: synced.customersUpserted,
    companyIntelQueued: synced.companyIntelQueued,
    lifecycleStatuses: synced.lifecycleStatuses,
    sideEffects: "local-only",
  });

  return {
    workspaceId: workspace.id,
    mode: "local_demo",
    received: synced.received,
    activitiesCreated: synced.newActivities,
    orderActivities: synced.orderActivities,
    customersUpserted: synced.customersUpserted,
    companyIntelQueued: synced.companyIntelQueued,
    lifecycleStatuses: synced.lifecycleStatuses,
    updatedAt: now,
  };
}
