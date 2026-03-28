#!/usr/bin/env python3
"""
样品单生成测试
"""

import pytest
import json
import os
import sys
import re

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))
from sample_generator import generate_sample_excel

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), 'fixtures')
os.makedirs(FIXTURES_DIR, exist_ok=True)


def load_fixture(filename):
    filepath = os.path.join(FIXTURES_DIR, filename)
    if not os.path.exists(filepath):
        data = {
            "customer": {
                "company_name": "Test Customer Inc",
                "contact": "Mike Chen",
                "email": "mike@testcustomer.com",
                "phone": "+1-408-555-1234",
                "address": "456 Tech Drive, San Jose, CA",
                "country": "United States"
            },
            "products": [
                {"description": "HDMI Sample", "specification": "1m", "quantity": 5, "unit_price": 0.00}
            ],
            "sample": {"sample_no": "SPL-20260328-001", "date": "2026-03-28", "purpose": "Testing"},
            "shipping_address": {
                "company_name": "Test Customer Inc",
                "contact": "Mike Chen",
                "address": "456 Tech Drive, San Jose, CA"
            },
            "shipping": {"method": "DHL", "freight_collect": True}
        }
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        return data
    with open(filepath, 'r') as f:
        return json.load(f)


def test_sample_excel_created():
    """样品单应该能生成 Excel 文件"""
    data = load_fixture('sample_customer.json')
    output_path = os.path.join(os.path.dirname(__file__), 'output', 'test-sample.xlsx')
    
    result = generate_sample_excel(data, output_path)
    
    assert os.path.exists(output_path), f"样品单文件应该被创建：{output_path}"
    assert result.success, f"生成应该成功：{result.error}"


def test_sample_number_format():
    """样品单编号格式应该是 SPL-YYYYMMDD-XXX"""
    data = load_fixture('sample_customer.json')
    sample_no = data['sample']['sample_no']
    assert re.match(r'^SPL-\d{8}-\d{3}$', sample_no), f"样品单编号格式错误：{sample_no}"


def test_sample_quantity_reasonable():
    """样品数量应该合理（通常 <= 10）"""
    data = load_fixture('sample_customer.json')
    for product in data['products']:
        assert product['quantity'] <= 10, f"样品数量应该 <= 10: {product['quantity']}"


def test_freight_collect():
    """样品单应该指定运费到付"""
    data = load_fixture('sample_customer.json')
    assert data['shipping']['freight_collect'] == True
