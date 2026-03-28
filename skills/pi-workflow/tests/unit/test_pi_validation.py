#!/usr/bin/env python3
"""
PI (形式发票) 数据验证测试
"""

import pytest
import json
import os
import sys

# 添加路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), 'fixtures')
os.makedirs(FIXTURES_DIR, exist_ok=True)


def create_test_fixture():
    """创建测试数据"""
    return {
        "customer": {
            "company_name": "Global Trading Co Ltd",
            "contact": "Sarah Johnson",
            "email": "sarah@globaltrading.com",
            "phone": "+44-20-1234-5678",
            "address": "45 Commerce Street, London, EC1V 9HB, UK",
            "country": "United Kingdom"
        },
        "products": [
            {
                "description": "HDMI 2.1 Cable",
                "specification": "8K@60Hz, 2m",
                "quantity": 1000,
                "unit_price": 7.50
            }
        ],
        "pi": {
            "pi_no": "PI-20260328-001",
            "date": "2026-03-28",
            "valid_until": "2026-04-27"
        },
        "terms": {
            "payment": "T/T 30% deposit, 70% before shipment",
            "packaging": "Standard export packaging"
        }
    }


class TestPIValidation:
    """PI 数据验证测试"""
    
    def test_valid_pi_data(self):
        """验证有效 PI 数据"""
        data = create_test_fixture()
        
        assert data['customer']['company_name']
        assert len(data['products']) > 0
        assert data['pi']['pi_no'].startswith('PI-')
    
    def test_pi_number_format(self):
        """PI 编号格式应该是 PI-YYYYMMDD-XXX"""
        import re
        data = create_test_fixture()
        
        pattern = r'^PI-\d{8}-\d{3}$'
        assert re.match(pattern, data['pi']['pi_no'])
    
    def test_payment_terms_present(self):
        """验证付款条款存在"""
        data = create_test_fixture()
        
        assert 'terms' in data
        assert 'payment' in data['terms']
    
    def test_deposit_calculation(self):
        """验证定金计算"""
        data = create_test_fixture()
        
        total = sum(p['quantity'] * p['unit_price'] for p in data['products'])
        deposit = total * 0.30
        
        assert deposit > 0
        assert deposit < total
    
    def test_valid_until_date(self):
        """验证有效期"""
        from datetime import datetime
        data = create_test_fixture()
        
        valid_until = datetime.strptime(data['pi']['valid_until'], '%Y-%m-%d')
        pi_date = datetime.strptime(data['pi']['date'], '%Y-%m-%d')
        
        # 有效期应该是 30 天
        delta = valid_until - pi_date
        assert delta.days == 30


class TestPIDataValidation:
    """PI 数据完整性测试"""
    
    def test_customer_info_complete(self):
        """验证客户信息完整"""
        data = create_test_fixture()
        
        required = ['company_name', 'contact', 'email', 'address', 'country']
        for field in required:
            assert field in data['customer']
    
    def test_product_pricing(self):
        """验证产品定价"""
        data = create_test_fixture()
        
        for product in data['products']:
            assert product['unit_price'] > 0
            assert product['quantity'] > 0
    
    def test_total_calculation(self):
        """验证总额计算"""
        data = create_test_fixture()
        
        total = sum(p['quantity'] * p['unit_price'] for p in data['products'])
        assert total == 1000 * 7.50
        assert total == 7500.00


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
