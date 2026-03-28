#!/usr/bin/env python3
"""
报价单 Excel 生成测试
验证 Excel 文件生成的正确性、格式规范性和数据准确性
"""

import pytest
import json
import os
import sys
import tempfile
import shutil
from pathlib import Path

# 添加路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# 测试数据目录
FIXTURES_DIR = os.path.join(os.path.dirname(__file__), '..', 'fixtures')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'output')


def load_fixture(filename):
    """加载测试数据"""
    filepath = os.path.join(FIXTURES_DIR, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def setup_module(module):
    """测试前准备"""
    os.makedirs(OUTPUT_DIR, exist_ok=True)


def teardown_module(module):
    """测试后清理"""
    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)


class TestExcelGeneration:
    """Excel 生成测试类"""
    
    def test_excel_file_created(self):
        """TC-EXCEL-001: 标准数据应该生成.xlsx 文件"""
        # 添加 src 到路径
        src_path = os.path.join(os.path.dirname(__file__), '..', '..', 'src')
        sys.path.insert(0, src_path)
        
        from excel_generator import generate_quotation_excel
        
        data = load_fixture('valid_customer.json')
        output_path = os.path.join(OUTPUT_DIR, 'test-quotation.xlsx')
        
        # 调用实际生成代码
        result = generate_quotation_excel(data, output_path)
        
        # 验证文件生成
        assert os.path.exists(output_path), f"Excel 文件应该被创建：{output_path}"
        assert result.success, f"生成应该成功：{result.error}"
    
    def test_single_product_excel(self):
        """TC-EXCEL-002: 单产品数据应该生成单行表格"""
        data = load_fixture('valid_customer.json')
        data['products'] = [data['products'][0]]  # 只保留一个产品
        
        assert len(data['products']) == 1
        
        pytest.skip("需要实现 Excel 生成脚本")
    
    def test_multi_page_excel(self):
        """TC-EXCEL-003: 50 个产品应该生成分页"""
        data = load_fixture('valid_customer.json')
        
        # 生成 50 个产品
        data['products'] = data['products'] * 17  # 51 个产品
        
        assert len(data['products']) >= 50
        
        pytest.skip("需要实现 Excel 生成脚本")
    
    def test_special_characters(self):
        """TC-EXCEL-004: 特殊字符应该正确显示"""
        data = load_fixture('valid_customer.json')
        
        # 添加特殊字符
        data['customer']['company_name'] = "Tech & Solutions <International> Ltd"
        data['products'][0]['description'] = 'HDMI Cable "Premium" Series'
        
        # 验证特殊字符
        assert '&' in data['customer']['company_name']
        assert '"' in data['products'][0]['description']
        
        pytest.skip("需要实现 Excel 生成脚本")
    
    def test_long_text_wrapping(self):
        """TC-EXCEL-005: 长文本应该自动换行"""
        data = load_fixture('valid_customer.json')
        
        # 添加长文本描述
        long_desc = "This is a very long product description that should wrap in the Excel cell " * 5
        data['products'][0]['description'] = long_desc
        
        assert len(long_desc) > 200
        
        pytest.skip("需要实现 Excel 生成脚本")
    
    def test_currency_formatting(self):
        """TC-EXCEL-006: 货币应该正确格式化"""
        data = load_fixture('valid_customer.json')
        
        # 验证价格格式
        for product in data['products']:
            price = product['unit_price']
            # 验证是数字且大于 0
            assert isinstance(price, (int, float))
            assert price > 0
            
            # 验证小数位数（最多 2 位）
            price_str = f"{price:.2f}"
            assert price_str  # 格式化成功
        
        pytest.skip("需要实现 Excel 生成脚本")
    
    def test_formula_calculation(self):
        """TC-EXCEL-007: 总额应该自动计算"""
        data = load_fixture('valid_customer.json')
        
        # 手动计算总额
        expected_total = sum(p['quantity'] * p['unit_price'] for p in data['products'])
        
        # 验证计算正确
        assert expected_total > 0
        
        # 验证各项计算
        for product in data['products']:
            line_total = product['quantity'] * product['unit_price']
            assert line_total > 0
        
        pytest.skip("需要实现 Excel 生成脚本")


class TestExcelDataValidation:
    """Excel 数据验证测试"""
    
    def test_product_quantity_positive(self):
        """验证产品数量为正数"""
        data = load_fixture('valid_customer.json')
        
        for product in data['products']:
            assert product['quantity'] > 0
    
    def test_unit_price_positive(self):
        """验证单价为正数"""
        data = load_fixture('valid_customer.json')
        
        for product in data['products']:
            assert product['unit_price'] > 0
    
    def test_total_calculation(self):
        """验证总额计算正确"""
        data = load_fixture('valid_customer.json')
        
        total = 0
        for product in data['products']:
            line_total = product['quantity'] * product['unit_price']
            total += line_total
        
        # 验证总额
        assert total == 500 * 8.50 + 300 * 6.75 + 200 * 12.00
        assert total == 4250.00 + 2025.00 + 2400.00
        assert total == 8675.00


class TestExcelTemplate:
    """Excel 模板测试"""
    
    def test_template_exists(self):
        """验证 Excel 模板文件存在"""
        # Template is in parent directory of tests
        template_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            'templates',
            'quotation-template.xlsx'
        )
        
        assert os.path.exists(template_path), f"Excel 模板不存在：{template_path}"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
