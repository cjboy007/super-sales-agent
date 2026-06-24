export interface AppNavItem {
  label: string;
  zhLabel?: string;
  href: string;
}

export const APP_NAV_ITEMS: AppNavItem[] = [
  { label: "Workbench", zhLabel: "工作台", href: "/" },
  { label: "Pending Review", zhLabel: "待确认", href: "/reviews" },
  { label: "Lead Development", zhLabel: "线索开发", href: "/growth" },
  { label: "Customer Follow-up", zhLabel: "客户跟进", href: "/leads" },
  { label: "Email Drafts", zhLabel: "邮件草稿", href: "/emails" },
  { label: "Quote Center", zhLabel: "报价中心", href: "/quotations" },
  { label: "Task Progress", zhLabel: "任务进度", href: "/agent-status" },
  { label: "Customer Records", zhLabel: "客户档案", href: "/customers" },
  { label: "Settings", zhLabel: "设置", href: "/settings" },
];

export const APP_PAGE_LABELS: AppNavItem[] = [
  ...APP_NAV_ITEMS,
  { label: "Data Import", zhLabel: "资料导入", href: "/intake" },
  { label: "Email Review", zhLabel: "邮件复核", href: "/inbox" },
  { label: "Document Center", zhLabel: "单证中心", href: "/documents" },
  { label: "Market Insights", zhLabel: "市场洞察", href: "/intelligence" },
  { label: "Health Check", zhLabel: "健康检查", href: "/health" },
  { label: "User Guide", zhLabel: "使用指南", href: "/user-guide" },
];
