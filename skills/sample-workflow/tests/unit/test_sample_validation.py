#!/usr/bin/env python3
"""
样品单数据验证测试
"""

import pytest
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), 'fixtures')
os.makedirs(FIXTURES_DIR, exist_ok=True)


def create_sample_fixture():
    """创建样品单测试数据"""
    return {
        "customer": {
            "company_name": "Tech Innovations Inc",
            "contact": "Mike Chen",
            "email": "mike@techinnovations.com",
            "phone": "+1-408-555-1234",
            "address": "1234 Innovation Drive, San Jose, CA 95134, USA",
            "country": "United States"
        },
        "products": [
            {
                "description": "HDMI 2.1 Cable Sample",
                "specification": "8K@60Hz, 1m, Black",
                "quantity": 5,
                "unit_price": 0.00
            }
        ],
        "sample": {
            "sample_no": "SPL-20260328-001",
            "date": "2026-03-28",
            "purpose": "Testing and Evaluation"
        },
        "shipping_address": {
            "company_name": "Tech Innovations Inc",
            "contact": "Mike Chen",
            "address": "1234 Innovation Drive, San Jose, CA 95134, USA"
        },
        "shipping": {
            "method": "DHL",
            "freight_collect": True
        }
    }


class TestSampleValidation:
    """样品单验证测试"""
    
    def test_valid_sample_data(self):
        """验证有效样品单数据"""
        data = create_sample_fixture()
        
        assert data['customer']['company_name']
        assert len(data['products']) > 0
        assert data['sample']['sample_no'].startswith('SPL-')
    
    def test_sample_number_format(self):
        """样品单编号格式应该是 SPL-YYYYMMDD-XXX"""
        import re
        data = create_sample_fixture()
        
        pattern = r'^SPL-\d{8}-\d{3}$'
        assert re.match(pattern, data['sample']['sample_no'])
    
    def test_sample_purpose(self):
        """验证样品用途"""
        data = create_sample_fixture()
        
        assert 'purpose' in data['sample']
        assert data['sample']['purpose'] in ['Testing and Evaluation', 'Quality Check', 'Customer Review']
    
    def test_shipping_info_present(self):
        """验证物流信息存在"""
        data = create_sample_fixture()
        
        assert 'shipping' in data
        assert 'method' in data['shipping']
    
    def test_freight_collect(self):
        """验证运费到付"""
        data = create_sample_fixture()
        
        assert 'freight_collect' in data['shipping']
        assert data['shipping']['freight_collect'] == True


class TestSampleDataValidation:
    """样品单数据完整性测试"""
    
    def test_shipping_address_complete(self):
        """验证收货地址完整"""
        data = create_sample_fixture()
        
        required = ['company_name', 'contact', 'address']
        for field in required:
            assert field in data['shipping_address']
    
    def test_sample_quantity_reasonable(self):
        """验证样品数量合理"""
        data = create_sample_fixture()
        
        for product in data['products']:
            # 样品数量通常较少
            assert product['quantity'] <= 10
    
    def test_sample_price_zero(self):
        """验证样品通常免费"""
        data = create_sample_fixture()
        
        for product in data['products']:
            # 样品通常免费
            assert product['unit_price'] == 0.00


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
