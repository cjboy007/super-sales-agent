---
name: email-smart-reply
description: '邮件智能回复系统，自动识别客户意图并生成个性化回复草稿'
metadata:
  {
    "openclaw": { "emoji": "📧", "requires": { "anyBins": ["node"] } },
  }
---

# email-smart-reply

**Category:** Email Automation  
**Status:** Production-Ready (Auto-Process Pipeline v2.0)  
**Version:** 2.0.0  
**Created:** 2026-03-24  
**Updated:** 2026-03-28 (Added Auto-Process Pipeline)  
**Maintainer:** WILSON + IRON

---

## ⚠️ CORE PRINCIPLES (核心原则) ⚠️

**THESE ARE NON-NEGOTIABLE. VIOLATION = BUG.**

| # | Principle | Chinese | Rationale |
|---|-----------|---------|-----------|
| **1** | **NEVER send email without explicit user approval** | **发送前必须展示完整内容供用户审核，禁止直接发送** | User must review and approve ALL outgoing emails. No exceptions. |
| **2** | **ALWAYS show full draft content before asking for approval** | **必须先展示完整草稿内容，再请求用户确认** | User cannot approve what they cannot see. Show the full email body. |
| **3** | **Generate HTML emails, NOT Markdown** | **生成 HTML 格式邮件，不是 Markdown** | Email clients don't render `**bold**`. Use `<strong>bold</strong>` instead. |
| **4** | **Provide clear action options after showing draft** | **展示草稿后提供清晰的操作选项** | Always offer: [Send] [Edit] [Skip] [Save as Draft] |
| **5** | **ALWAYS send generated files to user immediately** | **生成文件后首要任务是发送给用户，不是存本地** | Files are useless if user can't see them. Send first, save second. |
| **6** | **REPLY emails MUST include "Re:" prefix** | **回复邮件必须添加 "Re:" 前缀** | Standard email convention. Without it, threading breaks. |
| **7** | **REPLY emails MUST preserve ALL original recipients (To + Cc)** | **回复邮件必须保留所有原收件人和抄送人** | Missing recipients = missed communication. Use Reply All logic. |
| **8** | **REPLY emails MUST quote original message** | **回复邮件必须引用原文** | Context preservation. Include full original email below signature. |
| **9** | **ALWAYS match customer's language** | **必须使用客户的语言（美国客户=英文，德国客户=德文等）** | Wrong language = unprofessional + confusing. Check customer's email language and country. |
| **10** | **NEVER claim actions you cannot perform** | **永远不要声称你做不到的事情** | **Dishonesty breaks trust. Always be honest about permissions and capabilities.** |

**Violation Handling:**
- If any principle is violated → **IMMEDIATELY STOP** and apologize
- Document the violation in session log
- Fix the skill code before continuing

---

## 📝 CRITICAL LESSONS LEARNED (重要教训)

**These lessons were learned from real mistakes. Never repeat them.**

| # | Date | Mistake | Impact | Fix |
|---|------|---------|--------|-----|
| **1** | 2026-03-28 | **Wrote email draft in Chinese for US customer** | Unprofessional, customer cannot read | ✅ Principle #9: Always match customer's language. Check customer's country and email language before drafting. |
| **2** | 2026-03-28 | **Did not show full draft content before asking for approval** | User cannot approve what they can't see | ✅ Principle #2: Always show complete draft first. |
| **3** | 2026-03-28 | **Reply email without "Re:" prefix** | Breaks email threading, unprofessional | ✅ Principle #6: Always add "Re:" for replies. |
| **4** | 2026-03-28 | **Missing original Cc recipients in reply** | Missed communication | ✅ Principle #7: Preserve ALL original recipients. |
| **5** | 2026-03-28 | **Reply without quoted original message** | No context for recipient | ✅ Principle #8: Always quote original email. |
| **6** | 2026-03-28 | **Saved file locally but didn't send to user** | User can't see the file | ✅ Principle #5: Send files immediately via email attachment or Discord upload. |
| **7** | 2026-03-28 | **Claimed code was modified without permission** | **Dishonest, broke trust** | ✅ **NEVER claim actions you cannot perform. Always be honest about permissions and capabilities.** |

**Language Detection Rule:**

```
IF customer email is in English → Draft in English
IF customer email is in Chinese → Draft in Chinese
IF customer is from US/UK/CA/AU → Draft in English
IF customer is from DE/AT/CH → Draft in German (or English if their email was in English)
IF customer is from FR/BE → Draft in French (or English if their email was in English)
IF unsure → Default to English (business standard)
```

**NEVER mix languages in a single email draft.**

---

## 📎 ATTACHMENT FORMAT RULES (附件格式规则)

**ALWAYS use professional formats for email attachments.**

| Document Type | ✅ Correct Format | ❌ Wrong Format |
|--------------|-------------------|-----------------|
| Quotation (报价单) | **PDF** | HTML, DOCX |
| Proforma Invoice (PI) | **PDF** | HTML, DOCX |
| Sample Order (样品单) | **PDF** | HTML, DOCX |
| Payment Notice (收款通知) | **PDF** | HTML, DOCX |
| Product Catalog (产品目录) | **PDF** | HTML |
| Data/Spreadsheet (数据表格) | **XLSX** or **PDF** | HTML, CSV |
| Images (图片) | **JPG** or **PNG** | HTML, BMP |

**Why PDF for documents:**
- ✅ Professional appearance
- ✅ Fixed formatting (won't break)
- ✅ Printable
- ✅ Universally supported
- ✅ Cannot be easily edited (security)
- ✅ Proper file size (compressed)

**Why NOT HTML:**
- ❌ Looks unprofessional
- ❌ May not render correctly in all email clients
- ❌ Can be accidentally modified
- ❌ Looks like a draft/temporary file
- ❌ Not suitable for archiving

**Conversion Rule:**
```
If output is HTML → Convert to PDF before attaching
Use Chrome headless: chrome --headless --print-to-pdf=output.pdf input.html
Or use the skill's built-in PDF export function
```

---

## 🔍 MANDATORY PRE-SEND CHECKLIST (发送前强制检查)

**Before showing ANY draft to user, ALWAYS verify:**

```
□ 1. LANGUAGE CHECK
  → What language did the customer use?
  → What country is the customer from?
  → Does my draft match their language?
  → ❌ NEVER mix languages in one email

□ 2. SUBJECT CHECK
  → Is this a reply? → Add "Re:" prefix
  → Is this a forward? → Add "Fw:" prefix
  → Is the subject clear and descriptive?

□ 3. RECIPIENTS CHECK
  → Who was the original sender?
  → Who were the original To recipients?
  → Who were the original Cc recipients?
  → → PRESERVE ALL OF THEM

□ 4. CONTENT CHECK
  → Is the draft in HTML format (not Markdown)?
  → Is the full draft content complete?
  → → SHOW FULL DRAFT BEFORE ASKING FOR APPROVAL

□ 5. QUOTE CHECK
  → Did I include the original message?
  → Is it below my signature?
  → Is it marked with "-----Original Message-----"?

□ 6. DELIVERY CHECK
  → Where should I show this draft?
  → → Discord chat window (NOT email, NOT file)
  → → Show content directly in message

□ 7. PRINCIPLE CHECK
  → Review all 9 core principles
  → → Have I violated any of them?
  → → If yes, fix BEFORE showing to user
```

**If ANY check fails → STOP and fix before proceeding.**

**After showing draft:**
- Wait for explicit user approval ("发送" / "Send")
- Do NOT ask "what do you want to do?" before showing content
- Do NOT send to email unless explicitly requested

---

## 📧 BUSINESS EMAIL STANDARDS (商务邮件标准)

**These standards MUST be followed for ALL outgoing emails.**

### 1. Subject Line

| Scenario | Rule | Example |
|----------|------|---------|
| Reply | Prefix with `Re:` | `Re: Delivery Status Inquiry - Order ORD-xxx` |
| Forward | Prefix with `Fw:` | `Fw: Order Confirmation` |
| New Email | Clear description | `Quotation for HDMI Cables - QT-20260328-001` |
| Urgent | Add `[URGENT]` tag | `[URGENT] Quality Issue - Order ORD-xxx` |

### 2. Recipients

| Field | Rule |
|-------|------|
| **To** | Primary action takers |
| **Cc** | **MUST preserve ALL original Cc recipients** |
| **Bcc** | Use sparingly (hidden recipients) |

### 3. Salutation

| Scenario | Format |
|----------|--------|
| Formal | `Dear [Title] [Last Name],` |
| Familiar | `Dear [First Name],` |
| Unknown | `Dear Sir/Madam,` |
| Team | `Dear Team,` or `Dear All,` |

### 4. Body Structure

```
1. Opening (thank/apologize/acknowledge)
2. Main content (one topic per paragraph)
3. Action items (who does what)
4. Closing (offer help/expect reply)
```

### 5. Original Message Quote (FOR REPLIES)

**MUST include below signature:**

```
--
[Your Signature]

-----Original Message-----
From: [Original Sender]
Sent: [Date]
To: [Original Recipients]
Cc: [Original Cc Recipients]
Subject: [Original Subject]

[Original Email Content]
```

### 6. Signature

**Required:**
- Name
- Title
- Company
- Email
- Phone

### 7. Pre-Send Checklist

- [ ] Subject correct (with `Re:` for replies)
- [ ] All recipients preserved (To + Cc)
- [ ] Salutation correct
- [ ] No spelling/grammar errors
- [ ] Attachments mentioned are attached
- [ ] Original email quoted (for replies)
- [ ] Signature complete

---

## Description

Intelligent email auto-reply pipeline for `your-email@your-domain.com`. Automatically classifies incoming emails by intent, retrieves relevant knowledge from the Your Company knowledge base, generates personalized reply drafts, and routes them through a Discord-based human review workflow before sending.

**Pipeline:** IMAP fetch → Intent Recognition → KB Retrieval → Reply Generation → **USER REVIEW** → SMTP Send

This skill is domain-specific to Your Company's B2B email workflow. It is NOT a generic email assistant — it understands product lines (HDMI/DP/USB/LAN cables), customer intent categories specific to electronics manufacturing, and integrates with OKKI CRM data.

---

## Core Modules

| File | Purpose |
|------|---------|
| `scripts/auto-process-inbox.js` | **v2.0 NEW** - Full auto-process pipeline: read → classify → act → report |
| `scripts/intent-recognition.js` | Classifies email intent via LLM (OpenRouter) with keyword fallback |
| `scripts/kb-retrieval.js` | Retrieves relevant knowledge from LanceDB + Obsidian vault |
| `scripts/reply-generation.js` | Generates personalized reply drafts using templates + KB context |
| `scripts/discord-review.js` | Pushes drafts to Discord for human approval before sending |
| `scripts/integration-test.js` | End-to-end pipeline test with `--dry-run` mode |
| `config/intent-schema.json` | Defines 6 intent categories with thresholds and behaviors |
| `config/discord-config.json` | Discord bot token and channel configuration |

---

## Intent Categories

Defined in `config/intent-schema.json`:

| ID | English | Chinese | Priority | Auto-Draft | Fallback |
|----|---------|---------|---------|-----------|---------|
| `inquiry` | Product Inquiry | 产品询价 | high | ✅ | manual_review |
| `delivery-chase` | Delivery Follow-up | 交期催促 | high | ✅ | manual_review |
| `complaint` | Customer Complaint | 客户投诉 | **urgent** | ❌ | escalate_to_wilson |
| `technical` | Technical Support | 技术支持 | medium | ✅ | manual_review |
| `partnership` | Partnership/Collaboration | 合作意向 | high | ✅ | manual_review |
| `spam` | Spam/Promotional | 垃圾邮件 | low | ❌ | ignore |

**Confidence threshold:** 0.75 (below this → `needs_manual = true`, no auto-draft sent)

---

## Usage

### 🤖 Auto-Process Inbox (Recommended ⭐)
```bash
cd /path/to/your/.openclaw/workspace/skills/email-smart-reply/scripts

# Process all unread emails with full automation
node auto-process-inbox.js

# Process specific email by UID
node auto-process-inbox.js --uid 1735972832

# Process up to N emails
node auto-process-inbox.js --limit 5
```

**What it does:**
1. Reads unread emails from IMAP
2. Auto-classifies intent (inquiry/complaint/delivery-chase/sample/etc.)
3. Executes workflow actions:
   - **Complaint** → Create OKKI complaint record + Draft reply + Discord alert
   - **Inquiry** → Create OKKI customer + Draft quotation reply
   - **Delivery Chase** → Check order status + Draft status update reply
   - **Sample Request** → Create OKKI customer + Draft sample order
4. Outputs complete processing report with all details

### Run Full Pipeline (Dry Run)
```bash
cd /path/to/your/.openclaw/workspace/skills/email-smart-reply/scripts
node integration-test.js --dry-run --limit 5
```

### Run Full Pipeline (Live - sends to Discord review)
```bash
node integration-test.js --limit 10
```

### Intent Recognition Only
```javascript
const { recognizeIntent } = require('./scripts/intent-recognition');
const result = await recognizeIntent(emailText);
// Returns: { intent, confidence, method: 'llm'|'keyword' }
```

### KB Retrieval Only
```javascript
const { retrieveKB } = require('./scripts/kb-retrieval');
const results = await retrieveKB({ intent, emailText });
// Returns: { found, results: [{source, content}], queries }
```

### Generate Reply Draft
```javascript
const { generateReply } = require('./scripts/reply-generation');
const draft = await generateReply({ email, intentResult, kbResults });
// Returns: { draft_id, subject, body, needs_manual, reason } or null
// Draft saved to: /path/to/your/.openclaw/workspace/skills/imap-smtp-email/drafts/
```

### Push to Discord Review
```javascript
const { pushToDiscordReview } = require('./scripts/discord-review');
await pushToDiscordReview({ draft, email, intentResult });
// Sends embed with Approve/Edit/Discard buttons to #email-review channel
```

### Discord Review CLI (manual actions)
```bash
node scripts/discord-review.js test          # Send test embed
node scripts/discord-review.js approve <draft_id>
node scripts/discord-review.js discard <draft_id>
```

---

## Draft ID Format

`DRAFT-{timestamp}-{3-letter-prefix}`

| Intent | Prefix |
|--------|--------|
| inquiry | INQ |
| delivery-chase | DEL |
| complaint | COM |
| technical | TEC |
| partnership | PAR |
| spam | (filtered, no draft) |

---

## Dependencies

### External Services
- **IMAP/SMTP:** `your-email@your-domain.com` via 网易企业邮 (configured in `imap-smtp-email/.env`)
- **OpenRouter API:** LLM intent classification (`sk-or-v1-...` in TOOLS.md)
- **Discord Bot:** Token + channel `#email-review` (configured in `config/discord-config.json`)

### Local Skills/Tools
- `/path/to/your/.openclaw/workspace/skills/imap-smtp-email/` — IMAP/SMTP transport layer
- `/path/to/your/.openclaw/workspace/vector_store/okki_vector_search_v3.py` — LanceDB vector search
- `/path/to/your/.openclaw/workspace/obsidian-vault/Your Company 知识库/` — Product knowledge base

### Node.js Packages
- `imap` / `nodemailer` — email transport (inherited from imap-smtp-email skill)
- `node-fetch` — OpenRouter API calls
- `discord.js` — Discord bot integration

---

## Configuration

### `config/intent-schema.json`
- Intent definitions, keywords (EN + ZH), confidence thresholds
- Fallback behaviors per intent type
- Global settings (multi-intent handling, language detection)

### `config/discord-config.json`
- `bot_token`: Discord bot token
- `channel_id`: Target channel for review embeds (`1478948663815442545`)
- `review_timeout_minutes`: Auto-discard timeout (default: 30)

---

## Safety Guarantees

1. **No blind sending:** All drafts require human approval via Discord before SMTP send
2. **Low confidence → manual:** Confidence < 0.75 sets `needs_manual=true`, skips Discord push, queues for manual review
3. **Complaint escalation:** Complaint intent never auto-drafts; always escalates to WILSON
4. **Spam filtering:** Spam intent immediately discarded, no draft created
5. **Dry-run mode:** `--dry-run` flag for safe testing without real sends or Discord posts
6. **Fallback degradation:** LLM unavailable → keyword matching; IMAP unavailable → sample emails

---

## Development History

**Task:** task-001 | **Phase:** 1 | **Iterations:** 5 | **Duration:** ~2.5 hours

| Iteration | Agent | What Was Built |
|-----------|-------|----------------|
| 1 | IRON | Initial attempt (timed out at 300s — restructured to single-subtask iterations) |
| 2 | IRON | Steps 1-3: intent-schema.json, intent-recognition.js, kb-retrieval.js |
| 3 | IRON | Step 4: reply-generation.js (templates, escalation logic, draft file I/O) |
| 4 | IRON | Step 5: discord-review.js (Embed format, 3-button interaction, CLI fallback) |
| 5 | IRON | Step 6: integration-test.js (full pipeline, --dry-run, test-results/ output) |

**Key Design Decisions:**
- Single-subtask-per-iteration strategy after initial timeout failure
- LLM → keyword cascade for intent recognition robustness
- Discord embed review (not email approval) for fast human-in-the-loop UX
- `needs_manual` flag as primary safety gate (not confidence threshold alone)
- Reviews stored locally in `reviews-pending/` as fallback if Discord is unavailable

**Known Limitations (Phase 1):**
- Integration tests use sample emails (real IMAP auth was unavailable in test env)
- LLM intent classification falls back to keyword matching (confidence ~0.4–0.6)
- Discord live push not tested in dry-run (separately verified in Iteration 4)

---

## Phase 2 Roadmap

1. **Real IMAP testing** — Run pipeline against actual incoming emails, measure intent accuracy
2. **LLM availability** — Ensure OpenRouter API accessible in production
3. **Discord Bot permissions** — Confirm bot has send access to `#email-review` channel
4. **Cron job** — Schedule `integration-test.js` every 30 minutes via cron
5. **Manual queue monitoring** — Alert when `needs_manual` backlog exceeds threshold

---

## File Structure

```
email-smart-reply/
├── SKILL.md                    ← This file
├── README.md                   ← Quick start guide
├── scripts/
│   ├── intent-recognition.js   ← LLM + keyword intent classifier
│   ├── kb-retrieval.js         ← LanceDB + Obsidian knowledge retrieval
│   ├── reply-generation.js     ← Template-based reply drafts
│   ├── discord-review.js       ← Discord embed review workflow
│   └── integration-test.js     ← End-to-end pipeline runner
├── config/
│   ├── intent-schema.json      ← Intent categories and thresholds
│   └── discord-config.json     ← Discord bot configuration
└── test-results/
    └── integration-test-*.json ← Sample test run outputs
```

---

## Source

All scripts are symlinked/copied from:
`/path/to/your/.openclaw/workspace/skills/imap-smtp-email/`

The canonical source of truth for active scripts remains in `imap-smtp-email/`. This skill directory is the **packaged, documented, reusable version**.
