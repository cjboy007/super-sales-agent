#!/usr/bin/env python3
"""
从 OKKI 获取客户数据

使用方式：
python3 scripts/fetch-okki-customer.py <customer_id> <output_file>

示例：
python3 scripts/fetch-okki-customer.py 16064 data/customer_16064.json
"""

import sys
import json
import os
from pathlib import Path

# 导入 OKKI 客户端（使用现有集成）
OKKI_CLIENT_PATHS = [
    Path(__file__).parent.parent.parent.parent / 'xiaoman-okki' / 'api',
    Path(__file__).parent.parent / 'skills' / 'okki-lead-scoring' / 'scripts',
]

OKKI_AVAILABLE = False
for client_path in OKKI_CLIENT_PATHS:
    if client_path.exists():
        sys.path.insert(0, str(client_path))
        try:
            from okki_client import OKKIClient
            OKKI_AVAILABLE = True
            print(f"✅ OKKI 客户端已加载：{client_path}")
            break
        except ImportError:
            continue

if not OKKI_AVAILABLE:
    print("⚠️  警告：OKKI 客户端不可用")
    print("请检查以下路径：")
    for p in OKKI_CLIENT_PATHS:
        print(f"  - {p}")

def fetch_customer_data(customer_id):
    """从 OKKI 获取客户数据"""
    
    if not OKKI_AVAILABLE:
        print("❌ 错误：OKKI 客户端不可用")
        print("请检查：")
        print("  1. xiaoman-okki/api/okki_client.py 是否存在")
        print("  2. OKKI API 凭证是否已配置")
        return None
    
    try:
        # 初始化客户端
        client = OKKIClient()
        
        # 获取客户详情
        print(f"📋 从 OKKI 获取客户数据 (ID: {customer_id})...")
        customer = client.get_company(customer_id)
        
        if not customer:
            print(f"❌ 错误：未找到客户 ID {customer_id}")
            return None
        
        # 转换为标准格式
        data = {
            "_comment": f"从 OKKI 自动获取 - 客户 ID: {customer_id}",
            "_source": "okki",
            "_okki_customer_id": customer_id,
            "customer": {
                "company_name": customer.get('name', ''),
                "contact": customer.get('owner_name', ''),
                "email": customer.get('email', ''),
                "phone": customer.get('tel', ''),
                "address": customer.get('address', ''),
                "country": customer.get('country', ''),
                "okki_customer_id": customer_id
            },
            "products": [],
            "bank_info": {
                "_comment": "银行账户信息从 config/bank-accounts.json 自动加载，无需填写"
            }
        }
        
        print(f"✅ 成功获取客户：{data['customer']['company_name']}")
        return data
        
    except Exception as e:
        print(f"❌ 错误：无法从 OKKI 获取客户数据")
        print(f"错误信息：{e}")
        return None

def main():
    if len(sys.argv) < 3:
        print("❌ 错误：缺少参数")
        print("用法：python3 fetch-okki-customer.py <customer_id> <output_file>")
        print()
        print("示例：")
        print("  python3 fetch-okki-customer.py 16064 data/customer_16064.json")
        sys.exit(1)
    
    customer_id = sys.argv[1]
    output_file = sys.argv[2]
    
    # 获取客户数据
    data = fetch_customer_data(customer_id)
    
    if not data:
        sys.exit(1)
    
    # 保存文件
    try:
        # 确保输出目录存在
        output_path = Path(output_file)
        if not output_path.is_absolute():
            output_path = Path(__file__).parent.parent / output_path
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"✅ 客户数据已保存：{output_path}")
        print()
        print("下一步:")
        print(f"  node scripts/generate-document.js --type pi --data {output_file} --output PI-{customer_id}")
        
    except Exception as e:
        print(f"❌ 错误：无法保存文件")
        print(f"错误信息：{e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
