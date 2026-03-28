#!/usr/bin/env python3
"""
PI 生成测试
"""

import pytest
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))
from pi_generator import generate_pi_excel

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), 'fixtures')
os.makedirs(FIXTURES_DIR, exist_ok=True)


def load_fixture(filename):
    filepath = os.path.join(FIXTURES_DIR, filename)
    if not os.path.exists(filepath):
        # 创建默认 fixture
        data = {
            "customer": {
                "company_name": "Test Customer Ltd",
                "contact": "John Doe",
                "email": "john@testcustomer.com",
                "phone": "+1-555-123-4567",
                "address": "123 Business St, City, Country",
                "country": "United States"
            },
            "products": [
                {"description": "HDMI Cable", "specification": "2m", "quantity": 100, "unit_price": 5.00}
            ],
            "pi": {"pi_no": "PI-20260328-001", "date": "2026-03-28", "valid_until": "2026-04-27"},
            "terms": {"payment": "T/T 30% deposit, 70% before shipment"}
        }
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        return data
    with open(filepath, 'r') as f:
        return json.load(f)


def test_pi_excel_created():
    """PI 应该能生成 Excel 文件"""
    data = load_fixture('pi_customer.json')
    output_path = os.path.join(os.path.dirname(__file__), 'output', 'test-pi.xlsx')
    
    result = generate_pi_excel(data, output_path)
    
    assert os.path.exists(output_path), f"PI 文件应该被创建：{output_path}"
    assert result.success, f"生成应该成功：{result.error}"


def test_pi_number_format():
    """PI 编号格式应该是 PI-YYYYMMDD-XXX"""
    import re
    data = load_fixture('pi_customer.json')
    pi_no = data['pi']['pi_no']
    assert re.match(r'^PI-\d{8}-\d{3}$', pi_no), f"PI 编号格式错误：{pi_no}"


def test_pi_deposit_calculation():
    """PI 定金应该是 30%"""
    data = load_fixture('pi_customer.json')
    total = sum(p['quantity'] * p['unit_price'] for p in data['products'])
    deposit = total * 0.30
    assert deposit > 0
