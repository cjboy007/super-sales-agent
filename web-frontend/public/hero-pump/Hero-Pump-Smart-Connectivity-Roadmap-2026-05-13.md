# Hero Pump Smart Connectivity Roadmap — EU 市场智能建筑集成战略

> **心跳 #57 | 2026-05-13 09:19 (Asia/Shanghai) | 🎁 惊喜模式**
> 骰子 80 → 给主人惊喜：提前布局 Hero Pump 智能连接生态位

---

## 🔥 核心发现：EU 市场正在发生什么

### 1. SRI（智能就绪指标）2027 年强制化

- **EPBD Recast（EU 2024/1275）** 要求大型非住宅建筑在 **2027 年 6 月前** 必须进行 SRI 评估
- 成员国转正截止日期：**2026 年 5 月 29 日**（就是今年！）
- SRI 评估 9 大技术域中，**供暖（Heating）、生活热水（DHW）、监控与控制（Monitoring & Control）** 三个域直接与循环泵相关
- 泵的连接能力（BACnet/Modbus 等）直接影响建筑 SRI 评分
- **标准化审计方法论 CWA 18193:2025** 已发布，第三方审计可操作

### 2. 竞品连接能力全景对标

| 能力层 | Grundfos | Wilo | EDWIN (Hero Pump OEM) | 差距 |
|--------|----------|------|----------------------|------|
| **BMS 协议** | BACnet (MS/TP + IP) / Modbus (RTU + TCP) / LONWorks / PROFIBUS / PROFINET / EtherNet/IP | BACnet (MS/TP + IP) / Modbus (RTU + TCP) / LON / PLR / CANopen | ❌ 无 | 🔴 严重 |
| **本地连接** | GENIbus（私有泵总线）+ Grundfos GO app（蓝牙） | Wilo Net（私有系统总线）+ Wilo-Assistant app（蓝牙） | ❌ 无 | 🔴 严重 |
| **云平台** | Grundfos Remote Management（云端远程监控 + 报告） | Wilo-Smart Cloud + Wilo-Smart Gateway（实时数据） | ❌ 无 | 🔴 严重 |
| **IoT 型号** | ALPHA2 GO（内置蓝牙）| Stratos MAXO（CIF 模块可插拔） | HRS-EAW（仅宣称 IoT，无具体协议） | 🟡 有概念无实现 |

### 3. Grundfos 连接架构深度解析

**三层连接栈：**
1. **泵内总线（GENIbus）**：Grundfos 私有协议，基于 GENIpro，用于泵与控制器之间的数据传输。支持设定点控制、闭环控制、监控/数据记录、配置、故障诊断。
2. **网关模块（CIM/CIU）**：将 GENIbus 转换为标准 BMS 协议。CIM 300 安装在泵内（10-pin 连接），CIU 为外部供电单元。支持 BACnet MS/TP、BACnet IP、Modbus RTU、Modbus TCP。
3. **云端平台（Grundfos Remote Management）**：基于互联网的远程监控、管理和报告系统，可访问泵、控制器和传感器数据。

**ALPHA2 GO**：内置蓝牙，直接连接 Grundfos GO app，无需额外模块。

### 4. Wilo 连接架构深度解析

**三层连接栈：**
1. **系统总线（Wilo Net）**：Wilo 私有协议，用于 Wilo 产品间通信（多泵协同、双头泵运行、Multi-Flow Adaptation）。
2. **CIF 模块（可插拔）**：BACnet MS/TP (2190367)、BACnet IP (2537051)、Modbus RTU、Modbus TCP、LON、PLR、CANopen。Stratos MAXO 预留 CIF 插槽。
3. **云平台（Wilo-Smart Cloud）**：通过 Wilo-Smart Gateway 将泵数据传至云端，手机 app 实时监控。Wilo-Smart Connect 支持蓝牙本地控制。

**Wilo-Assistant app**：iOS/Android 双平台，支持规划、客户咨询、安装调试、运行参数设置。

### 5. EDWIN 现状：有 IoT 概念，无具体实现

- **HRS-EAW**：Made-in-China listing 标注 "IoT Connection Quiet Variable Frequency Circulation Pump"，但无具体协议描述，详情页被验证码拦截
- **BPG Series**：官网新闻宣称 "IoT connectivity"，但无技术细节
- **无 BACnet/Modbus 认证**，无 BMS 集成文档
- **无移动 app**，无云平台
- **无 SRI 合规声明**

**⚠️ 这是 Hero Pump 的差异化黄金机会！**

---

## 📊 SRI 评分影响分析

SRI 评估泵的 3 大功能：
1. **优化能效和整体性能** → 智能泵可报告能耗、运行状态、故障预警
2. **适应居住者需求** → 远程控制、调度、自适应运行模式
3. **响应电网信号** → 需求响应、能源灵活性

### 泵连接能力对 SRI 的贡献

| SRI 技术域 | 泵的贡献方式 | 所需连接能力 |
|------------|-------------|-------------|
| **供暖 (Heating)** | 智能循环泵 + BMS 集成 → 按需供热 + 能效优化 | BACnet/Modbus |
| **生活热水 (DHW)** | 热水循环泵 + 调度控制 → 减少热损失 | BACnet/Modbus |
| **监控与控制 (M&C)** | 能耗监测 + 故障报警 + 远程诊断 | 任意数字接口 |

**关键洞察：** 安装 BACnet/Modbus 循环泵是提升建筑 SRI 评分的**低成本高回报**措施。对于欧盟分销商和工程商，这是**采购决策的关键考量**。

---

## 🚀 Hero Pump 智能连接路线图（3 阶段）

### Phase 1：基础连接（6-9 个月，成本最低）

**目标：** 让 Hero Pump 能接入 BMS 系统

**具体方案：**
1. **Modbus RTU 内建**（RS-485 接口）
   - 硬件成本：$2-5/台（RS-485 收发器 + MCU）
   - 覆盖 80% 的 EU 中小建筑 BMS 需求
   - 对标 Grundfos CIM 200 / Wilo CIF Modbus RTU

2. **基础 Modbus 寄存器映射**：
   - 0x0001: 运行状态（Run/Stop/Fault）
   - 0x0002: 运行模式（手动/自动/夜间）
   - 0x0003: 设定转速（RPM）
   - 0x0004: 实际转速（RPM）
   - 0x0005: 功耗（W）
   - 0x0006: 累计能耗（kWh）
   - 0x0007: 运行小时数
   - 0x0008: 故障代码
   - 0x0009: 温度传感器（如有）
   - 0x000A: 流量（如有）

3. **认证**：Modbus ID 注册（免费），BTL（BACnet Testing Laboratories）后续申请

**EDWIN 外联请求项：**
- 确认 HRS-EAW 的 IoT 具体实现（协议？接口？app？）
- 能否定制固件加入 Modbus RTU 支持？
- PCB 是否预留通信接口（UART/SPI）？
- MCU 选型及固件可修改性？

### Phase 2：标准协议 + 移动 app（9-15 个月）

**目标：** 对标 ALPHA2 GO / Wilo-Smart Connect

**具体方案：**
1. **BACnet MS/TP 支持**（RS-485 复用 Phase 1 硬件）
   - 覆盖大型商业建筑 BMS 需求
   - 对标 Grundfos CIM 300 BACnet / Wilo CIF BACnet MS/TP
   - 需 BTL 认证（~$5,000-10,000）

2. **蓝牙 LE 模块**（BLE 4.0+）
   - 硬件成本：$1-2/台
   - 开发配套 app（iOS/Android）
   - 功能：安装调试、参数设置、运行监控、故障诊断
   - 对标 Grundfos GO / Wilo-Assistant

3. **SRI 合规声明**：
   - 发布 "SRI-Ready" 声明
   - 提供 SRI 评分贡献白皮书
   - 成为分销商采购决策的差异化卖点

### Phase 3：云平台 + 数据分析（15-24 个月）

**目标：** 对标 Grundfos Remote Management / Wilo-Smart Cloud

**具体方案：**
1. **Hero Pump Cloud**：
   - 轻量级 SaaS 平台
   - 实时泵状态监控（通过 WiFi 网关或 BLE 网关）
   - 能耗报告 + 运行时长统计
   - 故障预警 + 维护提醒
   - 多站点管理

2. **WiFi/LoRa 网关**：
   - 硬件成本：$15-25/站点
   - 支持 1-50 台泵
   - 数据上传至 Hero Pump Cloud

3. **AI 增值功能**：
   - 预测性维护（振动/电流模式分析）
   - 能耗优化建议
   - 系统级协调控制（多泵协同）

---

## 💰 商业价值估算

### 价格溢价

| 产品版本 | 目标客户 | 预估零售价 | 溢价 vs 基础款 |
|----------|---------|-----------|---------------|
| Hero Pump 基础款 | 住宅 DIY | €120-180 | 基准 |
| Hero Pump Modbus | 小型商业/住宅 | €180-250 | +30-50% |
| Hero Pump BACnet + BT | 大型商业 | €250-400 | +60-120% |
| Hero Pump Cloud 套装 | 设施管理公司 | €400-600 + €5/月/台 | +100-230% |

### 市场准入

- **SRI 合规** → 进入政府/公共采购清单的门票
- **BACnet 认证** → 大型商业项目 BMS 集成强制要求
- **移动 app** → 安装商/运维商的核心需求

### 竞争壁垒

一旦 Hero Pump 建立连接生态（app + cloud + BMS 集成），客户切换成本将大幅提高。Grundfos/Wilo 的护城河不仅是泵本身，更是**连接生态**。

---

## 📋 下一步行动计划

### 立即行动（本周）

1. ✅ 在 EDWIN 外联邮件中增加以下请求：
   - "HRS-EAW 型号的具体 IoT 实现方案？支持哪些通信协议？"
   - "能否提供 HRS-EA 系列 MCU 型号和固件开发文档？"
   - "是否支持客户定制固件（添加 Modbus/BACnet）？"
   - "是否有 BMS 集成经验或第三方合作？"

2. ✅ 将此报告分享给分销商/安装商，收集反馈

### 短期行动（1-2 个月）

3. 联系 Modbus ID 组织，了解注册流程
4. 调研 RS-485 + MCU 方案（ESP32 / STM32 / NXP）的硬件成本
5. 评估 BLE app 开发可行性（Flutter / React Native）

### 中期行动（3-6 个月）

6. 开发 Modbus RTU 原型（基于现有 HRS-EA 硬件修改）
7. 制作 "Hero Pump BMS Integration Guide" 技术文档
8. 参加 EU HVAC 展会（ISH / Chillventa），展示连接能力

---

## 📚 数据来源（本次心跳）

1. Grundfos BACnet 官方页 → `https://www.grundfos.com/solutions/learn/research-and-insights/bacnet`
2. Grundfos GENIbus 官方页 → `https://www.grundfos.com/solutions/learn/research-and-insights/genibus`
3. Grundfos GO Remote app → Google Play / App Store
4. Grundfos Remote Management → `https://www.grundfos-eica.com/fileadmin/...`
5. Wilo BACnet 官方页 → `https://wilo.com/us/en_us/Solutions/Connectivity/Building-automation/BACnet/`
6. Wilo Smart Connect → `https://wilo.com/mx/en/Solutions-Finder/Connectivity/.../Smart-Connect/`
7. Wilo Remote Access → `https://wilo.com/mx/en/Solutions-Finder/Connectivity/Remote-access/`
8. Wilo-Assistant app → Google Play / App Store
9. Wilo CIF Module BACnet → SupplyHouse / Anglian Pumping
10. Wilo Stratos MAXO datasheet → `https://nationalpumpsandboilers.co.uk/...`
11. EU SRI 官方页 → `https://energy.ec.europa.eu/.../smart-readiness-indicator_en`
12. SRI FAQ → `https://sri-faq.eu/methodology/`
13. SRI CWA 18193:2025 → CEN-CENELEC Workshop
14. EPBD Recast → EUBAC / Efficient Buildings Europe
15. EDWIN HRS-EAW → Made-in-China listing
16. EDWIN BPG Series IoT → `https://www.edwin-pump.com/news/...`
17. BACnet vs Modbus vs KNX 对比 → Optigo / EMQX / keemeet

---

_产出：Hero Pump Smart Connectivity Roadmap（战略报告）+ 交互式连接协议对标矩阵（HTML）_
