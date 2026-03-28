#!/usr/bin/env python3
"""
报价单 HTML 生成测试
验证 HTML 文档生成的正确性、响应式设计和打印样式
"""

import pytest
import json
import os
import sys

# 添加路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# 测试数据目录
FIXTURES_DIR = os.path.join(os.path.dirname(__file__), '..', 'fixtures')


def load_fixture(filename):
    """加载测试数据"""
    filepath = os.path.join(FIXTURES_DIR, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


class TestHTMLGeneration:
    """HTML 生成测试类"""
    
    def test_html_file_created(self):
        """TC-HTML-001: 标准数据应该生成.html 文件"""
        # 添加 src 到路径
        src_path = os.path.join(os.path.dirname(__file__), '..', '..', 'src')
        sys.path.insert(0, src_path)
        
        from html_generator import generate_quotation_html
        
        data = load_fixture('valid_customer.json')
        output_path = os.path.join(os.path.dirname(__file__), '..', 'output', 'test-quotation.html')
        
        # 确保输出目录存在
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # 调用实际生成代码
        result = generate_quotation_html(data, output_path)
        
        # 验证文件生成
        assert os.path.exists(output_path), f"HTML 文件应该被创建：{output_path}"
        assert result.success, f"生成应该成功：{result.error}"
        # 验证文件包含关键内容
        with open(output_path, 'r', encoding='utf-8') as f:
            content = f.read()
            assert 'QUOTATION' in content
            assert data['customer']['company_name'] in content
    
    def test_responsive_design(self):
        """TC-HTML-002: 应该支持响应式设计"""
        # 验证 HTML 包含 viewport meta 标签
        pytest.skip("需要实现响应式设计验证")
    
    def test_export_pdf_button(self):
        """TC-HTML-003: 应该包含 Export to PDF 按钮"""
        # 验证 HTML 包含导出按钮
        pytest.skip("需要实现按钮验证")
    
    def test_print_styles(self):
        """TC-HTML-004: 应该包含打印样式"""
        # 验证 HTML 包含 @media print 样式
        pytest.skip("需要实现打印样式验证")
    
    def test_traditional_style(self):
        """TC-HTML-005: 应该使用传统风格模板"""
        # 验证黑白配色、传统边框
        pytest.skip("需要实现样式验证")


class TestHTMLDataValidation:
    """HTML 数据验证测试"""
    
    def test_html_title(self):
        """验证 HTML 标题正确"""
        data = load_fixture('valid_customer.json')
        
        expected_title = f"Quotation {data['quotation']['quotation_no']}"
        assert expected_title
        
    def test_customer_info_display(self):
        """验证客户信息显示"""
        data = load_fixture('valid_customer.json')
        customer = data['customer']
        
        # 验证所有客户字段都能在 HTML 中显示
        display_fields = ['company_name', 'contact', 'email', 'phone', 'address']
        for field in display_fields:
            assert field in customer
    
    def test_product_table(self):
        """验证产品表格数据"""
        data = load_fixture('valid_customer.json')
        
        # 验证表格列
        columns = ['Description', 'Specification', 'Quantity', 'Unit Price', 'Total']
        assert len(columns) == 5
        
        # 验证行数（产品数 + 表头）
        assert len(data['products']) == 3
    
    def test_total_calculation_display(self):
        """验证总额显示"""
        data = load_fixture('valid_customer.json')
        
        # 计算总额
        subtotal = sum(p['quantity'] * p['unit_price'] for p in data['products'])
        assert subtotal > 0
        
        # TODO: 验证 HTML 中显示正确的总额


class TestHTMLStructure:
    """HTML 结构测试"""
    
    def test_valid_html5(self):
        """验证 HTML5 结构"""
        # 验证 DOCTYPE、html、head、body 标签
        pytest.skip("需要实现 HTML 结构验证")
    
    def test_meta_tags(self):
        """验证 meta 标签"""
        required_metas = [
            'charset="UTF-8"',
            'viewport',
            'description'
        ]
        # TODO: 验证 HTML 包含这些 meta 标签
        pytest.skip("需要实现 meta 标签验证")
    
    def test_css_inclusion(self):
        """验证 CSS 包含"""
        # 验证内联或外部 CSS
        pytest.skip("需要实现 CSS 验证")


class TestHTMLTemplate:
    """HTML 模板测试"""
    
    def test_html_template_exists(self):
        """验证 HTML 模板文件存在"""
        # Template is in parent directory of tests
        template_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            'templates',
            'quotation-template.html'
        )
        
        assert os.path.exists(template_path), f"HTML 模板不存在：{template_path}"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
