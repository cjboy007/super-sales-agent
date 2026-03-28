#!/usr/bin/env python3
"""
报价单数据验证测试
测试数据验证逻辑，确保防止示例数据、测试数据进入生产环境
"""

import pytest
import json
import os
import sys

# 添加路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# 导入被测代码
from validators import validate_quotation, QuotationValidator, ValidationResult

# 测试数据目录
FIXTURES_DIR = os.path.join(os.path.dirname(__file__), '..', 'fixtures')


def load_fixture(filename):
    """加载测试数据"""
    filepath = os.path.join(FIXTURES_DIR, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


class TestDataValidation:
    """数据验证测试类"""
    
    def test_valid_customer_data_should_pass(self):
        """TC-VALIDATE-001: 有效客户数据应该通过验证"""
        data = load_fixture('valid_customer.json')
        
        # 调用实际验证代码
        result = validate_quotation(data)
        
        # 验证应该通过
        assert result.is_valid, f"有效数据应该通过验证，但失败：{result.error_messages()}"
        assert len(result.errors) == 0
    
    def test_example_company_name_should_fail(self):
        """TC-VALIDATE-002: 客户名称含"Example"应该验证失败"""
        data = load_fixture('invalid_example_customer.json')
        
        # 调用实际验证代码
        result = validate_quotation(data)
        
        # 验证应该失败
        assert result.has_error(), "示例公司名称应该验证失败"
        assert any('示例关键词' in e.message or 'example' in e.message.lower() for e in result.errors)
    
    def test_test_email_domain_should_fail(self):
        """TC-VALIDATE-003: 邮箱@example.com 应该验证失败"""
        data = load_fixture('invalid_example_customer.json')
        
        # 调用实际验证代码
        result = validate_quotation(data)
        
        # 验证应该失败
        assert result.has_error(), "测试邮箱应该验证失败"
        assert any('邮箱' in e.message or 'email' in e.message.lower() for e in result.errors)
    
    def test_placeholder_address_should_fail(self):
        """TC-VALIDATE-004: 地址含占位符应该验证失败"""
        # 创建包含占位符地址的数据
        data = load_fixture('valid_customer.json')
        data['customer']['address'] = '123 Test Street, Example City'
        
        # 调用实际验证代码
        result = validate_quotation(data)
        
        # 验证应该失败
        assert result.has_error(), "占位符地址应该验证失败"
        assert any('地址' in e.message or 'address' in e.message.lower() for e in result.errors)
    
    def test_empty_products_should_fail(self):
        """TC-VALIDATE-005: 产品列表为空应该验证失败"""
        data = load_fixture('empty_products.json')
        
        # 调用实际验证代码
        result = validate_quotation(data)
        
        # 验证应该失败
        assert result.has_error(), "空产品列表应该验证失败"
        assert any('产品' in e.message or 'product' in e.message.lower() or '为空' in e.message for e in result.errors)
    
    def test_invalid_product_price_should_fail(self):
        """TC-VALIDATE-006: 产品价格<=0 应该验证失败"""
        # 创建包含无效价格的数据
        data = load_fixture('valid_customer.json')
        data['products'][0]['unit_price'] = 0
        data['products'][1]['quantity'] = -5
        
        # 调用实际验证代码
        result = validate_quotation(data)
        
        # 验证应该失败
        assert result.has_error(), "无效价格应该验证失败"
        assert any('价格' in e.message or '单价' in e.message or 'price' in e.message.lower() for e in result.errors)
    
    def test_quotation_number_format(self):
        """TC-VALIDATE-007: 编号格式应该是 QT-YYYYMMDD-XXX"""
        # 测试有效编号
        data = load_fixture('valid_customer.json')
        result = validate_quotation(data)
        assert result.is_valid, f"有效编号应该通过：{result.error_messages()}"
        
        # 测试无效编号
        data['quotation']['quotation_no'] = 'QT-2026-001'  # 格式错误
        result = validate_quotation(data)
        assert result.has_error(), "无效编号格式应该验证失败"
        assert any('编号' in e.message or '格式' in e.message for e in result.errors)


class TestBankConfigValidation:
    """银行账户配置验证测试"""
    
    def test_bank_config_exists(self):
        """验证银行账户配置文件存在"""
        # 项目根目录的 config
        config_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))),
            'config',
            'bank-accounts.json'
        )
        
        assert os.path.exists(config_path), f"银行账户配置文件不存在：{config_path}"
    
    def test_bank_config_has_required_fields(self):
        """验证银行账户配置有必需字段"""
        # 项目根目录的 config
        config_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))),
            'config',
            'bank-accounts.json'
        )
        
        if not os.path.exists(config_path):
            pytest.skip("配置文件不存在，跳过测试")
        
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        required_fields = ['beneficiary', 'bank_name', 'account_no', 'swift_code']
        
        if 'primary' in config:
            bank = config['primary']
        else:
            bank = config
        
        for field in required_fields:
            assert field in bank, f"银行账户配置缺少必需字段：{field}"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
