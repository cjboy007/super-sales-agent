import { NextResponse } from "next/server";
import { MOCK_INBOX } from "@/lib/mock/inbox";
import type { ReplyStyle } from "@/types/inbox";

// POST /api/inbox/[emailId]/select — select a reply strategy, returns full email
export async function POST(
  req: Request,
  { params }: { params: { emailId: string } }
) {
  const { emailId } = params;
  const email = MOCK_INBOX.find((e) => e.id === emailId);
  if (!email) {
    return NextResponse.json({ success: false, error: "Email not found" }, { status: 404 });
  }

  const body = await req.json();
  const style: ReplyStyle = body.style;

  const option = email.options?.find((o) => o.style === style);
  if (!option) {
    return NextResponse.json({ success: false, error: "Option not found" }, { status: 404 });
  }

  // Get pre-written high-quality email for this email+style combo
  const fullEmail = getFullEmail(emailId, style, email.from_name);

  // Simulate 1-2s AI generation delay
  await new Promise((r) => setTimeout(r, 800));

  return NextResponse.json({
    success: true,
    full_email: fullEmail,
  });
}

function getFullEmail(
  emailId: string,
  style: ReplyStyle,
  fromName: string
): { subject: string; body: string; attachments: string[] } {
  const firstName = fromName.split(" ")[0];
  const emails = MOCK_FULL_EMAILS[emailId];
  if (emails && emails[style]) {
    return emails[style];
  }
  // Fallback for emails without pre-written responses
  return getFallbackEmail(firstName, style);
}

// Pre-written high-quality business emails for each mock email + style
const MOCK_FULL_EMAILS: Record<string, Record<ReplyStyle, { subject: string; body: string; attachments: string[] }>> = {
  "email-001": {
    steady: {
      subject: "Re: Quotation for DisplayPort & USB-C Cables — Price Revision Request",
      body: `Dear Hans,

Thank you for your detailed feedback on our quotation. I understand budget alignment is critical for your Q3 planning, and I appreciate you sharing your target pricing.

Regarding your request for USD 2.80/pc (DP) and USD 1.60/pc (USB-C), I've discussed this with our production team. Given the volume of 5,000 + 8,000 pcs, we can offer the following revised pricing:

• DisplayPort 1.4 Cable (2m): USD 3.05/pc (down from USD 3.35)
• USB-C 3.2 Gen2 Cable (1m): USD 1.85/pc (down from USD 2.10)

This represents an 8-9% reduction from our original quote. While we cannot match the Shenzhen pricing directly, our offer includes:

1. Full CE + RoHS certification (certificates attached)
2. 100% electrical testing on every unit
3. 18-day production lead time with DHL Express shipping
4. 12-month quality warranty with free replacement

I'd also like to offer a complimentary sample set (5 pcs each model) so your engineering team can verify build quality before committing. Samples can ship today via DHL, arriving in Munich within 4-5 business days.

Would this revised pricing work for your Q3 budget? I'm happy to discuss further adjustments if you can confirm the order by May 18th.

Best regards,
Wilson Yang
Sales Manager
Farreach Electronic Co., Ltd.
Tel: +86-756-8679200
Email: sale-9@farreach-electronic.com`,
      attachments: ["CE_Certificate_DP14.pdf", "RoHS_Test_Report.pdf", "Product_Datasheet_DP_USBC.pdf"],
    },
    aggressive: {
      subject: "Re: Quotation for DisplayPort & USB-C Cables — Price Revision Request",
      body: `Dear Hans,

I'll be direct — I want to win this business, and I'm prepared to make it happen.

After reviewing your target pricing and considering the 13,000 pcs total volume, here's my best offer:

• DisplayPort 1.4 Cable (2m): USD 2.88/pc
• USB-C 3.2 Gen2 Cable (1m): USD 1.68/pc

This is within 3-5% of your target, and significantly below our standard pricing. I can hold this rate under two conditions:

1. Order confirmation by May 16th (Friday)
2. 30% T/T deposit upon PI confirmation

Why move fast: Our Vietnam factory is scheduling Q3 production runs this week. Locking in now guarantees your 18-day lead time. Orders confirmed after May 20th will likely push to a 25-30 day timeline due to capacity allocation.

I'm attaching our CE certificate for your compliance team. Samples are already packed — I just need your shipping address and they go out today via DHL Express (3-day delivery to Munich).

One call and we can close this. Are you available Thursday afternoon (your time) for a 10-minute call?

Best regards,
Wilson Yang
Sales Manager
Farreach Electronic Co., Ltd.
Tel: +86-756-8679200
Email: sale-9@farreach-electronic.com`,
      attachments: ["CE_Certificate_DP14.pdf", "RoHS_Test_Report.pdf"],
    },
    creative: {
      subject: "Re: Quotation for DisplayPort & USB-C Cables — A Different Approach",
      body: `Dear Hans,

Thank you for your transparency about the competing offer from Shenzhen. Rather than simply matching their price, I'd like to propose something that addresses your real concern: reliable supply with verified quality.

Here's what I'm thinking:

Phase 1 — Qualification Order (500 pcs each model)
• Standard pricing applies (DP: USD 3.15/pc, USB-C: USD 1.95/pc)
• We ship within 10 days
• Your team tests and validates quality
• Full refund if products don't meet your specifications

Phase 2 — Volume Order (confirmed after Phase 1)
• DP 1.4: USD 2.95/pc | USB-C 3.2: USD 1.75/pc
• Dedicated production line allocation
• Free custom packaging design (your branding, your specs)
• Quarterly pricing locked for 12 months

Why this works for you:
You eliminate supplier risk without committing 13,000 pcs upfront. Your Shenzhen supplier may offer lower unit cost, but factor in potential quality failures, re-testing costs, and delivery delays — our total cost of ownership is competitive.

Additionally, I'd like to invite you to a live video tour of our Vietnam production facility (10,000 sqm, 16 production lines, ISO 9001 certified). Seeing the operation firsthand gives you confidence that we can scale with your needs.

I can arrange the video call any day this week. Would Wednesday or Thursday work for you?

Best regards,
Wilson Yang
Sales Manager
Farreach Electronic Co., Ltd.
Tel: +86-756-8679200
Email: sale-9@farreach-electronic.com`,
      attachments: ["CE_Certificate_DP14.pdf", "RoHS_Test_Report.pdf", "Company_Profile_2026.pdf", "Vietnam_Factory_Overview.pdf"],
    },
  },
};

function getFallbackEmail(
  firstName: string,
  style: ReplyStyle
): { subject: string; body: string; attachments: string[] } {
  // Generic fallback for other mock emails
  const templates: Record<ReplyStyle, { subject: string; body: string; attachments: string[] }> = {
    steady: {
      subject: "Re: Your Inquiry",
      body: `Dear ${firstName},

Thank you for your inquiry. I've reviewed your requirements and would like to provide the following information.

Based on your specifications, we can offer competitive pricing with our standard terms:
• Production lead time: 15-18 working days
• Payment: 30% T/T deposit, 70% before shipment
• All products carry CE, RoHS, and FCC certifications
• Free samples available for quality verification

I've attached our relevant certificates and product datasheets for your reference. Please let me know if you'd like to proceed with samples or if you have any questions about specifications.

Looking forward to your reply.

Best regards,
Wilson Yang
Sales Manager
Farreach Electronic Co., Ltd.
Tel: +86-756-8679200
Email: sale-9@farreach-electronic.com`,
      attachments: ["CE_Certificate.pdf", "Product_Datasheet.pdf"],
    },
    aggressive: {
      subject: "Re: Your Inquiry — Limited Time Offer",
      body: `Dear ${firstName},

Thank you for reaching out. I've fast-tracked your request and have a special offer ready.

Given your volume requirements, I can offer our best pricing — but I need to be upfront: this rate is only available if we can confirm by end of this week. Our production schedule is filling up for Q3 and I want to make sure we can accommodate your timeline.

Here's what I'm proposing:
• 10-12% below our standard list price
• Priority production slot (15-day lead time guaranteed)
• Samples shipped today via express courier

I'd love to jump on a quick call to finalize details. Are you available tomorrow?

Best regards,
Wilson Yang
Sales Manager
Farreach Electronic Co., Ltd.
Tel: +86-756-8679200
Email: sale-9@farreach-electronic.com`,
      attachments: ["CE_Certificate.pdf"],
    },
    creative: {
      subject: "Re: Your Inquiry — Partnership Proposal",
      body: `Dear ${firstName},

Thank you for your interest in Farreach Electronic. Instead of a standard quote, I'd like to propose a partnership approach that creates more value for both sides.

I suggest we start with a small qualification batch so your team can verify our quality firsthand — no large commitment required upfront. Once validated, we can discuss volume pricing with dedicated production allocation and custom packaging options.

I'd also like to invite you to a virtual tour of our manufacturing facility. Seeing our 16 production lines and quality control process gives you confidence in our capabilities.

Would you be open to a brief video call this week to discuss?

Best regards,
Wilson Yang
Sales Manager
Farreach Electronic Co., Ltd.
Tel: +86-756-8679200
Email: sale-9@farreach-electronic.com`,
      attachments: ["CE_Certificate.pdf", "Company_Profile_2026.pdf"],
    },
  };
  return templates[style];
}
