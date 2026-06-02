export interface AppNavItem {
  label: string;
  zhLabel?: string;
  href: string;
}

export const APP_NAV_ITEMS: AppNavItem[] = [
  { label: "Cockpit", zhLabel: "驾驶舱", href: "/" },
  { label: "Intake", zhLabel: "投递台", href: "/intake" },
  { label: "Leads", zhLabel: "线索", href: "/leads" },
  { label: "Inbox", zhLabel: "收件箱", href: "/inbox" },
  { label: "Outreach", zhLabel: "开发信", href: "/emails" },
  { label: "Quotes", zhLabel: "报价", href: "/quotations" },
  { label: "Ship Docs", zhLabel: "出货文件", href: "/documents" },
  { label: "Intel", zhLabel: "情报", href: "/intelligence" },
  { label: "Settings", zhLabel: "设置", href: "/settings" },
];
