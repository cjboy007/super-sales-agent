#!/usr/bin/env node
/**
 * 批量翻译 research JSON 的 outreach_notes 为英文。
 * 添加 outreach_notes_en 字段，保留原始中文 outreach_notes。
 *
 * 用法: node update-research-english.js
 */

"use strict";

const fs = require("fs");
const path = require("path");

const RESEARCH_DIR = path.join(__dirname, "..", "research", "companies");

// 手动翻译映射表（基于对每家公司调研笔记的理解）
const TRANSLATIONS = {
  "Protherm": "Daikin subsidiary manufacturing wall-hung boilers and heat pumps, sourcing circulating pump components",
  "Defro": "Polish boiler and heat pump manufacturer requiring circulating pump components for production",
  "Defro Poland": "Polish boiler and heat pump manufacturer requiring circulating pump components for production",
  "BDR Thermea Hungary": "One of Europe's largest HVAC groups. Oscar Mogro leads solar/heat pump R&D — potential pump technology partnership",
  "Centrometal": "Croatian boiler manufacturer. Sven is the purchasing manager and direct decision-maker",
  "Thermona": "Czech boiler manufacturer needing circulating pump supply for boiler system integration",
  "Hewalex": "Polish solar thermal and heat pump manufacturer, a Tier 1 target for circulating pump supply",
  "Galmet": "Polish heating equipment manufacturer, a Tier 1 target for circulating pump supply",
  "Kospel S.A.": "Polish water heater manufacturer, a Tier 1 target for circulating pump supply",
  "HAKOM": "Polish HVAC distributor, a Tier 1 target for circulating pump supply",
  "Airco HVACR": "Polish HVACR wholesaler and Samsung heat pump distributor in Poland. Owner has purchasing decision power",
  "Ariston Romania": "Italian water heater and HVAC manufacturer with Romanian operations",
  "Armatec": "Pump and valve distributor, likely direct purchaser of circulating pumps",
  "Armatec Sweden": "Pump and valve distributor, likely direct purchaser of circulating pumps",
  "Uponor Eastern Europe": "Nordic piping and HVAC systems leader. Tim directly manages HVAC category procurement — best entry point",
  "Vaillant Slovakia": "German HVAC giant with factory in Skalica. Stanislav is the purchasing manager and direct decision-maker",
  "Viessmann Bulgaria": "German HVAC giant (acquired by Carrier). Alexandru is the country manager and top local decision-maker",
  "Viessmann Czech": "German HVAC giant, a Tier 1 target for circulating pump supply in the Czech market",
  "Stiebel Eltron Slovakia": "German heat pump and water heater manufacturer with Slovak factory. Ondrej is a process engineer — entry point: pump component integration for heat pump production line",
  "Ferroli Romania": "Group-level technical purchasing manager (~€150M category spend), direct decision-maker",
  "Bosch Thermotechnology": "Bosch HVAC division, global enterprise. Generic inbox — request forwarding to procurement team",
  "NIBE Baltic": "One of Europe's largest heat pump manufacturers. CEO-level decision-maker. Note: NIBE self-produces pumps, so watch competitor relationship",
  "Xylem/Lowara": "⚠️ Xylem/Lowara is a pump manufacturer itself, not a distributor. This is a direct competitor, not a sales target. Consider as supplier relationship only",
  "Purmo Group": "Radiator manufacturer whose heat pump systems require circulating pump components",
  "Onninen": "Large Finnish HVAC wholesaler with significant purchasing volume. Need to find specific procurement contact",
  "Onninen Nordic": "Large Finnish HVAC wholesaler with significant purchasing volume. Need to find specific procurement contact",
  "Bravida": "Large Nordic installation company requiring circulating pumps for project deployment",
  "Bravida Nordic": "Large Nordic installation company requiring circulating pumps for project deployment",
  "GC-Gruppe": "Major German HVAC distributor with large purchasing volume. Need to find specific procurement contact",
  "HAJDU RT": "Hungarian water heater manufacturer, a Tier 1 target for circulating pump supply",
  "Danfoss Hungary": "Danfoss Hungary operations, a Tier 1 target for pump component supply",
  "Dedeman": "Romanian home improvement retailer, a Tier 1 target. Need procurement contact",
  "Enbra Group": "Czech HVAC group, a Tier 1 target for circulating pump supply",
  "Instalco": "Swedish HVAC installation group, a Tier 1 Nordic target for circulating pump supply",
  "Romstal": "Romanian HVAC distributor, a Tier 1 target for circulating pump supply",
  "ABK-Qviller": "Norwegian HVAC distributor, a Tier 1 Nordic target for circulating pump supply",
  "Ahlsell Group": "Swedish HVAC distributor, a Tier 1 Nordic target for circulating pump supply",
  "Brødrene Dahl": "Nordic HVAC distributor, a Tier 1 Nordic target for circulating pump supply",
  "Caleffi": "Italian HVAC valve manufacturer, a Tier 1 EU target for circulating pump supply",
  "Daikin Central Europe": "Global HVAC leader's central European operations, a Tier 1 target for circulating pump supply",
  "Klima-Venta": "Polish HVAC distributor, a Tier 2 potential customer for circulating pump and valve supply",
  "Klimor": "Polish HVAC company, a Tier 2 potential customer for circulating pump and valve supply",
  "Panasonic CZ": "Panasonic Czech operations, a Tier 2 potential customer for circulating pump and valve supply through sales or product team",
  "Plum HVAC": "Polish HVAC company, a Tier 2 potential customer for circulating pump and valve supply",
  "Termet": "Polish heating equipment manufacturer, a Tier 2 potential customer for circulating pump supply",
  "Buderus Czech": "Bosch-owned HVAC brand in Czech Republic. Petr is in sales — can ask for procurement referral",
  "Belimo": "Swiss HVAC valve and actuator manufacturer",
};

// 通用模板（当没有特定翻译时）
const GENERIC_TEMPLATES = {
  "HVAC": "{country} HVAC company, potential circulating pump customer",
  "boiler": "{country} boiler manufacturer, requires circulating pump components",
  "heat pump": "{country} heat pump company, potential circulating pump customer",
  "distributor": "{country} HVAC distributor, potential circulating pump buyer",
  "wholesaler": "{country} HVAC wholesaler with purchasing volume",
};

function getGenericFact(country, industry, tier) {
  if (!country) return null;
  const c = country.replace("区域", "European");
  if (tier?.includes("Tier1")) {
    return `Major ${c} HVAC industry player, potential circulating pump customer`;
  }
  if (industry?.toLowerCase().includes("boiler")) {
    return `${c} boiler manufacturer, requires circulating pump components`;
  }
  if (industry?.toLowerCase().includes("heat")) {
    return `${c} heat pump company, potential circulating pump customer`;
  }
  if (industry?.toLowerCase().includes("distribut")) {
    return `${c} HVAC distributor, potential circulating pump buyer`;
  }
  return `${c} HVAC company, potential circulating pump customer`;
}

let updated = 0;

for (const file of fs.readdirSync(RESEARCH_DIR).filter(f => f.endsWith(".json"))) {
  const filePath = path.join(RESEARCH_DIR, file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (!data.company) continue;

  // 优先用手动翻译
  const translation = TRANSLATIONS[data.company];
  if (translation) {
    data.outreach_notes_en = translation;
    updated++;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    console.log(`✅ ${data.company}: "${translation}"`);
    continue;
  }

  // 否则用通用模板
  const generic = getGenericFact(data.country, data.industry, data.tier);
  if (generic) {
    data.outreach_notes_en = generic;
    updated++;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    console.log(`📝 ${data.company} (generic): "${generic}"`);
  }
}

console.log(`\n✅ Updated ${updated} research files with English outreach_notes_en`);
