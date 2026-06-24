"use client";

import Link from "next/link";
import {
  BattleBadge,
  BattlePageBody,
  BattlePageHeader,
  BattlePageShell,
  BattlePanel,
  BattleText,
  CommandButton,
} from "@/components/ui/BattlePage";

const guideSections = [
  {
    title: "Start",
    zhTitle: "开始",
    body: "Open Super Sales Agent, enter the Activation Code, then start from Workbench or Customer Follow-up. Task Progress shows whether the workspace is ready and what needs attention.",
    zhBody: "打开 Super Sales Agent，输入会员激活码，然后从工作台或客户跟进开始。任务进度会显示工作台是否就绪，以及下一步需要处理什么。",
  },
  {
    title: "Demo Data",
    zhTitle: "演示数据",
    body: "Use demo data before connecting real accounts. It creates sample customers, recent order milestones, and timeline activity so testers can inspect the CRM flow safely.",
    zhBody: "连接真实账号前，先使用演示数据。它会创建样例客户、订单节点和时间线动态，方便测试者安全地理解 CRM 流程。",
  },
  {
    title: "Connect mailbox",
    zhTitle: "连接邮箱",
    body: "Use Onboarding or Settings to add mailbox details and run the connection test. After capture is enabled, incoming mail can become customer timeline activity.",
    zhBody: "在入门页或设置页填写邮箱信息，并运行连接测试。开启自动捕获后，新邮件会进入客户时间线。",
  },
  {
    title: "Import customers",
    zhTitle: "导入客户",
    body: "Prepare a focused customer list with company name, contact, email, country, product interest, notes, and relationship stage. Review duplicates after import.",
    zhBody: "准备客户表时保留公司名、联系人、邮箱、国家、产品兴趣、备注和当前关系阶段。导入后检查重复客户。",
  },
  {
    title: "Customer follow-up",
    zhTitle: "客户跟进",
    body: "Open Customer Follow-up to review contacts, rating, recent activity, orders, timeline, and next suggested action. Status changes include a business reason.",
    zhBody: "打开客户跟进查看联系人、评级、最近动态、订单、时间线和下一步建议。客户状态变化会显示业务原因。",
  },
  {
    title: "Orders",
    zhTitle: "订单与时间线",
    body: "Customer detail pages collect quotation, PI, payment, shipment, after-sales, refund, and exception context in one place. Timeline shows what changed and why it matters.",
    zhBody: "客户详情页集中展示报价、PI、付款、发货、售后、退款和异常。时间线说明发生了什么，以及为什么重要。",
  },
  {
    title: "Review",
    zhTitle: "确认",
    body: "Real external actions are blocked by default. A real email, CRM write, or customer follow-up must be reviewed and confirmed before execution.",
    zhBody: "真实外部动作默认锁定。真实邮件、CRM 写入或客户跟进动作都需要先复核确认，再执行。",
  },
];

const checklist = [
  ["Health Check is ready", "健康检查显示就绪"],
  ["Demo data opens in Customer Follow-up", "演示数据可在客户跟进打开"],
  ["Mailbox connection is tested", "邮箱连接已测试"],
  ["Customer import sample is reviewed", "客户导入样例已检查"],
  ["Customer detail shows contacts, orders, timeline, and next action", "客户详情显示联系人、订单、时间线和下一步动作"],
  ["Real external actions stay blocked unless confirmed", "真实外部动作保持锁定，除非已确认"],
];

export default function UserGuidePage() {
  return (
    <BattlePageShell>
      <BattlePageHeader
        title="User Guide"
        zhTitle="使用指南"
        meta="Closed alpha first-run path"
        zhMeta="内测首次使用路径"
      >
        <Link href="/beta-access" className="inline-flex h-[var(--ui-button-height)] items-center rounded-md border border-slate-700 bg-slate-800 px-3 text-[13px] font-semibold text-slate-200 transition hover:border-slate-600">
          <BattleText en="Beta Access" zh="内测访问" />
        </Link>
        <Link href="/leads" className="inline-flex h-[var(--ui-button-height)] items-center rounded-md border border-emerald-600 bg-emerald-600 px-3 text-[13px] font-semibold text-white transition hover:bg-emerald-500">
          <BattleText en="Open Follow-up" zh="打开客户跟进" />
        </Link>
      </BattlePageHeader>

      <BattlePageBody className="space-y-4">
        <section className="rounded-md border border-slate-800 bg-slate-900/45 p-5">
          <BattleBadge tone="emerald">
            <BattleText en="Closed Alpha" zh="内测" />
          </BattleBadge>
          <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-100">
            <BattleText en="How to use Super Sales Agent" zh="如何使用 Super Sales Agent" />
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            <BattleText
              en="This guide is for beta users who want to try the sales CRM without help from a developer. Start with access, demo data, customer follow-up, mailbox, and review flow."
              zh="这份指南给内测用户使用，不需要开发人员陪同。先完成访问，再看演示数据、客户跟进、邮箱和确认流程。"
            />
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/beta-access" className="inline-flex h-9 items-center rounded-md border border-slate-700 bg-slate-800 px-4 text-xs font-semibold text-slate-100 transition hover:border-slate-600">
              <BattleText en="Enter Activation Code" zh="输入会员激活码" />
            </Link>
            <Link href="/jadenos/onboarding" className="inline-flex h-9 items-center rounded-md border border-slate-700 bg-slate-800 px-4 text-xs font-semibold text-slate-100 transition hover:border-slate-600">
              <BattleText en="Open Onboarding" zh="打开入门页" />
            </Link>
            <Link href="/health" className="inline-flex h-9 items-center rounded-md border border-slate-700 bg-slate-800 px-4 text-xs font-semibold text-slate-100 transition hover:border-slate-600">
              <BattleText en="Check Health" zh="查看健康检查" />
            </Link>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-3 md:grid-cols-2">
            {guideSections.map((section, index) => (
              <BattlePanel
                key={section.title}
                title={`${index + 1}. ${section.title}`}
                meta={section.zhTitle}
                tone={index % 3 === 0 ? "emerald" : index % 3 === 1 ? "blue" : "purple"}
              >
                <div className="space-y-3 p-4">
                  <p className="text-sm leading-6 text-slate-300">
                    <BattleText en={section.body} zh={section.zhBody} />
                  </p>
                </div>
              </BattlePanel>
            ))}
          </div>

          <aside className="space-y-3">
            <BattlePanel title="Daily Check" meta="before inviting testers" tone="amber">
              <div className="divide-y divide-slate-800">
                {checklist.map(([en, zh]) => (
                  <div key={en} className="flex gap-2 px-3 py-3 text-xs leading-5 text-slate-300">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                    <span><BattleText en={en} zh={zh} /></span>
                  </div>
                ))}
              </div>
            </BattlePanel>

            <BattlePanel title="Need Access?" meta="closed alpha" tone="neutral">
              <div className="space-y-3 p-4">
                <p className="text-xs leading-5 text-slate-400">
                  <BattleText
                    en="If a page asks for access, enter the Activation Code from the team. The app will remember it in this browser."
                    zh="如果页面要求访问，请输入团队提供的会员激活码。当前浏览器会记住这次访问。"
                  />
                </p>
                <Link href="/beta-access" className="block">
                  <CommandButton type="button" variant="primary" className="w-full">
                    <BattleText en="Open Beta Access" zh="打开内测访问" />
                  </CommandButton>
                </Link>
              </div>
            </BattlePanel>
          </aside>
        </div>
      </BattlePageBody>
    </BattlePageShell>
  );
}
