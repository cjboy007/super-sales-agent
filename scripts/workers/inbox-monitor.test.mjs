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
