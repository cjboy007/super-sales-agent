# Hero Pump Modbus RTU 集成可行性评估

**日期：** 2026-05-13 13:19 (Asia/Shanghai)
**心跳 #61** — 📈 补位推进（GAP-02 接力棒⑨：评估 Modbus RTU 集成可行性）
**骰子：** 67 → 📈 补位推进

---

## 执行摘要

**结论：Modbus RTU 集成技术完全可行，硬件成本极低（$2-5/台），SRI 评分提升显著（D→C→B），是 Hero Pump 进入 EU 商业市场的必要条件。**

**关键建议：**
1. ✅ 立即向 EDWIN 提出 Modbus RTU OEM 定制需求（Phase 1）
2. ✅ 基于 `modbus-serial` npm 库开发 JS 模拟/测试工具（验证用）
3. ✅ 将 Modbus RTU 纳入 Hero Pump 产品线 SRI 合规路线图

---

## 1. 竞品 Modbus RTU 能力对标

### 1.1 Grundfos — CIM/CIU 200 模块

| 维度 | 详情 |
|------|------|
| **模块名称** | CIM/CIU 200 Modbus RTU（产品号 96824796） |
| **接口** | RS485，Modbus RTU 协议 |
| **兼容性** | 同时支持 SoftCIM（软实现）和 CIM 200（硬件模块） |
| **集成对象** | PLC / SCADA / BAS |
| **数据交换** | 支持大量数据点（完整寄存器映射） |
| **新旧系统** | 可与新旧系统简便集成 |
| **文档** | Grundfosliterature-6012947.pdf（Modbus for Grundfos Pumps） |

**寄存器架构**（基于官方文档）：
- 寄存器按功能块分组
- 地址 00002 = Register Offset（可自定义偏移）
- 支持 Holding Register 读写
- 覆盖：泵状态、控制命令、故障报警、运行参数、能耗数据

### 1.2 Wilo — CIF-Modul Modbus RTU (2190368)

| 维度 | 详情 |
|------|------|
| **模块名称** | CIF-Modul Modbus RTU（产品号 2190368） |
| **零售价格** | ~€100-200（单件），OEM 批量大幅降低 |
| **数据点分类** | ① 控制命令 → 泵；② 泵状态消息；③ 过程值 |
| **固件兼容** | Stratos MAXO / Stratos GIGA 2.0 / Para MAXO 等 |
| **固件版本** | CIF Modbus RTU 最高 5.00 |

**核心寄存器映射**（已精读官方 datapoint list）：

| 地址 | 名称 | 类型 | 说明 | 支持型号 |
|------|------|------|------|---------|
| 1 | dutyPointRel | INT (0.5% scale) | 相对工作点（非 0-100% 固定范围） | Stratos, Para MAXO, Stratos MAXO, Stratos GIGA 2.0, IL-E, IP-E ≤7.5kW |
| 40 | Pump Command | WORD | 泵控制：ON/OFF + min/max 覆盖 | 同上 |
| 42 | controlFunction | WORD (枚举) | 控制模式选择（30+种） | 见下表 |
| 300 | busCmd.Timer | - | 总线命令定时器 | - |
| 400 | busCmd.TimerTimeout | - | 定时器超时 | - |
| 402 | dutyPointRel preset | INT | 预设相对工作点 | - |
| 403 | controlFunction preset | WORD | 预设控制模式 | - |
| 404 | Pump Command preset | WORD | 预设泵控制 | - |
| 61440 | interfaceDeviceIdentifier | - | 接口设备标识 | - |
| 61441 | transmissionSerialSpeed | - | 串口波特率 | - |
| 61442 | transmissionSerialFrame | - | 串口帧格式 | - |

**controlFunction 枚举值**（关键部分）：

| 值 | 名称 | 说明 | 适用型号 |
|----|------|------|---------|
| 1 | Gen_Spd | 恒速运行 | 全系支持 |
| 3 | Gen_PHdConst | 恒定压差控制 | Stratos, MAXO, GIGA 2.0, PICO plus |
| 4 | Gen_PHdVar | 变压差控制 | Stratos, MAXO, GIGA 2.0, PICO plus |
| 16 | HeatRadiator_PHd | 散热器变压差 | Stratos MAXO, GIGA 2.0 |
| 17 | HeatRadiator_DA | 散热器动态自适应 | Stratos MAXO, GIGA 2.0 |
| 19 | HeatFloor_PHd | 地暖压差控制 | Stratos MAXO, GIGA 2.0 |
| 20 | HeatFloor_DA | 地暖动态自适应 | Stratos MAXO, GIGA 2.0 |
| 25 | HeatFan_PHd | 风机盘管变压差 | Stratos MAXO, GIGA 2.0 |
| 31 | HeatE._TDiff | 换热器温差控制 | Stratos MAXO, GIGA 2.0 |

**发现：** Wilo 的控制模式枚举非常精细，覆盖散热器/地暖/天花板/风机盘管/换热器/水力分离器 6 大应用场景，每场景提供 3-4 种控制策略（压差/温差/动态自适应/流量联动）。

### 1.3 EDWIN — 当前 Modbus 能力：❌ 零

| 维度 | 现状 |
|------|------|
| **Modbus RTU** | 无 |
| **Modbus TCP** | 无 |
| **BACnet** | 无 |
| **RS485 接口** | 无（未在任何产品页/规格表中提及） |
| **IoT 功能** | 仅产品页有 "IoT" 概念标签，无具体实现 |
| **OEM 定制通信** | 未公开，需向 EDWIN 确认 |

**战略差距：** EDWIN 产品线（HRS-EA 系列 12 型号 + HRS-EA-CL 商用 + HRS-EA-F 热水 + HRS-EA(B) 定制）全部无 Modbus RTU 能力，这在 EU 商业市场是严重短板。Grundfos 和 Wilo 均有成熟的 Modbus RTU 模块方案。

---

## 2. SRI 评分影响分析

### 2.1 背景

根据之前的心跳调研（SRI 合规工具包 #58），SRI 评分 9 域 × 5 级（L0-L4），heating domain 权重最高。BACS 强制要求：
- >290 kW 建筑：已生效
- >70 kW 建筑：2030 年起

### 2.2 Modbus RTU 对 SRI Heating Domain 的贡献

| 控制级别 | SRI Level | 功能要求 | Modbus RTU 能否实现 |
|---------|-----------|---------|-------------------|
| L0 | 无控制 | 手动/无自动化 | ✅ 基线 |
| L1 | 手动+基础监控 | 远程读取状态 | ✅ 读取 dutyPointRel、故障状态 |
| L2 | 自动控制 | 远程启停 + 设定点调节 | ✅ Pump Command + dutyPointRel preset |
| L3 | 优化控制 | 多模式自动切换 + 预测性维护 | ✅ controlFunction + 过程值读取 + 故障诊断 |
| L4 | 预测+自适应 | AI 优化 + 跨系统联动 | ⚠️ 需要上层平台（Modbus 是数据通道） |

**评估：** 纯 Modbus RTU 可实现 L0→L3 的完整覆盖。配合上位 BMS 平台，可支撑 L4。

### 2.3 SRI 评分估算

| 场景 | Heating Domain 得分 | 整体 SRI 估算 |
|------|-------------------|-------------|
| 无连接（当前 EDWIN） | ~28% (L0/D 级) | ~28-35% |
| Modbus RTU 基础（L1-L2） | ~45% (C 级) | ~40-50% |
| Modbus RTU + BACnet（L2-L3） | ~58% (B 级) | ~50-60% |
| 完整三层连接栈（L3-L4） | ~75%+ (A 级) | ~65-75% |

**结论：** Modbus RTU 是 SRI 评分从 D→C 的**最低成本路径**，硬件成本仅 $2-5/台。

---

## 3. 硬件实现方案

### 3.1 芯片级方案（OEM 工厂集成）

| 组件 | 型号 | 单价（批量） | 说明 |
|------|------|------------|------|
| RS485 收发器 | MAX485 / SP3485 | $0.10-0.50 | 标准 RS485 接口芯片 |
| 隔离芯片 | ISO3082 | $0.80-1.50 | 电气隔离（工业级要求） |
| MCU（可选） | STM32G0 / CH32V | $0.30-1.00 | 运行 Modbus 协议栈 |
| 连接器 | Terminal Block | $0.10-0.30 | RS485 A/B/GND 接线端子 |
| TVS 保护 | SMBJ6.5CA | $0.05-0.15 | RS485 端口 ESD/浪涌保护 |
| **BOM 合计** | | **$1.35-3.45** | 不含 PCB 和组装 |

### 3.2 模块级方案（外置通信模块）

| 方案 | 参考产品 | 单价 | 说明 |
|------|---------|------|------|
| Wilo CIF-Modul Modbus RTU | 产品号 2190368 | €100-200（零售） | 即插即用模块 |
| Grundfos CIM 200 | 产品号 96824796 | €80-150（零售） | 标准接口模块 |
| 国产 Modbus RTU 模块 | 通用 RS485 转 Modbus | ¥30-80（~$4-12） | 适用于 OEM 集成 |

### 3.3 推荐方案

**Phase 1（立即）：** 要求 EDWIN 在 HRS-EA-DN（商业连接款）中内置 RS485 + Modbus RTU，BOM 增加 ≤$3.50/台。

**Phase 2（中期）：** 开发外置 Modbus RTU 适配器（类似 Wilo CIF 模块），适用于已安装的 HRS-EA 泵，零售价 €30-50。

---

## 4. 软件实现方案

### 4.1 BMS/SCADA 端（现有生态）

Modbus RTU 被所有主流 BMS 平台原生支持：
- **Siemens Desigo** — 原生 Modbus RTU 驱动
- **Schneider EcoStruxure** — 原生 Modbus RTU 驱动
- **Honeywell EBI** — 原生 Modbus RTU 驱动
- **Loxone** — 原生 Modbus RTU 支持（已确认与 Grundfos CIM 200 集成）
- **openHAB / Home Assistant** — 社区 Modbus RTU 集成

### 4.2 自定义监控方案（Hero Pump 自有）

**推荐技术栈：**

| 层级 | 技术 | 说明 |
|------|------|------|
| **Node.js Modbus 库** | `modbus-serial` (npm) | 纯 JS 实现，支持 RTU + TCP，1979 年以来的 Modbus 标准 |
| **RS485 硬件** | USB-RS485 适配器 | CH340/FTDI 芯片，$3-8 |
| **Web Dashboard** | Node.js + Express + Chart.js | 实时监控面板 |
| **数据存储** | SQLite / TimescaleDB | 历史数据记录 |
| **协议** | Modbus RTU over RS485 | 波特率 9600/19200，8N1，最多 32 节点/总线 |

### 4.3 原型代码框架

```javascript
// hero-pump-modbus-monitor.js — 概念验证
const ModbusRTU = require("modbus-serial");
const client = new ModbusRTU();

// 连接到 RS485 适配器
await client.connectRTUBuffered("/dev/ttyUSB0", {
  baudRate: 19200,
  dataBits: 8,
  stopBits: 1,
  parity: "none"
});
client.setID(1); // 泵地址

// 读取相对工作点 (地址 1, INT, 0.5% scale)
const dutyPoint = await client.readHoldingRegisters(1, 1);
const dutyPct = dutyPoint.data[0] * 0.5;

// 读取泵状态 (地址 40)
const pumpCmd = await client.readHoldingRegisters(40, 1);
const isOn = (pumpCmd.data[0] & 0x01) === 1;

// 读取控制模式 (地址 42)
const ctrlFn = await client.readHoldingRegisters(42, 1);
const modes = {1:'Gen_Spd', 3:'Gen_PHdConst', 4:'Gen_PHdVar', 17:'HeatRadiator_DA', 20:'HeatFloor_DA'};
const mode = modes[ctrlFn.data[0]] || `Unknown(${ctrlFn.data[0]})`;

console.log(`Hero Pump #1: ${dutyPct}% | ${isOn?'ON':'OFF'} | ${mode}`);
```

---

## 5. 通信协议设计建议（Hero Pump 自定义）

### 5.1 建议寄存器映射（基于 Wilo/Grundfos 对标）

| 地址 | 名称 | 类型 | R/W | 说明 |
|------|------|------|-----|------|
| 0 | ProtocolVersion | UINT | R | 协议版本 = 1 |
| 1 | DutyPointRel | INT | R/W | 相对工作点 (0.1% scale) |
| 2 | ActualPower | UINT | R | 实际功率 (0.1W scale) |
| 3 | ActualFlow | UINT | R | 实际流量 (0.01 m³/h scale) |
| 4 | ActualHead | UINT | R | 实际扬程 (0.01m scale) |
| 5 | PumpSpeed | UINT | R | 转速 (RPM) |
| 6 | OperatingHours | UDINT | R | 累计运行小时 |
| 7 | FaultCode | UINT | R | 故障代码 (0=正常) |
| 8 | Temperature | INT | R/W | 温度 (0.1°C scale) |
| 9 | PumpCommand | WORD | W | 控制：bit0=ON/OFF, bit1=MIN, bit2=MAX |
| 10 | ControlMode | WORD | R/W | 1=恒速, 2=恒压, 3=变压差, 4=自动, 5=夜间 |
| 11 | PressureSetpoint | UINT | R/W | 压力设定值 (0.01bar scale) |
| 12 | EEI | UINT | R | 能效指数 (0.001 scale) |
| 13 | SerialNumber_H | DWORD | R | 序列号高16位 |
| 14 | SerialNumber_L | DWORD | R | 序列号低16位 |
| 15 | FirmwareVersion | WORD | R | 固件版本 (major.minor) |

### 5.2 设计要点

1. **简化 vs. 完整：** Hero Pump 作为 OEM 产品，初期可只实现核心 8 个寄存器（地址 0-7 + 9-10），后续扩展
2. **Wilo 兼容：** 地址 1（dutyPointRel）、地址 40（Pump Command）、地址 42（controlFunction）与 Wilo 对齐，降低 BMS 集成成本
3. **Grundfos 兼容：** 保留地址 00002 作为 Register Offset 配置项
4. **故障诊断：** FaultCode 需定义标准错误码表（过流/干转/过热/通信失败等）

---

## 6. 成本-收益分析

### 6.1 硬件成本

| 项目 | 单价 | 1000 台 | 10000 台 |
|------|------|---------|----------|
| RS485 收发器 + 保护 | $1.50 | $1,500 | $15,000 |
| PCB + 组装 | $0.80 | $800 | $8,000 |
| 连接器 + 线束 | $0.50 | $500 | $5,000 |
| **合计/台** | **$2.80** | **$2,800** | **$28,000** |

### 6.2 收益

| 收益项 | 量化 |
|--------|------|
| **SRI 评分提升** | D(28%)→C(45%)，建筑评级提升 1 级 |
| **商业市场准入** | >70kW 建筑 BACS 合规（2030 前强制） |
| **价格溢价** | Modbus RTU 版本 +€15-30/台（vs. 基本款） |
| **分销商需求** | EU 商业项目招标明确要求 BMS 集成能力 |
| **竞争对** | 填补与 Grundfos/Wilo 的关键差距 |

### 6.3 ROI

| 假设 | 值 |
|------|-----|
| 新增 Modbus 版本定价溢价 | €20/台 |
| 年销量（商业渠道） | 5,000 台 |
| 年增量收入 | €100,000 |
| NRE 成本（PCB 设计 + 固件 + 认证） | €15,000-30,000 |
| **投资回收期** | **< 6 个月** |

---

## 7. 向 EDWIN 提出的具体需求

### 7.1 外联邮件补充问题（接力棒⑥ 更新）

在现有外联邮件基础上，新增以下 Modbus RTU 相关问题：

1. **HRS-EA 系列是否支持 RS485 通信接口？**（硬件预留/PCB 空间）
2. **是否可 OEM 定制 Modbus RTU 固件？**（最小起订量、NRE 费用、开发周期）
3. **是否已有 Modbus RTU 寄存器映射文档？**（如有，请提供）
4. **HRS-EA-DN 中的 "DN" 是否代表 Digital Network（数字通信）？**
5. **是否有计划推出带 BACnet/Modbus 的商业泵型号？**
6. **现有 PMSM 变频器主控芯片型号？**（评估 Modbus 集成难度）
7. **CE 认证是否包含 EMC 对通信端口的要求？**

---

## 8. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| EDWIN 拒绝 Modbus OEM | 中 | 高 | 备选：外置适配器方案 |
| EU BMS 集成认证周期长 | 中 | 中 | 先做原型验证，后做认证 |
| RS485 EMC 干扰 | 低 | 中 | 隔离芯片 + TVS 保护 |
| 固件开发周期超预期 | 低 | 低 | 基于开源 Modbus 协议栈 |
| Grundfos/Wilo 专利壁垒 | 低 | 中 | Modbus 是开放协议，无专利风险 |

---

## 9. 推荐路线图

| 阶段 | 时间线 | 交付物 | 成本 |
|------|--------|--------|------|
| **Phase 0** | 本周 | 向 EDWIN 发送 Modbus OEM 需求 | $0 |
| **Phase 1** | 1-2 月 | 基于 modbus-serial 开发模拟器 + Web Dashboard | $0（自研） |
| **Phase 2** | 2-3 月 | EDWIN 提供 Modbus 样泵 / 寄存器映射 | OEM 协商 |
| **Phase 3** | 3-4 月 | 实地测试：RS485 连接 + 数据读取 + BMS 集成验证 | $500 |
| **Phase 4** | 4-6 月 | EU BMS 平台兼容性认证（Siemens/Schneider） | €5,000 |
| **Phase 5** | 6-12 月 | 量产：Modbus RTU 版本 Hero Pump 上市 | $2.80/台 |

---

## 10. 关键发现总结

1. **Modbus RTU 是 EU 商业循环泵的"入场券"** — 无 Modbus = 无法进入 >70kW 建筑市场（2030 BACS 强制）
2. **硬件成本极低** — $2-5/台，占 Hero Pump 售价 <5%
3. **Wilo 寄存器映射已公开** — 可直接对标设计，地址 1/40/42 为核心
4. **EDWIN 当前为零能力** — 这是最大的竞争差距，也是最大的机会
5. **软件生态成熟** — `modbus-serial` npm 库 + 所有主流 BMS 原生支持
6. **SRI 评分 D→C 只需 Modbus** — 最低成本的合规升级路径
7. **BACnet 是 Phase 2 升级** — 在 Modbus 基础上加 BACnet 可达 L3/B 级

---

## 数据来源

1. Wilo CIF-Modul Modbus RTU 官方手册 — `cms.media.wilo.com/cdndoc/wilo194406/5021743`
2. Wilo Datapoint List MODBUS — `cms.media.wilo.com/cdndoc/wilo458422/9348600`
3. Wilo Modbus 技术指南 — `wilo.com/oem/en/Support/Technical-Documentation/Modbus/`
4. Grundfos Modbus for Pumps — `api.grundfos.com/literature/Grundfosliterature-6012947.pdf`
5. Grundfos CIM 200 产品页 — `product-selection.grundfos.com/tw/products/cimciu/cimciu-200-modbus-rtu`
6. modbus-serial npm — `npmjs.com/package/modbus-serial`
7. EU SRI 官方 — `energy.ec.europa.eu/topics/energy-efficiency/energy-performance-buildings/smart-readiness-indicator`
8. SRI FAQ — `sri-faq.eu/calculation/`
9. easySRI D3.1 方法论审查 — `easysri.eu/en/Project%20Results%20%20Documents/D3.1%20Review%20of%20the%20SRI%20methodology.pdf`
