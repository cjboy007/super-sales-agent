#!/usr/bin/env python3
"""
报价单 Word 生成测试
验证 Word 文档生成的正确性、格式规范性和模板应用
"""

import pytest
import json
import os
import sys

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


class TestWordGeneration:
    """Word 生成测试类"""
    
    def test_word_file_created(self):
        """TC-WORD-001: 标准数据应该生成.docx 文件"""
        # 添加 src 到路径
        src_path = os.path.join(os.path.dirname(__file__), '..', '..', 'src')
        sys.path.insert(0, src_path)
        
        from word_generator import generate_quotation_word
        
        data = load_fixture('valid_customer.json')
        output_path = os.path.join(OUTPUT_DIR, 'test-quotation.docx')
        
        # 调用实际生成代码
        result = generate_quotation_word(data, output_path)
        
        # 验证文件生成
        assert os.path.exists(output_path), f"Word 文件应该被创建：{output_path}"
        assert result.success, f"生成应该成功：{result.error}"
    
    def test_company_logo_inserted(self):
        """TC-WORD-002: 公司 Logo 应该正确插入"""
        data = load_fixture('valid_customer.json')
        
        # 验证 Logo 配置
        # TODO: 添加 Logo 路径配置
        pytest.skip("需要实现 Logo 插入逻辑")
    
    def test_table_format(self):
        """TC-WORD-003: 表格格式应该符合传统边框样式"""
        data = load_fixture('valid_customer.json')
        
        # 验证表格数据结构
        assert 'products' in data
        assert len(data['products']) > 0
        
        # 验证表格字段
        required_fields = ['description', 'specification', 'quantity', 'unit_price']
        for product in data['products']:
            for field in required_fields:
                assert field in product
        
        pytest.skip("需要实现 Word 表格生成")
    
    def test_times_new_roman_font(self):
        """TC-WORD-004: 字体应该使用 Times New Roman"""
        # 验证模板配置
        # TODO: 检查模板字体设置
        pytest.skip("需要实现字体验证")
    
    def test_header_footer(self):
        """TC-WORD-005: 页眉页脚应该正确显示"""
        data = load_fixture('valid_customer.json')
        
        # 验证页眉字段
        assert 'quotation' in data
        assert 'quotation_no' in data['quotation']
        
        # 验证编号格式
        quotation_no = data['quotation']['quotation_no']
        assert quotation_no.startswith('QT-')
        
        pytest.skip("需要实现页眉页脚生成")


class TestWordDataValidation:
    """Word 数据验证测试"""
    
    def test_customer_info_complete(self):
        """验证客户信息完整"""
        data = load_fixture('valid_customer.json')
        
        required_fields = ['company_name', 'contact', 'email', 'phone', 'address', 'country']
        customer = data['customer']
        
        for field in required_fields:
            assert field in customer, f"缺少客户字段：{field}"
            assert customer[field], f"客户字段为空：{field}"
    
    def test_product_info_complete(self):
        """验证产品信息完整"""
        data = load_fixture('valid_customer.json')
        
        required_fields = ['description', 'specification', 'quantity', 'unit_price']
        
        for product in data['products']:
            for field in required_fields:
                assert field in product, f"缺少产品字段：{field}"
    
    def test_trade_terms_complete(self):
        """验证贸易条款完整"""
        data = load_fixture('valid_customer.json')
        
        assert 'trade_terms' in data
        trade_terms = data['trade_terms']
        
        required_fields = ['incoterms', 'currency', 'delivery']
        for field in required_fields:
            assert field in trade_terms, f"缺少贸易条款字段：{field}"


class TestWordTemplate:
    """Word 模板测试"""
    
    def test_word_template_exists(self):
        """验证 Word 模板文件存在"""
        # Template is in parent directory of tests
        template_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            'templates',
            'quotation-template.docx'
        )
        
        assert os.path.exists(template_path), f"Word 模板不存在：{template_path}"
    
    def test_template_has_placeholders(self):
        """验证模板有正确的占位符"""
        # TODO: 检查模板中的占位符
        pytest.skip("需要实现模板占位符检查")


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
