# 银行配置同步说明

## 📁 配置文件位置

**主配置文件：**
```
/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/config/bank-accounts.json
```

**引用配置文件：**
```
/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/skills/quotation-workflow/config/bank-accounts.json
```

---

## 🔄 同步流程

### 方式 1：手动同步（推荐）

```bash
# 更新报价单配置的银行账户
cp config/bank-accounts.json \
   skills/quotation-workflow/config/bank-accounts.json

# 验证
cat skills/quotation-workflow/config/bank-accounts.json | jq '.primary'
```

### 方式 2：使用同步脚本

```bash
# 同步银行配置
bash scripts/sync-bank-config.sh
```

---

## ✅ 验证

```bash
# 检查两个文件是否一致
diff config/bank-accounts.json \
     skills/quotation-workflow/config/bank-accounts.json

# 无输出 = 完全一致
```

---

## 📝 更新银行账户时的步骤

1. **编辑主配置文件**
   ```bash
   vim config/bank-accounts.json
   ```

2. **同步到引用目录**
   ```bash
   cp config/bank-accounts.json \
      skills/quotation-workflow/config/bank-accounts.json
   ```

3. **验证更新**
   ```bash
   node -e "console.log(require('./scripts/bank-config').getPrimaryBank())"
   ```

4. **提交 Git**
   ```bash
   git add config/bank-accounts.json
   git add skills/quotation-workflow/config/bank-accounts.json
   git commit -m "更新银行账户配置"
   ```

---

## ⚠️ 注意事项

1. **永远只编辑主配置文件**（`config/bank-accounts.json`）
2. **不要直接编辑引用目录的文件**
3. **每次更新后必须同步**
4. **Git 提交时要包含两个文件**

---

## 🎯 为什么需要两个文件？

**原因：**
- `quotation-workflow` 可能被独立调用
- 避免跨目录路径解析问题
- 保持模块独立性

**未来优化：**
- 可以考虑使用符号链接（symlink）
- 或实现配置中心服务
