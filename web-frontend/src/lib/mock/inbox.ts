import type { InboundEmail } from "@/types/inbox";

// ─── Mock Inbox Data — Foreign Trade Scenarios ───────────────────────────────
// 5 emails from different countries, each with full AI analysis and 3 reply options

export const MOCK_INBOX: InboundEmail[] = [
  // ─── 1. German buyer — price negotiation ────────────────────────────────
  {
    id: "email-001",
    uid: 1001,
    from_email: "hans.mueller@techkabel.de",
    from_name: "Hans Müller",
    subject: "Re: Quotation for DisplayPort & USB-C Cables — Price Revision Request",
    body_text: `Dear Wilson,

Thank you for your quotation dated May 8th. We have reviewed the pricing with our procurement team and unfortunately the current rates are above our budget for this quarter.

We are looking at a volume of 5,000 pcs DP cables (2m) and 8,000 pcs USB-C cables (1m) for our Q3 rollout. Our target price is USD 2.80/pc for DP and USD 1.60/pc for USB-C.

We have been working with a supplier in Shenzhen who offered slightly lower prices, but we prefer your CE/RoHS certifications and delivery reliability. Could you reconsider the pricing?

We need to finalize our supplier by May 20th.

Best regards,
Hans Müller
Senior Procurement Manager
TechKabel GmbH, Munich`,
    received_at: "2026-05-12T07:23:00Z",
    status: "pending_decision",
    customer_id: "okki-de-001",
    analysis: {
      intent: "negotiation",
      confidence: 0.87,
      urgency: "high",
      sentiment: "neutral",
      key_points: [
        "5,000 pcs DP cables + 8,000 pcs USB-C cables",
        "Target price: $2.80 DP / $1.60 USB-C",
        "Decision deadline: May 20th",
        "Competitor offer exists but prefers our certifications",
        "Q3 rollout — repeat orders likely",
      ],
      customer_level: "Senior Procurement Manager",
      tags: [
        { label: "🇩🇪 Germany", color: "#FFD700" },
        { label: "Price Negotiation", color: "#F59E0B" },
        { label: "High Volume", color: "#3B82F6" },
        { label: "Deadline: May 20", color: "#EF4444" },
      ],
    },
    options: [
      {
        id: "opt-001-steady",
        style: "steady",
        icon: "🛡️",
        title: "Steady",
        subtitle: "Hold price, add value to justify",
        outline: [
          "Acknowledge budget pressure with empathy",
          "Highlight CE/RoHS + reliability advantage over competitor",
          "Offer 5% discount for full order commitment by May 18",
          "Include free sample set (10 pcs each) to demonstrate quality",
          "Propose 30-day payment terms as added value",
        ],
        key_metrics: {
          discount: "5% off",
          margin: "31.5%",
          lead_time: "18 days",
          special: "Free 20-pc sample set",
        },
        expected_outcome: "High chance of closing — customer already prefers us over competitor",
        risk_level: "low",
      },
      {
        id: "opt-001-aggressive",
        style: "aggressive",
        icon: "⚔️",
        title: "Aggressive",
        subtitle: "Match competitor price, lock in long-term deal",
        outline: [
          "Meet target price exactly: $2.80 DP / $1.60 USB-C",
          "Condition: 12-month framework agreement (min 3 orders/year)",
          "Create urgency: price valid only until May 16",
          "Offer priority production slot for Q3 delivery",
          "Bundle CE certificate + RoHS report at no extra cost",
        ],
        key_metrics: {
          discount: "12% off",
          margin: "22.8%",
          lead_time: "15 days",
          special: "12-month framework agreement",
        },
        expected_outcome: "Win the deal and lock in annual volume — lower margin but higher LTV",
        risk_level: "medium",
      },
      {
        id: "opt-001-creative",
        style: "creative",
        icon: "🎲",
        title: "Creative",
        subtitle: "Tiered pricing + co-branding proposal",
        outline: [
          "Propose tiered pricing: current price for 5K, target price unlocked at 15K+",
          "Offer SKW co-branded packaging option (premium positioning for their clients)",
          "Suggest splitting order: DP at $2.90, USB-C at $1.55 (blended savings)",
          "Provide 3-year product roadmap showing upcoming DP 2.1 / USB4 lineup",
          "Invite Hans to factory visit in June — builds trust, reduces churn",
        ],
        key_metrics: {
          discount: "8% blended",
          margin: "27.3%",
          lead_time: "18 days",
          special: "Co-branding + factory visit invite",
        },
        expected_outcome: "Differentiate from Shenzhen competitor, build strategic partnership",
        risk_level: "low",
      },
    ],
  },

  // ─── 2. US buyer — urgent order ─────────────────────────────────────────
  {
    id: "email-002",
    uid: 1002,
    from_email: "sarah.chen@avpro-us.com",
    from_name: "Sarah Chen",
    subject: "URGENT: Need 2,000 HDMI 2.1 Cables by June 1 — Can You Deliver?",
    body_text: `Hi Wilson,

We have an emergency situation. Our current HDMI supplier just informed us they cannot fulfill our June order due to production issues. We need 2,000 pcs HDMI 2.1 cables (2m, 48Gbps) delivered to our LA warehouse by June 1st.

Our standard spec: 48Gbps, 4K@120Hz, eARC support, braided nylon jacket, gold-plated connectors. We've ordered from you before (PO #AV-2024-089) so you have our specs on file.

Budget is flexible for the right supplier who can actually deliver. Please confirm:
1. Can you meet the June 1 deadline?
2. What's your best price for 2,000 pcs?
3. Do you have stock or need to produce?

This is time-sensitive. Please reply within 24 hours.

Sarah Chen
VP of Procurement
AV Pro Solutions, Los Angeles`,
    received_at: "2026-05-12T09:45:00Z",
    status: "pending_decision",
    customer_id: "okki-us-002",
    analysis: {
      intent: "order_confirm",
      confidence: 0.91,
      urgency: "high",
      sentiment: "positive",
      key_points: [
        "2,000 pcs HDMI 2.1 (2m, 48Gbps) needed urgently",
        "Delivery deadline: June 1 to LA warehouse",
        "Existing customer — PO #AV-2024-089 on file",
        "Budget flexible — prioritizing delivery reliability",
        "24-hour reply window requested",
      ],
      customer_level: "VP of Procurement",
      tags: [
        { label: "🇺🇸 USA", color: "#3B82F6" },
        { label: "Urgent Order", color: "#EF4444" },
        { label: "Existing Customer", color: "#10B981" },
        { label: "Budget Flexible", color: "#8B5CF6" },
      ],
    },
    options: [
      {
        id: "opt-002-steady",
        style: "steady",
        icon: "🛡️",
        title: "Steady",
        subtitle: "Confirm delivery, standard premium pricing",
        outline: [
          "Confirm we can deliver 2,000 pcs by May 28 (3 days buffer)",
          "Quote $8.50/pc — premium for rush production",
          "Reference PO #AV-2024-089 to show familiarity",
          "Offer DHL Express shipping with tracking",
          "Request 50% deposit to start production immediately",
        ],
        key_metrics: {
          discount: "0% (rush premium)",
          margin: "33.5%",
          lead_time: "16 days (May 28)",
          special: "DHL Express, 50% deposit",
        },
        expected_outcome: "Reliable close — customer is desperate and trusts us",
        risk_level: "low",
      },
      {
        id: "opt-002-aggressive",
        style: "aggressive",
        icon: "⚔️",
        title: "Aggressive",
        subtitle: "Guarantee delivery, charge premium, upsell",
        outline: [
          "Guarantee delivery by May 27 — beat their deadline by 5 days",
          "Quote $9.20/pc with delivery guarantee clause",
          "Upsell: suggest adding 500 pcs HDMI 2.0 as backup stock",
          "Offer dedicated production line — no queue jumping risk",
          "Propose annual supply agreement to prevent future emergencies",
        ],
        key_metrics: {
          discount: "-8% (rush surcharge)",
          margin: "38.2%",
          lead_time: "15 days (May 27)",
          special: "Delivery guarantee + upsell",
        },
        expected_outcome: "Maximum revenue from urgent situation — customer will pay for certainty",
        risk_level: "medium",
      },
      {
        id: "opt-002-creative",
        style: "creative",
        icon: "🎲",
        title: "Creative",
        subtitle: "Split shipment — partial air, partial sea",
        outline: [
          "Ship 800 pcs by air (arrive May 26) + 1,200 pcs by sea (arrive May 31)",
          "Blended price: $7.80/pc — saves customer ~$1,400 vs full air",
          "Provide real-time production photos via WhatsApp",
          "Include 50 pcs extra as buffer for any QC rejects",
          "Offer to handle US customs documentation",
        ],
        key_metrics: {
          discount: "5% vs rush rate",
          margin: "29.8%",
          lead_time: "14 days (first batch)",
          special: "Split shipment + customs docs",
        },
        expected_outcome: "Win on value — customer saves money while still meeting deadline",
        risk_level: "medium",
      },
    ],
  },

  // ─── 3. Japanese buyer — quality inquiry ────────────────────────────────
  {
    id: "email-003",
    uid: 1003,
    from_email: "tanaka.kenji@nippon-av.co.jp",
    from_name: "Tanaka Kenji",
    subject: "Inquiry: USB4 Gen 3 Cable Certification & Quality Standards",
    body_text: `Dear Mr. Wilson,

I am Tanaka Kenji from Nippon AV Systems. We are currently evaluating suppliers for our new USB4 Gen 3 cable product line launching in Q4 2026.

Our requirements are strict:
- USB4 Gen 3x2 (40Gbps) certified
- PSE certification for Japan market
- Bend test: minimum 10,000 cycles
- Operating temperature: -20°C to 70°C
- Packaging: individual retail box with QR code

We are interested in an initial order of 1,000 pcs for testing, with potential annual volume of 50,000+ pcs if quality meets our standards.

Could you provide:
1. Technical specifications sheet
2. Test reports (USB-IF certification preferred)
3. Sample pricing for 1,000 pcs
4. Your quality control process

We take quality very seriously and have rejected suppliers in the past for minor deviations.

Regards,
Tanaka Kenji
Product Development Manager
Nippon AV Systems Co., Ltd.`,
    received_at: "2026-05-11T23:15:00Z",
    status: "pending_decision",
    customer_id: "okki-jp-003",
    analysis: {
      intent: "inquiry_rfq",
      confidence: 0.78,
      urgency: "medium",
      sentiment: "neutral",
      key_points: [
        "USB4 Gen 3x2 (40Gbps) with PSE certification required",
        "Initial 1,000 pcs test order → 50,000+ pcs annual potential",
        "Strict quality standards — has rejected suppliers before",
        "Q4 2026 launch timeline",
        "Needs: spec sheet, test reports, sample pricing, QC process",
      ],
      customer_level: "Product Development Manager",
      tags: [
        { label: "🇯🇵 Japan", color: "#EF4444" },
        { label: "Quality Focus", color: "#8B5CF6" },
        { label: "High Potential", color: "#10B981" },
        { label: "USB4 Gen 3", color: "#3B82F6" },
      ],
    },
    options: [
      {
        id: "opt-003-steady",
        style: "steady",
        icon: "🛡️",
        title: "Steady",
        subtitle: "Full technical response, build credibility",
        outline: [
          "Attach USB-IF certification + PSE test report immediately",
          "Provide detailed spec sheet matching all their requirements",
          "Quote $18.50/pc for 1,000 pcs sample order",
          "Describe 5-step QC process (incoming → production → final → aging → packaging)",
          "Offer 30-day quality guarantee with free replacement",
        ],
        key_metrics: {
          discount: "0% (sample pricing)",
          margin: "28.5%",
          lead_time: "25 days",
          special: "30-day quality guarantee",
        },
        expected_outcome: "Build trust with quality-focused buyer — position for 50K annual deal",
        risk_level: "low",
      },
      {
        id: "opt-003-aggressive",
        style: "aggressive",
        icon: "⚔️",
        title: "Aggressive",
        subtitle: "Free samples, lock in annual agreement early",
        outline: [
          "Offer 20 pcs free samples (no charge) to demonstrate confidence",
          "Propose annual supply agreement with price lock for 2 years",
          "Quote $16.80/pc for 1,000 pcs (below market to win evaluation)",
          "Commit to dedicated QC inspector for their account",
          "Provide factory audit invitation — show transparency",
        ],
        key_metrics: {
          discount: "10% below market",
          margin: "21.2%",
          lead_time: "22 days",
          special: "Free 20-pc samples + 2yr price lock",
        },
        expected_outcome: "Win evaluation phase — sacrifice margin now for 50K/yr contract",
        risk_level: "high",
      },
      {
        id: "opt-003-creative",
        style: "creative",
        icon: "🎲",
        title: "Creative",
        subtitle: "Co-development partnership proposal",
        outline: [
          "Propose joint product development for their specific requirements",
          "Offer custom SKU with their brand on packaging (OEM)",
          "Quote $17.50/pc with tiered pricing: $15.20 at 10K+, $13.80 at 50K+",
          "Suggest quarterly quality review meetings (video call)",
          "Provide Japanese-language product documentation",
        ],
        key_metrics: {
          discount: "5% + volume tiers",
          margin: "25.8%",
          lead_time: "28 days (custom)",
          special: "OEM + Japanese docs",
        },
        expected_outcome: "Differentiate as strategic partner, not just supplier — higher retention",
        risk_level: "low",
      },
    ],
  },

  // ─── 4. UAE buyer — bulk order ───────────────────────────────────────────
  {
    id: "email-004",
    uid: 1004,
    from_email: "ahmed.al-rashid@gulf-tech.ae",
    from_name: "Ahmed Al-Rashid",
    subject: "Bulk Order Inquiry — HDMI + DP Cables for Hotel Project",
    body_text: `Dear Wilson,

We are sourcing cables for a large hotel renovation project in Dubai. The project requires:

- HDMI 2.0 cables: 3,000 pcs (various lengths: 1m, 2m, 3m, 5m)
- DisplayPort 1.4 cables: 1,500 pcs (1m, 2m)
- Total budget: approximately USD 25,000

The project timeline is tight — we need delivery to Dubai by June 15th. We can arrange our own freight forwarder from your factory.

Payment: We prefer 30% deposit + 70% against B/L copy. We have worked with Chinese suppliers before and understand the process.

Please provide your best price for this volume. We are comparing 3 suppliers currently.

Ahmed Al-Rashid
Procurement Director
Gulf Tech Solutions, Dubai`,
    received_at: "2026-05-12T05:30:00Z",
    status: "pending_decision",
    customer_id: "okki-ae-004",
    analysis: {
      intent: "inquiry_rfq",
      confidence: 0.83,
      urgency: "high",
      sentiment: "positive",
      key_points: [
        "3,000 pcs HDMI 2.0 + 1,500 pcs DP 1.4 (mixed lengths)",
        "Total budget ~$25,000",
        "Dubai delivery by June 15",
        "30/70 payment terms requested",
        "Comparing 3 suppliers — competitive situation",
      ],
      customer_level: "Procurement Director",
      tags: [
        { label: "🇦🇪 UAE", color: "#10B981" },
        { label: "Hotel Project", color: "#F59E0B" },
        { label: "Bulk Order", color: "#3B82F6" },
        { label: "3-Way Competition", color: "#EF4444" },
      ],
    },
    options: [
      {
        id: "opt-004-steady",
        style: "steady",
        icon: "🛡️",
        title: "Steady",
        subtitle: "Competitive price within budget, reliable delivery",
        outline: [
          "Quote total $23,800 (within their $25K budget with room)",
          "Confirm June 10 ex-factory — gives 5 days buffer for Dubai",
          "Accept 30/70 payment terms as requested",
          "Provide packing list with hotel room labeling option",
          "Include CE/RoHS certificates for UAE customs",
        ],
        key_metrics: {
          discount: "8% off list",
          margin: "26.4%",
          lead_time: "20 days (June 10 EXW)",
          special: "Custom hotel labeling",
        },
        expected_outcome: "Strong position — within budget, reliable timeline, familiar payment terms",
        risk_level: "low",
      },
      {
        id: "opt-004-aggressive",
        style: "aggressive",
        icon: "⚔️",
        title: "Aggressive",
        subtitle: "Undercut budget, win on price",
        outline: [
          "Quote $21,500 — 14% below their budget, hardest to beat",
          "Offer 25/75 payment terms (even better for them)",
          "Guarantee June 8 ex-factory",
          "Add free cable management labels for hotel rooms",
          "Mention 3 similar hotel projects completed in GCC region",
        ],
        key_metrics: {
          discount: "14% off list",
          margin: "20.1%",
          lead_time: "18 days (June 8 EXW)",
          special: "25/75 terms + free labels",
        },
        expected_outcome: "Win on price in 3-way competition — margin is tight but volume is good",
        risk_level: "medium",
      },
      {
        id: "opt-004-creative",
        style: "creative",
        icon: "🎲",
        title: "Creative",
        subtitle: "Value-add package — become their preferred supplier",
        outline: [
          "Quote $24,200 with premium value-add package",
          "Include cable testing report for each batch (hotel QA requirement)",
          "Offer room-by-room pre-labeled packaging (saves their installation team time)",
          "Provide Arabic product labels as option",
          "Propose becoming their preferred supplier for future UAE hotel projects",
        ],
        key_metrics: {
          discount: "5% off list",
          margin: "30.2%",
          lead_time: "22 days (June 12 EXW)",
          special: "Pre-labeled + Arabic labels + testing report",
        },
        expected_outcome: "Win on value, not price — position for repeat hotel project business in UAE",
        risk_level: "low",
      },
    ],
  },

  // ─── 5. UK buyer — complaint + reorder ──────────────────────────────────
  {
    id: "email-005",
    uid: 1005,
    from_email: "james.whitfield@proav-uk.co.uk",
    from_name: "James Whitfield",
    subject: "Quality Issue with Last Order + New Order Inquiry",
    body_text: `Hi Wilson,

I need to raise a quality issue with our last order (PO #UK-2026-034, 500 pcs HDMI 2.1 cables). We found that approximately 8% of the cables (around 40 pcs) have intermittent connection issues at the connector end. Our technician suspects the strain relief is not properly crimped.

This has caused some embarrassment with our end clients. We need a resolution.

That said, I still want to place a new order — we have demand for 800 pcs HDMI 2.1 and 400 pcs USB-C 3.2 Gen 2. But I need confidence that the quality issue is resolved first.

Can you:
1. Arrange replacement for the 40 defective units
2. Explain what went wrong and how it's fixed
3. Provide pricing for the new order

I'm willing to continue the relationship if this is handled professionally.

James Whitfield
Technical Director
ProAV UK Ltd, London`,
    received_at: "2026-05-12T08:10:00Z",
    status: "pending_decision",
    customer_id: "okki-uk-005",
    analysis: {
      intent: "complaint",
      confidence: 0.9,
      urgency: "high",
      sentiment: "negative",
      key_points: [
        "8% defect rate (40 pcs) — strain relief crimping issue",
        "PO #UK-2026-034 affected",
        "New order ready: 800 pcs HDMI 2.1 + 400 pcs USB-C 3.2",
        "Customer willing to continue if handled professionally",
        "Reputation damage with end clients",
      ],
      customer_level: "Technical Director",
      tags: [
        { label: "🇬🇧 UK", color: "#3B82F6" },
        { label: "Quality Complaint", color: "#EF4444" },
        { label: "Reorder Opportunity", color: "#10B981" },
        { label: "Relationship at Risk", color: "#F59E0B" },
      ],
    },
    options: [
      {
        id: "opt-005-steady",
        style: "steady",
        icon: "🛡️",
        title: "Steady",
        subtitle: "Full accountability, professional resolution",
        outline: [
          "Apologize sincerely — take full responsibility, no excuses",
          "Confirm replacement of 40 pcs + 10 extra as goodwill",
          "Explain root cause: batch QC miss on crimping machine calibration (fixed)",
          "Quote new order at standard price with 5% loyalty discount",
          "Offer enhanced QC report for new order (100% connector test)",
        ],
        key_metrics: {
          discount: "5% on new order",
          margin: "29.8%",
          lead_time: "20 days",
          special: "50 pcs replacement + 100% connector test",
        },
        expected_outcome: "Retain customer — professional handling turns complaint into loyalty",
        risk_level: "low",
      },
      {
        id: "opt-005-aggressive",
        style: "aggressive",
        icon: "⚔️",
        title: "Aggressive",
        subtitle: "Over-compensate, lock in new order immediately",
        outline: [
          "Replace all 40 defective + offer 5% credit on original order value",
          "Propose combining replacement + new order in one shipment (saves freight)",
          "Quote new order at 10% discount — make it hard to go elsewhere",
          "Commit to dedicated QC for their account going forward",
          "Request new PO confirmation within 48 hours to lock in pricing",
        ],
        key_metrics: {
          discount: "10% on new order + 5% credit",
          margin: "22.5%",
          lead_time: "18 days (combined)",
          special: "Combined shipment + account QC",
        },
        expected_outcome: "Turn complaint into upsell — customer feels over-compensated, places order fast",
        risk_level: "medium",
      },
      {
        id: "opt-005-creative",
        style: "creative",
        icon: "🎲",
        title: "Creative",
        subtitle: "Video QC transparency + partnership upgrade",
        outline: [
          "Send video of crimping machine calibration fix within 24 hours",
          "Offer live video QC inspection for new order (James watches production)",
          "Replace 40 pcs + upgrade to premium braided version at no extra cost",
          "Quote new order with tiered pricing for future orders",
          "Propose quarterly business review to prevent future issues",
        ],
        key_metrics: {
          discount: "7% on new order",
          margin: "26.1%",
          lead_time: "22 days",
          special: "Video QC + premium upgrade replacement",
        },
        expected_outcome: "Transform complaint into showcase of transparency — builds deep trust",
        risk_level: "low",
      },
    ],
  },
];

// ─── Stats ────────────────────────────────────────────────────────────────────

export const MOCK_INBOX_STATS = {
  pending_decision: MOCK_INBOX.filter((e) => e.status === "pending_decision").length,
  sent_today: 3,
  reply_rate_week: 87,
  avg_response_time_hours: 2.4,
};
