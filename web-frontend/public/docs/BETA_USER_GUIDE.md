# Super Sales Agent Beta User Guide

This guide is for beta users who want to try the sales CRM without help from a
developer. It focuses on the normal product flow: start, connect a mailbox,
import customers, review customer records, and approve any real external action.

## Start

Open Super Sales Agent and begin with Onboarding. The setup page walks you
through workspace identity, mailbox settings, customer starting data, document
templates, notifications, and safety approvals.

Use Health Check when something feels unclear. It shows whether the sales
workspace is ready, whether mailbox sync is active, whether background activity
is recent, and what to do next.

## Demo data

Use Create demo data before connecting real accounts. It creates sample
customers with contacts, recent Orders, and Timeline activity so you can inspect
the CRM flow safely.

Use Run demo email to place a sample inbound message into Customers. After the
drill, open Customers to see the new activity, order milestone, and next-step
recommendation.

## Connect mailbox

Go to Onboarding or Settings and enter the mailbox information requested on the
screen. Run the connection test before saving.

After the mailbox is connected and capture is enabled, new mail is collected in
the background. Customer records receive a visible activity entry, and sales
signals such as payment, shipment, refund, after-sales, or order exception are
added to the customer Timeline when detected.

## Import customers

Open Customers and use the import path when you already have a customer list.
Keep the file focused on business information such as company name, contact
person, email, country, product interest, notes, and current relationship stage.

After import, review the customer list for duplicate companies, missing
contacts, and outdated notes. Use the customer detail page to confirm the main
contact, rating, recent activity, recent Orders, and next suggested action.

## View customers

Open Customers to review the active sales pipeline. The customer page is meant
for business review, not technical debugging. It highlights:

- customer name, region, relationship status, and rating;
- main contacts and recent communication;
- recent Orders and important order milestones;
- Timeline activity from email, orders, notes, and lifecycle changes;
- the next recommended follow-up.

Customer status changes include a reason so the team can understand why a
customer became a Prospect, Active Customer, Dormant, Risk, or Archived account.

## Orders

Orders collect quotation, PI, confirmed order, payment, shipment, after-sales,
refund, and exception information in one place.

Open a customer detail page to review recent Orders by date, product type,
amount, and status. Order updates also appear in the Timeline so sales, finance,
shipping, and support context stay together.

## Timeline

Timeline is the operating history of a customer. It should answer what changed,
when it changed, and why it matters.

Use Timeline to review inbound email activity, order milestones, customer status
changes, follow-up suggestions, payment updates, shipment updates, after-sales
notes, refunds, and exception handling.

## Approval

Real external actions are blocked by default. Sending a real email, writing to a
connected CRM, or performing a real customer follow-up requires explicit
approval before execution.

Use the approval screen to review the business action, recipient or customer,
message or change summary, expected result, and failure status. Failed actions
remain visible for recovery instead of running silently.

## Daily check

Before inviting a beta user, confirm these items:

- Health Check shows the workspace is ready or gives clear next steps.
- Demo data can be created and opened in Customers.
- Mailbox connection has been tested.
- Customer import has a reviewed sample file.
- Customer details show contacts, rating, Orders, Timeline, and next action.
- Real external actions remain blocked unless an approval is recorded.
