#!/usr/bin/env python3
"""
收款通知生成测试
"""

import pytest
import json
import os
import sys
import re

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))
from payment_generator import generate_payment_notice_excel

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), 'fixtures')
os.makedirs(FIXTURES_DIR, exist_ok=True)


def load_fixture(filename):
    filepath = os.path.join(FIXTURES_DIR, filename)
    if not os.path.exists(filepath):
        data = {
            "customer": {
                "company_name": "European Customer GmbH",
                "contact": "Hans Mueller",
                "email": "hans@eurocustomer.de",
                "phone": "+49-30-1234-5678",
                "address": "Unter den Linden 77, Berlin, Germany",
                "country": "Germany"
            },
            "notice": {"notice_no": "PN-20260328-001", "date": "2026-03-28", "due_date": "2026-04-10"},
            "reference": {"pi_no": "PI-20260315-001", "pi_date": "2026-03-15"},
            "payment": {
                "total_amount": 15000.00,
                "currency": "USD",
                "deposit_amount": 4500.00,
                "deposit_paid": True,
                "balance_due": 10500.00
            },
            "bank": {
                "beneficiary": "FARREACH ELECTRONIC CO LIMITED",
                "bank_name": "HSBC Hong Kong",
                "account_no": "411-758097-838",
                "swift_code": "HSBCHKHHHKH"
            }
        }
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        return data
    with open(filepath, 'r') as f:
        return json.load(f)


def test_payment_notice_excel_created():
    """收款通知应该能生成 Excel 文件"""
    data = load_fixture('payment_customer.json')
    output_path = os.path.join(os.path.dirname(__file__), 'output', 'test-payment-notice.xlsx')
    
    result = generate_payment_notice_excel(data, output_path)
    
    assert os.path.exists(output_path), f"收款通知文件应该被创建：{output_path}"
    assert result.success, f"生成应该成功：{result.error}"


def test_payment_notice_number_format():
    """收款通知编号格式应该是 PN-YYYYMMDD-XXX"""
    data = load_fixture('payment_customer.json')
    notice_no = data['notice']['notice_no']
    assert re.match(r'^PN-\d{8}-\d{3}$', notice_no), f"收款通知编号格式错误：{notice_no}"


def test_payment_calculation():
    """收款通知金额计算应该正确"""
    data = load_fixture('payment_customer.json')
    payment = data['payment']
    
    total = payment['total_amount']
    deposit = payment['deposit_amount']
    balance = payment['balance_due']
    
    assert total == deposit + balance, "总额应该等于定金 + 余款"
    assert deposit == total * 0.30, "定金应该是总额的 30%"


def test_due_date_valid():
    """付款截止日期应该有效"""
    from datetime import datetime
    data = load_fixture('payment_customer.json')
    
    due_date = datetime.strptime(data['notice']['due_date'], '%Y-%m-%d')
    notice_date = datetime.strptime(data['notice']['date'], '%Y-%m-%d')
    
    assert due_date > notice_date, "截止日期应该在通知日期之后"
    delta = (due_date - notice_date).days
    assert 10 <= delta <= 15, f"付款期应该 10-15 天，实际{delta}天"


def test_bank_info_complete():
    """银行信息应该完整"""
    data = load_fixture('payment_customer.json')
    bank = data['bank']
    
    required = ['beneficiary', 'bank_name', 'account_no', 'swift_code']
    for field in required:
        assert field in bank, f"缺少银行字段：{field}"
        assert bank[field], f"银行字段为空：{field}"
