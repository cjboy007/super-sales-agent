/**
 * pricing-engine-v2.js
 * 
 * 细粒度成本定价引擎 v2.0
 * 支持详细成本分解（线材/接头/外壳/包装/加工/运输等）
 * 
 * CLI 用法：
 *   node pricing-engine-v2.js quote <SKU> <QTY> <GRADE> [CURRENCY]
 *   node pricing-engine-v2.js cost <SKU>
 *   node pricing-engine-v2.js products
 *   node pricing-engine-v2.js compare <SKU>  # 对比详细成本构成
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================
// 路径配置
// ============================================================

const CONFIG_DIR = path.resolve(__dirname, '../config');
const LOG_DIR = path.resolve(__dirname, '../logs');

const PRODUCTS_COST_FILE_V2 = path.join(CONFIG_DIR, 'products-cost-v2.json');
const DISCOUNT_RULES_FILE = path.join(CONFIG_DIR, 'discount-rules.json');
const MARGIN_RULES_FILE = path.join(CONFIG_DIR, 'margin-rules.json');
const CUSTOMER_OVERRIDES_FILE = path.join(CONFIG_DIR, 'customer-overrides.json');

// ============================================================
// 依赖模块
// ============================================================

const { getRate, convertAmount } = require('./exchange-rate');
const { getCopperPrice, getCopperCostForProduct } = require('./copper-price-adapter');

// ============================================================
// 环境配置
// ============================================================

const LOG_ENABLED = process.env.PRICING_LOG === 'true';
const DRY_RUN = process.env.DRY_RUN === 'true';

// ============================================================
// 工具函数
// ============================================================

function log(msg) {
  if (!LOG_ENABLED) return;
  const line = `[${new Date().toISOString()}] [pricing-engine-v2] ${msg}`;
  console.log(line);
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(
      path.join(LOG_DIR, 'pricing-engine-v2.log'),
      line + '\n'
    );
  } catch (_) {}
}

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function roundTo(num, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

// ============================================================
// 配置加载
// ============================================================

let _configCache = null;

function loadConfig() {
  if (_configCache) return _configCache;

  const productsCost = loadJSON(PRODUCTS_COST_FILE_V2);
  const discountRules = loadJSON(DISCOUNT_RULES_FILE);
  const marginRules = loadJSON(MARGIN_RULES_FILE);
  const customerOverrides = loadJSON(CUSTOMER_OVERRIDES_FILE);

  _configCache = {
    products: productsCost.products || [],
    exchangeRate: productsCost._meta?.exchange_rate || 7.0,
    quantityTiers: discountRules.quantity_tiers || [],
    gradeDiscounts: discountRules.customer_grade_discounts || {},
    combinationRule: discountRules.combination_rule || {},
    specialRules: discountRules.special_rules || [],
    marginRules,
    overrides: customerOverrides.overrides || []
  };

  log(`Config loaded: ${_configCache.products.length} products, exchange rate: ${_configCache.exchangeRate}`);
  return _configCache;
}

function clearConfigCache() {
  _configCache = null;
}

// ============================================================
// 查找产品
// ============================================================

function findProduct(sku) {
  const config = loadConfig();
  const product = config.products.find(
    p => p.sku.toLowerCase() === sku.toLowerCase()
  );
  if (!product) {
    const available = config.products.map(p => p.sku).join(', ');
    throw new Error(`Product not found: ${sku}. Available: ${available}`);
  }
  return product;
}

// ============================================================
// 成本计算 v2（细粒度）
// ============================================================

/**
 * 计算详细成本分解
 * @param {object} product - 产品对象
 * @param {number} length_m - 长度（米），可选，使用产品默认长度
 * @returns {object} 成本分解
 */
function calculateDetailedCost(product, length_m = null) {
  const breakdown = product.cost_breakdown;
  const length = length_m || product.default_length_m;
  
  // 线材成本 = 每米成本 × 长度
  const cable_cost = breakdown.cable_cost_per_m * length;
  
  // 接头成本
  const connector_cost = (breakdown.connector_cost_per_pc || 0) * (breakdown.connector_qty || 2);
  
  // 防尘帽成本
  const dust_cap_cost = (breakdown.dust_cap_cost_per_pc || 0) * (breakdown.dust_cap_qty || 2);
  
  // 外壳成本
  const housing_cost = (breakdown.housing_cost_per_pc || 0) * (breakdown.housing_qty || 2);
  
  // 棉网成本
  const mesh_cost = breakdown.mesh_cost || 0;
  
  // 包装成本
  const packaging = breakdown.packaging || {};
  const packaging_cost = (
    (packaging.box_cost || 0) +
    (packaging.bag_cost || 0) +
    (packaging.label_cost || 0) * (packaging.label_qty || 2) +
    (packaging.premium_label_cost || 0) +
    (packaging.tin_plate_cost || 0) * (packaging.tin_plate_qty || 2)
  );
  
  // 加工费
  const processing_cost = breakdown.processing_cost || 0;
  
  // 包装费
  const packaging_fee = breakdown.packaging_fee || 0;
  
  // 运输费
  const transport_cost = breakdown.transport_cost || 0;
  
  // 权益金
  const royalty_fee = breakdown.royalty_fee || 0;
  
  // 总成本
  const total_cost = (
    cable_cost +
    connector_cost +
    dust_cap_cost +
    housing_cost +
    mesh_cost +
    packaging_cost +
    processing_cost +
    packaging_fee +
    transport_cost +
    royalty_fee
  );
  
  return {
    length_m: length,
    cable_cost: roundTo(cable_cost, 4),
    connector_cost: roundTo(connector_cost, 4),
    dust_cap_cost: roundTo(dust_cap_cost, 4),
    housing_cost: roundTo(housing_cost, 4),
    mesh_cost: roundTo(mesh_cost, 4),
    packaging_cost: roundTo(packaging_cost, 4),
    packaging_breakdown: {
      box: packaging.box_cost || 0,
      bag: packaging.bag_cost || 0,
      label: (packaging.label_cost || 0) * (packaging.label_qty || 2),
      premium_label: packaging.premium_label_cost || 0,
      tin_plate: (packaging.tin_plate_cost || 0) * (packaging.tin_plate_qty || 2)
    },
    processing_cost: roundTo(processing_cost, 4),
    packaging_fee: roundTo(packaging_fee, 4),
    transport_cost: roundTo(transport_cost, 4),
    royalty_fee: roundTo(royalty_fee, 4),
    total_cost_rmb: roundTo(total_cost, 4),
    total_cost_usd: roundTo(total_cost / loadConfig().exchangeRate, 4)
  };
}

// ============================================================
// 折扣计算
// ============================================================

function getQuantityDiscount(quantity) {
  const config = loadConfig();
  const tiers = config.quantityTiers;

  for (let i = tiers.length - 1; i >= 0; i--) {
    const tier = tiers[i];
    if (quantity >= tier.min_qty) {
      return {
        tier: tier.tier,
        label: tier.label,
        discountPct: tier.discount_pct
      };
    }
  }

  return { tier: 'T0', label: 'Below minimum', discountPct: 0 };
}

function getGradeDiscount(grade) {
  const config = loadConfig();
  const g = (grade || 'D').toUpperCase();
  const rule = config.gradeDiscounts[g];

  if (!rule) {
    return { grade: g, label: 'Unknown', discountPct: 0 };
  }

  return {
    grade: g,
    label: rule.label,
    discountPct: rule.discount_pct
  };
}

function calculateCombinedDiscount(quantityDiscountPct, gradeDiscountPct) {
  const config = loadConfig();
  const maxCombined = config.combinationRule.max_combined_discount_pct || 25;

  const combined = 1 - (1 - quantityDiscountPct / 100) * (1 - gradeDiscountPct / 100);
  let combinedPct = roundTo(combined * 100, 2);

  let capped = false;
  if (combinedPct > maxCombined) {
    combinedPct = maxCombined;
    capped = true;
  }

  return {
    combinedDiscountPct: combinedPct,
    capped,
    maxAllowed: maxCombined
  };
}

// ============================================================
// 利润率计算
// ============================================================

function getTargetMargin(category, grade, quantity) {
  const config = loadConfig();
  const mr = config.marginRules;

  const catMargins = mr.category_margins || {};
  const catRule = catMargins[category] || mr.default_margin;
  let targetPct = catRule.target_pct;
  let minPct = catRule.min_acceptable_pct;

  const gradeAdj = (mr.grade_margin_adjustment || {})[grade.toUpperCase()] || 0;
  targetPct += gradeAdj;

  const volAdj = (mr.volume_margin_adjustment || [])
    .filter(v => quantity >= v.min_qty)
    .reduce((max, v) => Math.max(max, v.margin_reduction_pct), 0);
  targetPct -= volAdj;

  targetPct = Math.max(targetPct, 0);

  return {
    targetPct,
    minAcceptablePct: minPct,
    gradeAdjustment: gradeAdj,
    volumeReduction: volAdj
  };
}

// ============================================================
// 底价红线检查
// ============================================================

function checkFloorPrice(unitPrice, costPrice, marginPct, sku) {
  const floorRules = loadConfig().marginRules.floor_price;
  if (!floorRules) return { triggered: false, reason: null, details: {} };

  const checks = [];

  if (floorRules.absolute && floorRules.absolute.enabled) {
    if (unitPrice < costPrice) {
      checks.push({
        type: 'absolute',
        reason: `Unit price $${unitPrice.toFixed(4)} is below cost $${costPrice.toFixed(4)}`
      });
    }
  }

  if (floorRules.percentage && floorRules.percentage.enabled) {
    const minMarginPct = floorRules.percentage.min_margin_pct || 5;
    if (marginPct < minMarginPct) {
      checks.push({
        type: 'percentage',
        reason: `Margin ${marginPct.toFixed(2)}% is below floor ${minMarginPct}%`
      });
    }
  }

  if (checks.length === 0) {
    return { triggered: false, reason: null, details: {} };
  }

  const trigger = floorRules.on_trigger || {};
  return {
    triggered: true,
    reason: checks.map(c => c.reason).join('; '),
    checks,
    action: trigger.action || 'notify_and_hold',
    discordChannel: trigger.discord_channel || 'pricing-alerts',
    requireApproval: trigger.require_approval !== false
  };
}

// ============================================================
// 核心定价 API v2
// ============================================================

/**
 * 计算单个产品报价（细粒度成本）
 * 
 * @param {string} sku - 产品 SKU
 * @param {number} quantity - 数量
 * @param {string} customerGrade - 客户等级 (A/B/C/D)
 * @param {string} currency - 目标货币 (USD/EUR/GBP/CNY)
 * @param {object} [options] - 额外选项
 * @param {string} [options.customerId] - 客户 ID（用于匹配协议价）
 * @param {number} [options.customLength] - 自定义长度（米）
 * 
 * @returns {Promise<object>} 报价结果
 */
async function calculatePrice(sku, quantity, customerGrade, currency, options) {
  if (!sku || typeof sku !== 'string') {
    throw new Error('Invalid SKU: must be a non-empty string');
  }
  if (!quantity || typeof quantity !== 'number' || quantity < 1) {
    throw new Error(`Invalid quantity: ${quantity}. Must be a positive integer.`);
  }
  const grade = (customerGrade || 'D').toUpperCase();
  if (!['A', 'B', 'C', 'D'].includes(grade)) {
    throw new Error(`Invalid customer grade: ${customerGrade}. Must be A/B/C/D.`);
  }
  const cur = (currency || 'USD').toUpperCase();
  const opts = options || {};

  log(`=== calculatePrice(${sku}, qty=${quantity}, grade=${grade}, cur=${cur}) ===`);

  const config = loadConfig();
  const product = findProduct(sku);

  // ---- Step 1: 计算详细成本 ----
  const customLength = opts.customLength || null;
  const costBreakdown = calculateDetailedCost(product, customLength);
  const totalCostRmb = costBreakdown.total_cost_rmb;
  const totalCostUsd = costBreakdown.total_cost_usd;

  log(`Total cost: ¥${totalCostRmb.toFixed(4)} / $${totalCostUsd.toFixed(4)}`);

  // ---- Step 2: 利润率加成 ----
  const marginInfo = getTargetMargin(product.category, grade, quantity);
  const marginMultiplier = 1 / (1 - marginInfo.targetPct / 100);
  const priceBeforeDiscountUsd = totalCostUsd * marginMultiplier;

  log(`Margin: target=${marginInfo.targetPct}%, multiplier=${marginMultiplier.toFixed(4)}`);

  // ---- Step 3: 折扣计算 ----
  const qtyDiscount = getQuantityDiscount(quantity);
  const gradeDiscount = getGradeDiscount(grade);
  const combinedDiscount = calculateCombinedDiscount(
    qtyDiscount.discountPct,
    gradeDiscount.discountPct
  );

  const discountMultiplier = 1 - combinedDiscount.combinedDiscountPct / 100;
  const unitPriceUsd = priceBeforeDiscountUsd * discountMultiplier;

  log(`Discount: qty=${qtyDiscount.discountPct}%, grade=${gradeDiscount.discountPct}%, combined=${combinedDiscount.combinedDiscountPct}%`);

  // ---- Step 4: 币种转换 ----
  let unitPriceLocal = unitPriceUsd;
  let exchangeRate = 1;
  if (cur !== 'USD') {
    exchangeRate = await getRate('USD', cur);
    unitPriceLocal = roundTo(unitPriceUsd * exchangeRate, 4);
  }

  // ---- Step 5: 计算实际利润率 ----
  let totalCostLocal = totalCostUsd;
  if (cur !== 'USD') {
    totalCostLocal = roundTo(totalCostUsd * exchangeRate, 4);
  }
  const actualMarginPct = unitPriceLocal > 0
    ? roundTo(((unitPriceLocal - totalCostLocal) / unitPriceLocal) * 100, 2)
    : 0;

  const totalPrice = roundTo(unitPriceLocal * quantity, 2);

  // ---- Step 6: 底价红线检查 ----
  const floorCheck = checkFloorPrice(unitPriceLocal, totalCostLocal, actualMarginPct, sku);

  // ---- Step 7: 返回结果 ----
  const result = {
    sku: product.sku,
    model: product.model,
    category: product.category,
    description: product.description,
    length_m: customLength || product.default_length_m,
    quantity,
    customerGrade: grade,
    currency: cur,
    unitPrice: roundTo(unitPriceLocal, 4),
    totalPrice,
    marginRate: actualMarginPct,
    floorPriceWarning: floorCheck.triggered ? floorCheck : null,
    costBreakdown: {
      ...costBreakdown,
      margin: {
        targetPct: marginInfo.targetPct,
        actualPct: actualMarginPct,
        minAcceptablePct: marginInfo.minAcceptablePct,
        gradeAdjustment: marginInfo.gradeAdjustment,
        volumeReduction: marginInfo.volumeReduction
      },
      discount: {
        quantityTier: qtyDiscount.tier,
        quantityLabel: qtyDiscount.label,
        quantityDiscountPct: qtyDiscount.discountPct,
        gradeDiscountPct: gradeDiscount.discountPct,
        combinedDiscountPct: combinedDiscount.combinedDiscountPct,
        discountCapped: combinedDiscount.capped
      },
      exchangeRate: roundTo(exchangeRate, 6),
      isDryRun: DRY_RUN
    }
  };

  log(`Result: unitPrice=${result.unitPrice} ${cur}, margin=${actualMarginPct}%`);
  return result;
}

/**
 * 批量计算
 */
async function calculateBatch(items, customerGrade, currency, options) {
  const results = [];
  for (const item of items) {
    try {
      const result = await calculatePrice(
        item.sku,
        item.quantity,
        customerGrade,
        currency,
        { ...options, customLength: item.customLength }
      );
      results.push(result);
    } catch (err) {
      results.push({
        sku: item.sku,
        error: err.message
      });
    }
  }
  return results;
}

/**
 * 获取产品成本详情
 */
function getProductCost(sku, length_m = null) {
  const product = findProduct(sku);
  const breakdown = calculateDetailedCost(product, length_m);
  return {
    sku: product.sku,
    model: product.model,
    category: product.category,
    length_m: breakdown.length_m,
    costBreakdown: breakdown
  };
}

/**
 * 列出所有产品
 */
function listProducts() {
  const config = loadConfig();
  return config.products.map(p => ({
    sku: p.sku,
    model: p.model,
    category: p.category,
    description: p.description,
    length_m: p.default_length_m,
    cost_rmb: p.total_cost_rmb,
    moq: p.moq
  }));
}

// ============================================================
// CLI 接口
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Pricing Engine v2.0 - 细粒度成本计算

用法:
  node pricing-engine-v2.js quote <SKU> <QTY> <GRADE> [CURRENCY]
  node pricing-engine-v2.js cost <SKU> [LENGTH_M]
  node pricing-engine-v2.js products
  node pricing-engine-v2.js compare <SKU>

示例:
  node pricing-engine-v2.js quote HDMI-2.0-Premium-2M 1000 B USD
  node pricing-engine-v2.js cost HDMI-2.0-Premium-2M
  node pricing-engine-v2.js compare HDMI-2.0-Premium-2M
`);
    process.exit(0);
  }

  try {
    if (command === 'quote' && args.length >= 5) {
      const [, sku, qty, grade, currency] = args;
      const result = await calculatePrice(sku, parseInt(qty), grade, currency);
      console.log('\\n=== 报价结果 ===');
      console.log(`产品：    ${result.sku} (${result.model})`);
      console.log(`长度：    ${result.length_m}米`);
      console.log(`数量：    ${result.quantity}`);
      console.log(`客户等级：${result.customerGrade}`);
      console.log(`单价：    ${result.unitPrice} ${result.currency}`);
      console.log(`总价：    ${result.totalPrice} ${result.currency}`);
      console.log(`利润率：  ${result.marginRate}%`);
      console.log('\\n--- 成本分解 ---');
      const cb = result.costBreakdown;
      console.log(`线材：    ¥${cb.cable_cost.toFixed(4)}`);
      console.log(`接头：    ¥${cb.connector_cost.toFixed(4)}`);
      console.log(`外壳：    ¥${cb.housing_cost.toFixed(4)}`);
      console.log(`包装：    ¥${cb.packaging_cost.toFixed(4)}`);
      console.log(`加工费：  ¥${cb.processing_cost.toFixed(4)}`);
      console.log(`运输费：  ¥${cb.transport_cost.toFixed(4)}`);
      console.log(`权益金：  ¥${cb.royalty_fee.toFixed(4)}`);
      console.log(`总成本：  ¥${cb.total_cost_rmb.toFixed(4)} / $${cb.total_cost_usd.toFixed(4)}`);
    } else if (command === 'cost' && args.length >= 2) {
      const [, sku, length] = args;
      const result = getProductCost(sku, length ? parseFloat(length) : null);
      console.log('\\n=== 成本详情 ===');
      console.log(`产品：${result.sku} (${result.model})`);
      console.log(`长度：${result.costBreakdown.length_m}米`);
      console.log('\\n成本分解:');
      console.log(`  线材：      ¥${result.costBreakdown.cable_cost.toFixed(4)}`);
      console.log(`  接头：      ¥${result.costBreakdown.connector_cost.toFixed(4)}`);
      console.log(`  防尘帽：    ¥${result.costBreakdown.dust_cap_cost.toFixed(4)}`);
      console.log(`  外壳：      ¥${result.costBreakdown.housing_cost.toFixed(4)}`);
      console.log(`  棉网：      ¥${result.costBreakdown.mesh_cost.toFixed(4)}`);
      console.log(`  包装：      ¥${result.costBreakdown.packaging_cost.toFixed(4)}`);
      console.log(`    - 彩盒：  ¥${result.costBreakdown.packaging_breakdown.box.toFixed(4)}`);
      console.log(`    - 胶袋：  ¥${result.costBreakdown.packaging_breakdown.bag.toFixed(4)}`);
      console.log(`    - 贴纸：  ¥${result.costBreakdown.packaging_breakdown.label.toFixed(4)}`);
      console.log(`    - Premium 贴纸：¥${result.costBreakdown.packaging_breakdown.premium_label.toFixed(4)}`);
      console.log(`    - 马口铁：¥${result.costBreakdown.packaging_breakdown.tin_plate.toFixed(4)}`);
      console.log(`  加工费：    ¥${result.costBreakdown.processing_cost.toFixed(4)}`);
      console.log(`  包装费：    ¥${result.costBreakdown.packaging_fee.toFixed(4)}`);
      console.log(`  运输费：    ¥${result.costBreakdown.transport_cost.toFixed(4)}`);
      console.log(`  权益金：    ¥${result.costBreakdown.royalty_fee.toFixed(4)}`);
      console.log(`\\n总成本：¥${result.costBreakdown.total_cost_rmb.toFixed(4)} / $${result.costBreakdown.total_cost_usd.toFixed(4)}`);
    } else if (command === 'products') {
      const products = listProducts();
      console.log('\\n=== 可报价产品 ===\\n');
      console.log('SKU                     Model               Category  Length  Cost(RMB)  MOQ');
      console.log('---------------------------------------------------------------------------');
      products.forEach(p => {
        console.log(`${p.sku.padEnd(24)}${p.model.padEnd(18)}${p.category.padEnd(10)}${String(p.length_m).padEnd(8)}${String(p.cost_rmb).padEnd(11)}${p.moq}`);
      });
    } else if (command === 'compare' && args.length >= 2) {
      const [, sku] = args;
      const product = findProduct(sku);
      console.log('\\n=== 成本对比分析 ===\\n');
      console.log(`产品：${product.sku} (${product.model})`);
      console.log(`规格：${product.specification}`);
      console.log(`\\n成本结构:`);
      const cb = product.cost_breakdown;
      const total = product.total_cost_rmb;
      console.log(`  线材：      ¥${(cb.cable_cost_per_m * product.default_length_m).toFixed(2)} (${((cb.cable_cost_per_m * product.default_length_m) / total * 100).toFixed(1)}%)`);
      console.log(`  接头：      ¥${(cb.connector_cost_per_pc * cb.connector_qty).toFixed(2)} (${((cb.connector_cost_per_pc * cb.connector_qty) / total * 100).toFixed(1)}%)`);
      console.log(`  外壳：      ¥${(cb.housing_cost_per_pc * cb.housing_qty).toFixed(2)} (${((cb.housing_cost_per_pc * cb.housing_qty) / total * 100).toFixed(1)}%)`);
      console.log(`  包装：      ¥${(cb.packaging.box_cost + cb.packaging.bag_cost + cb.packaging.label_cost * cb.packaging.label_qty + cb.packaging.premium_label_cost + cb.packaging.tin_plate_cost * cb.packaging.tin_plate_qty).toFixed(2)} (${((cb.packaging.box_cost + cb.packaging.bag_cost + cb.packaging.label_cost * cb.packaging.label_qty + cb.packaging.premium_label_cost + cb.packaging.tin_plate_cost * cb.packaging.tin_plate_qty) / total * 100).toFixed(1)}%)`);
      console.log(`  加工费：    ¥${cb.processing_cost.toFixed(2)} (${(cb.processing_cost / total * 100).toFixed(1)}%)`);
      console.log(`  运输费：    ¥${cb.transport_cost.toFixed(2)} (${(cb.transport_cost / total * 100).toFixed(1)}%)`);
      console.log(`  权益金：    ¥${cb.royalty_fee.toFixed(2)} (${(cb.royalty_fee / total * 100).toFixed(1)}%)`);
      console.log(`\\n总成本：¥${total.toFixed(2)}`);
    } else {
      console.log('Invalid command or arguments. Use "node pricing-engine-v2.js" for help.');
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// ============================================================
// 导出 API
// ============================================================

module.exports = {
  calculatePrice,
  calculateBatch,
  getProductCost,
  listProducts,
  calculateDetailedCost,
  clearConfigCache
};

// CLI 入口
if (require.main === module) {
  main();
}
