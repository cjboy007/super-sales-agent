#!/usr/bin/env python3
"""
报价单 HTML 生成器
生成传统风格的 HTML 报价单，支持响应式设计和打印
"""

from dataclasses import dataclass
from typing import Optional
import os


@dataclass
class GenerationResult:
    """生成结果"""
    success: bool
    output_path: Optional[str] = None
    error: Optional[str] = None


def generate_quotation_html(data: dict, output_path: str) -> GenerationResult:
    """
    生成报价单 HTML 文件
    
    Args:
        data: 报价单数据（包含 customer, products, quotation, trade_terms）
        output_path: 输出文件路径
    
    Returns:
        GenerationResult: 生成结果
    """
    try:
        # 读取模板
        template_path = os.path.join(
            os.path.dirname(__file__),
            '..',
            'templates',
            'quotation-template.html'
        )
        
        with open(template_path, 'r', encoding='utf-8') as f:
            template = f.read()
        
        # 准备数据
        customer = data.get('customer', {})
        quotation = data.get('quotation', {})
        trade_terms = data.get('trade_terms', {})
        products = data.get('products', [])
        
        # 计算总额
        subtotal = sum(p.get('quantity', 0) * p.get('unit_price', 0) for p in products)
        currency = trade_terms.get('currency', 'USD')
        
        # 生成产品表格行
        product_rows = []
        for i, product in enumerate(products, start=1):
            line_total = product.get('quantity', 0) * product.get('unit_price', 0)
            row = f"""
                <tr>
                    <td class="text-center">{i}</td>
                    <td>{product.get('description', '')}</td>
                    <td>{product.get('specification', '')}</td>
                    <td class="text-center">{product.get('quantity', 0)}</td>
                    <td class="text-right">{currency} {product.get('unit_price', 0):.2f}</td>
                    <td class="text-right">{currency} {line_total:.2f}</td>
                </tr>
            """
            product_rows.append(row)
        
        products_html = '\n'.join(product_rows)
        
        # 替换模板变量
        html = template
        html = html.replace('{{quotation_no}}', quotation.get('quotation_no', 'N/A'))
        html = html.replace('{{customer.company_name}}', customer.get('company_name', ''))
        html = html.replace('{{customer.address}}', customer.get('address', ''))
        html = html.replace('{{customer.country}}', customer.get('country', ''))
        html = html.replace('{{customer.phone}}', customer.get('phone', ''))
        html = html.replace('{{customer.email}}', customer.get('email', ''))
        html = html.replace('{{quotation.date}}', quotation.get('date', ''))
        html = html.replace('{{quotation.valid_until}}', quotation.get('valid_until', ''))
        html = html.replace('{{trade_terms.currency}}', currency)
        html = html.replace('{{trade_terms.incoterms}}', trade_terms.get('incoterms', ''))
        html = html.replace('{{products}}', products_html)
        html = html.replace('{{currency}}', currency)
        html = html.replace('{{subtotal}}', f'{subtotal:.2f}')
        html = html.replace('{{total}}', f'{subtotal:.2f}')
        html = html.replace('{{trade_terms.delivery}}', trade_terms.get('delivery', 'N/A'))
        
        # 确保输出目录存在
        output_dir = os.path.dirname(output_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
        
        # 保存文件
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html)
        
        return GenerationResult(
            success=True,
            output_path=output_path
        )
        
    except Exception as e:
        return GenerationResult(
            success=False,
            error=str(e)
        )
