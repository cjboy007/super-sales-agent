#!/usr/bin/env python3
"""
收款通知数据验证测试
"""

import pytest
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), 'fixtures')
os.makedirs(FIXTURES_DIR, exist_ok=True)


def create_payment_notice_fixture():
    """创建收款通知测试数据"""
    return {
        "customer": {
            "company_name": "European Electronics GmbH",
            "contact": "Hans Mueller",
            "email": "hans@euroelectronics.de",
            "phone": "+49-30-1234-5678",
            "address": "Unter den Linden 77, 10117 Berlin, Germany",
            "country": "Germany"
        },
        "notice": {
            "notice_no": "PN-20260328-001",
            "date": "2026-03-28",
            "due_date": "2026-04-10"
        },
        "reference": {
            "pi_no": "PI-20260315-001",
            "pi_date": "2026-03-15"
        },
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


class TestPaymentNoticeValidation:
    """收款通知验证测试"""
    
    def test_valid_payment_notice(self):
        """验证有效收款通知"""
        data = create_payment_notice_fixture()
        
        assert data['customer']['company_name']
        assert data['notice']['notice_no'].startswith('PN-')
        assert data['payment']['total_amount'] > 0
    
    def test_notice_number_format(self):
        """编号格式应该是 PN-YYYYMMDD-XXX"""
        import re
        data = create_payment_notice_fixture()
        
        pattern = r'^PN-\d{8}-\d{3}$'
        assert re.match(pattern, data['notice']['notice_no'])
    
    def test_due_date_valid(self):
        """验证付款截止日期"""
        from datetime import datetime
        data = create_payment_notice_fixture()
        
        due_date = datetime.strptime(data['notice']['due_date'], '%Y-%m-%d')
        notice_date = datetime.strptime(data['notice']['date'], '%Y-%m-%d')
        
        # 截止日期应该在通知日期之后
        assert due_date > notice_date
        
        # 通常 10-15 天付款期
        delta = due_date - notice_date
        assert 10 <= delta.days <= 15
    
    def test_pi_reference_present(self):
        """验证 PI 引用存在"""
        data = create_payment_notice_fixture()
        
        assert 'reference' in data
        assert 'pi_no' in data['reference']
    
    def test_bank_info_complete(self):
        """验证银行信息完整"""
        data = create_payment_notice_fixture()
        
        required = ['beneficiary', 'bank_name', 'account_no', 'swift_code']
        for field in required:
            assert field in data['bank']


class TestPaymentCalculation:
    """付款计算测试"""
    
    def test_deposit_percentage(self):
        """验证定金比例"""
        data = create_payment_notice_fixture()
        
        total = data['payment']['total_amount']
        deposit = data['payment']['deposit_amount']
        
        # 定金应该是 30%
        expected_deposit = total * 0.30
        assert deposit == expected_deposit
    
    def test_balance_calculation(self):
        """验证余款计算"""
        data = create_payment_notice_fixture()
        
        total = data['payment']['total_amount']
        deposit = data['payment']['deposit_amount']
        balance = data['payment']['balance_due']
        
        assert balance == total - deposit
    
    def test_total_equals_deposit_plus_balance(self):
        """验证总额=定金 + 余款"""
        data = create_payment_notice_fixture()
        
        total = data['payment']['total_amount']
        deposit = data['payment']['deposit_amount']
        balance = data['payment']['balance_due']
        
        assert total == deposit + balance


class TestCurrencyValidation:
    """货币验证测试"""
    
    def test_currency_code_valid(self):
        """验证货币代码"""
        data = create_payment_notice_fixture()
        
        valid_currencies = ['USD', 'EUR', 'GBP', 'CNY', 'HKD']
        assert data['payment']['currency'] in valid_currencies
    
    def test_amount_format(self):
        """验证金额格式"""
        data = create_payment_notice_fixture()
        
        # 金额应该是数字且保留 2 位小数
        total = data['payment']['total_amount']
        assert isinstance(total, (int, float))
        assert total > 0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
