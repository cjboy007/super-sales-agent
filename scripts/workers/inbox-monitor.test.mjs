import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runInboxMonitor } from "./inbox-monitor.mjs";

function tempDataRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ssa-inbox-monitor-test-"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

test("records new local inbox messages and stores state under SSA_DATA_ROOT", async () => {
  const dataRoot = tempDataRoot();
  try {
    writeJson(path.join(dataRoot, "companies", "farreach", "inbox", "incoming.json"), [
      {
        id: "msg-001",
        from: "buyer@example.com",
        subject: "RFQ for UL1007 wire",
        receivedAt: "2026-05-28T01:00:00.000Z",
        body: "Please quote 100k meters.",
        importance: "high"
      },
      {
        id: "msg-002",
        from_email: "newsletter@example.com",
        subject: "Weekly newsletter",
        received_at: "2026-05-28T01:05:00.000Z",
        body_text: "Market update",
        importance: "low"
      }
    ]);

    const result = await runInboxMonitor({ workspace: "farreach", dataRoot, now: "2026-05-28T01:10:00.000Z" });

    assert.equal(result.status, "new_mail");
    assert.equal(result.workspace, "farreach");
    assert.equal(result.newCount, 2);
    assert.equal(result.importantCount, 1);
    assert.deepEqual(result.newMessages.map((message) => message.id), ["msg-001", "msg-002"]);

    const state = JSON.parse(fs.readFileSync(path.join(dataRoot, "companies", "farreach", "inbox", "monitor-state.json"), "utf-8"));
    assert.deepEqual(Object.keys(state.seen).sort(), ["msg-001", "msg-002"]);

    const events = JSON.parse(fs.readFileSync(path.join(dataRoot, "companies", "farreach", "events", "events.json"), "utf-8"));
    assert.equal(events[0].type, "inbox.monitor.new_mail");
    assert.equal(events[0].workspaceId, "farreach");
    assert.equal(events[0].payload.newCount, 2);
    assert.equal(events[0].payload.activitiesWritten, 2);

    const accounts = JSON.parse(fs.readFileSync(path.join(dataRoot, "companies", "farreach", "customers", "accounts.json"), "utf-8"));
    assert.equal(accounts[0].id, "example.com");
    assert.equal(accounts[0].sources[0].type, "email");

    const activity = JSON.parse(fs.readFileSync(path.join(dataRoot, "companies", "farreach", "customers", "activity.json"), "utf-8"));
    assert.equal(activity.length, 2);
    assert.equal(activity[0].kind, "email_received");
    assert.equal(activity[0].source, "mailbox-sync");
    assert.equal(activity[1].source, "mailbox-sync");
    assert.doesNotMatch(JSON.stringify(activity), new RegExp(dataRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(JSON.stringify(activity), /incoming\.json/i);
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("records order lifecycle activity from inbound order emails", async () => {
  const dataRoot = tempDataRoot();
  try {
    writeJson(path.join(dataRoot, "companies", "farreach", "inbox", "incoming.json"), [
      {
        id: "order-msg-001",
        from_email: "ops@monitor-order.example",
        from_name: "Mina Ops",
        subject: "Payment received and shipment booked for PI-MONITOR-001",
        received_at: "2026-06-08T05:00:00.000Z",
        body_text: "Payment received for PI-MONITOR-001. HDMI cable order USD 5200.00 has shipped by DHL.",
        importance: "high"
      },
      {
        id: "order-msg-002",
        from_email: "ops@monitor-order.example",
        from_name: "Mina Ops",
        subject: "Shipment exception for PI-MONITOR-001",
        received_at: "2026-06-09T05:00:00.000Z",
        body_text: "Shipment exception: customs hold for HDMI cable order. Payment remains paid.",
        importance: "high"
      }
    ]);

    const result = await runInboxMonitor({ workspace: "farreach", dataRoot, now: "2026-06-09T05:10:00.000Z" });

    assert.equal(result.status, "new_mail");
    assert.equal(result.newCount, 2);
    assert.equal(result.orderActivitiesWritten, 2);

    const events = JSON.parse(fs.readFileSync(path.join(dataRoot, "companies", "farreach", "events", "events.json"), "utf-8"));
    assert.equal(events[0].payload.orderActivitiesWritten, 2);

    const activity = JSON.parse(fs.readFileSync(path.join(dataRoot, "companies", "farreach", "customers", "activity.json"), "utf-8"));
    const orderActivities = activity.filter((item) => item.kind === "order_status");
    assert.equal(orderActivities.length, 2);
    assert.equal(orderActivities[0].source, "mailbox-sync");
    assert.equal(orderActivities[1].source, "mailbox-sync");
    assert.doesNotMatch(JSON.stringify(orderActivities), new RegExp(dataRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(JSON.stringify(orderActivities), /incoming\.json/i);
    assert.match(orderActivities[0].summary, /shipment exception/i);
    assert.equal(orderActivities[0].metadata.orderNumber, "PI-MONITOR-001");
    assert.equal(orderActivities[0].metadata.fulfillmentStatus, "exception");
    assert.match(orderActivities[1].summary, /HDMI cable order shipment shipped for USD 5200.00/i);
    assert.equal(orderActivities[1].metadata.paymentStatus, "paid");
    assert.equal(orderActivities[1].metadata.fulfillmentStatus, "shipped");
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("dedupes messages already seen by the SSA-owned monitor state", async () => {
  const dataRoot = tempDataRoot();
  try {
    const inboxPath = path.join(dataRoot, "companies", "hero-pumps", "inbox", "incoming.jsonl");
    fs.mkdirSync(path.dirname(inboxPath), { recursive: true });
    fs.writeFileSync(
      inboxPath,
      [
        JSON.stringify({ uid: 1001, from_name: "Anna", from_email: "anna@example.com", subject: "Pump quote", received_at: "2026-05-28T02:00:00.000Z" }),
        JSON.stringify({ uid: 1002, from_name: "Ben", from_email: "ben@example.com", subject: "Distributor request", received_at: "2026-05-28T02:05:00.000Z" })
      ].join("\n"),
      "utf-8"
    );

    const first = await runInboxMonitor({ workspace: "hero-pumps", dataRoot, now: "2026-05-28T02:10:00.000Z" });
    const second = await runInboxMonitor({ workspace: "hero-pumps", dataRoot, now: "2026-05-28T02:20:00.000Z" });

    assert.equal(first.newCount, 2);
    assert.equal(second.status, "no_new_mail");
    assert.equal(second.newCount, 0);
    assert.equal(second.output, "");
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("prunes monitor seen state to a bounded recent set", async () => {
  const dataRoot = tempDataRoot();
  try {
    writeJson(path.join(dataRoot, "companies", "farreach", "inbox", "incoming.json"), [
      {
        id: "msg-new",
        from: "buyer@example.com",
        subject: "New RFQ",
        receivedAt: "2026-06-11T01:00:00.000Z",
      }
    ]);
    writeJson(path.join(dataRoot, "companies", "farreach", "inbox", "monitor-state.json"), {
      version: 1,
      lastCheck: "2026-06-10T00:00:00.000Z",
      seen: {
        old1: { firstSeenAt: "2026-06-01T00:00:00.000Z" },
        old2: { firstSeenAt: "2026-06-02T00:00:00.000Z" },
        recent: { firstSeenAt: "2026-06-10T00:00:00.000Z" },
      },
    });

    const result = await runInboxMonitor({
      workspace: "farreach",
      dataRoot,
      now: "2026-06-11T01:10:00.000Z",
      maxSeen: 2,
    });

    assert.equal(result.newCount, 1);
    const state = JSON.parse(fs.readFileSync(path.join(dataRoot, "companies", "farreach", "inbox", "monitor-state.json"), "utf-8"));
    assert.deepEqual(Object.keys(state.seen).sort(), ["msg-new", "recent"]);
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("is a safe no-op when no local inbox input exists", async () => {
  const dataRoot = tempDataRoot();
  try {
    const result = await runInboxMonitor({ workspace: "farreach", dataRoot, now: "2026-05-28T03:00:00.000Z" });

    assert.equal(result.status, "no_source");
    assert.equal(result.newCount, 0);
    assert.equal(result.output, "");
    assert.ok(fs.existsSync(path.join(dataRoot, "companies", "farreach", "inbox", "monitor-state.json")));
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("can fetch envelopes through a mocked Himalaya adapter without Hermes", async () => {
  const dataRoot = tempDataRoot();
  const calls = [];

  try {
    const result = await runInboxMonitor({
      workspace: "farreach",
      dataRoot,
      now: "2026-05-28T04:00:00.000Z",
      sourceMode: "himalaya",
      commandRunner: async (command, args) => {
        calls.push([command, args]);
        assert.equal(command, "himalaya");
        assert.deepEqual(args, [
          "envelope",
          "list",
          "--account",
          "farreach",
          "--folder",
          "INBOX",
          "--page-size",
          "20",
          "--output",
          "json",
        ]);
        return {
          stdout: JSON.stringify([
            {
              id: 77,
              message_id: "<rfq-77@example.com>",
              from: { name: "Maria Buyer", address: "maria@example.com" },
              subject: "RFQ for silicone wire",
              date: "2026-05-28T03:45:00.000Z",
              flags: ["unseen"],
            },
          ]),
        };
      },
    });

    assert.equal(result.status, "new_mail");
    assert.equal(result.source, "himalaya:farreach/INBOX");
    assert.equal(result.newCount, 1);
    assert.equal(result.newMessages[0].id, "<rfq-77@example.com>");
    assert.equal(result.newMessages[0].fromEmail, "maria@example.com");
    assert.equal(calls.length, 1);
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});
