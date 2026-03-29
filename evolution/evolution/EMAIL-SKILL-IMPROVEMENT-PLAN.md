# 📧 Email Skill 改进计划 - Revolution 任务总览

**创建日期：** 2026-03-28  
**来源：** Email Skill 审计报告（ORACLE 审计，评分 7.5/10）  
**总工作量：** ~39 小时

---

## 📋 任务列表

| Task ID | 优先级 | 标题 | 子任务数 | 预估工时 | 状态 |
|---------|--------|------|----------|----------|------|
| 001 | P0 | 安全改进 - dry-run + 发送日志 | 4 | 3h | pending |
| 002 | P0 | inbound 邮件同步 OKKI | 4 | 2h | pending |
| 003 | P1 | 签名模板管理 | 4 | 4h | pending |
| 004 | P1 | 邮件规则/过滤器 | 6 | 6h | pending |
| 005 | P1 | 移动邮件到文件夹 | 5 | 4h | pending |
| 006 | P2 | 连接池优化 | 5 | 8h | pending |
| 007 | P2 | 定时发送 + 交互式模式 | 5 | 12h | pending |
| **总计** | | | **33** | **39h** | |

---

## 🎯 执行策略

### Phase 1: P0 安全改进（立即执行）
- **Task 001:** dry-run 模式 + 发送日志 + 速率限制
- **Task 002:** inbound 邮件 OKKI 同步

**预期收益：** 符合 AGENTS.md 安全红线，客户跟进记录完整

### Phase 2: P1 业务增强（近期执行）
- **Task 003:** 签名模板管理
- **Task 004:** 邮件规则/过滤器
- **Task 005:** 移动邮件到文件夹

**预期收益：** 统一公司形象，自动分类邮件，客户归档管理

### Phase 3: P2 性能体验（长期优化）
- **Task 006:** 连接池优化
- **Task 007:** 定时发送 + 交互式模式

**预期收益：** 批量操作性能提升 5-10 倍，用户体验优化

---

## 📂 任务文件位置

```
/Users/wilson/.openclaw/workspace/evolution/tasks/
├── task-001.json  # P0 安全改进
├── task-002.json  # P0 inbound OKKI 同步
├── task-003.json  # P1 签名模板
├── task-004.json  # P1 邮件规则
├── task-005.json  # P1 邮件管理
├── task-006.json  # P2 连接池
└── task-007.json  # P2 定时发送 + 交互式
```

---

## 🔄 执行流程

每个任务遵循 Revolution 标准流程：

1. **Sonnet 审阅** - 分析子任务，生成执行指令
2. **Qwen 执行** - 按指令修改代码
3. **Sonnet 审核** - 验证执行结果
4. **更新 task JSON** - 记录 history，推进状态
5. **Discord 汇报** - 发送到 #📧-邮件规范讨论

---

## 📊 验收标准

### P0 任务（必须 100% 通过）
- [ ] dry-run 模式正常工作
- [ ] 发送日志完整记录
- [ ] 速率限制生效
- [ ] inbound 邮件成功同步 OKKI

### P1 任务（必须 100% 通过）
- [ ] 签名模板可加载
- [ ] 邮件规则自动分类
- [ ] 邮件可移动到文件夹

### P2 任务（性能提升可量化）
- [ ] 批量操作性能提升 ≥5 倍
- [ ] 定时发送准确触发
- [ ] 交互式模式可用

---

## 📝 相关文档

- [审计报告](../../skills/imap-smtp-email/AUDIT-2026-03-28.md)
- [SKILL.md](../../skills/imap-smtp-email/SKILL.md)
- [AGENTS.md](../../AGENTS.md) - 安全红线
- [HEARTBEAT.md](../../HEARTBEAT.md) - Revolution 执行流程

---

**最后更新：** 2026-03-28 17:15  
**维护者：** WILSON
