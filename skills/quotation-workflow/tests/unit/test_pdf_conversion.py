#!/usr/bin/env python3
"""
报价单 PDF 转换测试
验证 HTML 到 PDF 转换的正确性、格式和渲染质量
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


class TestPDFConversion:
    """PDF 转换测试类"""
    
    def test_pdf_file_created(self):
        """TC-PDF-001: HTML 应该能转换为 PDF"""
        # 添加 src 到路径
        src_path = os.path.join(os.path.dirname(__file__), '..', '..', 'src')
        sys.path.insert(0, src_path)
        
        from pdf_converter import convert_html_to_pdf
        
        # 先生成 HTML
        from html_generator import generate_quotation_html
        data = load_fixture('valid_customer.json')
        html_path = os.path.join(os.path.dirname(__file__), '..', 'output', 'test-quotation.html')
        pdf_path = os.path.join(os.path.dirname(__file__), '..', 'output', 'test-quotation.pdf')
        
        os.makedirs(os.path.dirname(html_path), exist_ok=True)
        
        # 生成 HTML
        html_result = generate_quotation_html(data, html_path)
        assert html_result.success, f"HTML 生成应该成功：{html_result.error}"
        
        # 转换为 PDF
        result = convert_html_to_pdf(html_path, pdf_path)
        
        # 验证 PDF 生成（Chrome 可能未安装，允许跳过）
        if result.skipped:
            pytest.skip(f"Chrome 未安装：{result.error}")
        
        assert os.path.exists(pdf_path), f"PDF 文件应该被创建：{pdf_path}"
        assert result.success, f"PDF 转换应该成功：{result.error}"
        # 验证 PDF 文件大小合理（至少 1KB）
        assert os.path.getsize(pdf_path) > 1024, "PDF 文件大小应该大于 1KB"
    
    def test_a4_paper_size(self):
        """TC-PDF-002: PDF 应该是 A4 纸张尺寸"""
        # A4: 210mm x 297mm (8.27" x 11.69")
        # TODO: 验证 PDF 页面尺寸
        pytest.skip("需要实现 PDF 尺寸验证")
    
    def test_no_header_footer(self):
        """TC-PDF-003: PDF 应该无页眉页脚"""
        # 验证 --print-to-pdf-no-header --print-to-pdf-no-footer
        pytest.skip("需要实现页眉页脚验证")
    
    def test_multipage_handling(self):
        """TC-PDF-004: 多页文档应该正确分页"""
        data = load_fixture('valid_customer.json')
        
        # 生成多页数据
        data['products'] = data['products'] * 20  # 60 个产品
        
        assert len(data['products']) > 50
        
        pytest.skip("需要实现分页验证")
    
    def test_chinese_characters(self):
        """TC-PDF-005: 中文字符应该正确渲染"""
        data = load_fixture('valid_customer.json')
        
        # 添加中文
        data['customer']['company_name'] = "科技有限公司"
        data['products'][0]['description'] = "高清 HDMI 线缆"
        
        # TODO: 验证中文字符在 PDF 中正确显示（无方框）
        pytest.skip("需要实现中文字体验证")


class TestPDFConversionConfig:
    """PDF 转换配置测试"""
    
    def test_chrome_available(self):
        """验证 Chrome/Chromium 可用"""
        import subprocess
        
        try:
            result = subprocess.run(
                ['google-chrome', '--version'],
                capture_output=True,
                text=True,
                timeout=5
            )
            assert result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pytest.skip("Chrome 未安装，PDF 转换测试跳过")
    
    def test_headless_mode(self):
        """验证无头模式配置"""
        # 验证 --headless --disable-gpu 参数
        pytest.skip("需要实现无头模式验证")
    
    def test_pdf_compression(self):
        """验证 PDF 压缩"""
        # 验证输出文件大小合理
        pytest.skip("需要实现文件大小验证")


class TestPDFQuality:
    """PDF 质量测试"""
    
    def test_text_selectable(self):
        """验证文本可选择"""
        # PDF 中的文本应该可以选择和复制
        pytest.skip("需要实现文本选择验证")
    
    def test_image_quality(self):
        """验证图片质量"""
        # 如果有 Logo，验证图片清晰度
        pytest.skip("需要实现图片质量验证")
    
    def test_links_working(self):
        """验证链接可用"""
        # 如果有超链接，验证可点击
        pytest.skip("需要实现链接验证")


class TestPDFTemplate:
    """PDF 模板测试"""
    
    def test_pdf_template_exists(self):
        """验证 PDF 转换脚本存在"""
        # Script is in parent directory of tests
        script_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            'scripts',
            'convert-to-pdf.sh'
        )
        
        assert os.path.exists(script_path), f"PDF 转换脚本不存在：{script_path}"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
