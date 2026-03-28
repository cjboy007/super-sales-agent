#!/usr/bin/env python3
"""
PI (形式发票) 生成器
"""

from dataclasses import dataclass
from typing import Optional
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side
import os


@dataclass
class GenerationResult:
    success: bool
    output_path: Optional[str] = None
    error: Optional[str] = None


def generate_pi_excel(data: dict, output_path: str) -> GenerationResult:
    """生成 PI Excel 文件"""
    try:
        wb = Workbook()
        ws = wb.active
        ws.title = 'Proforma Invoice'
        
        # 标题
        ws.merge_cells('A1:F1')
        title = ws['A1']
        title.value = 'PROFORMA INVOICE'
        title.font = Font(bold=True, size=16)
        title.alignment = Alignment(horizontal='center')
        
        # PI 信息
        pi = data.get('pi', {})
        ws['A3'] = f"PI No: {pi.get('pi_no', 'N/A')}"
        ws['B3'] = f"Date: {pi.get('date', 'N/A')}"
        
        # 客户信息
        customer = data.get('customer', {})
        ws['A5'] = 'To:'
        ws['A6'] = customer.get('company_name', '')
        ws['A7'] = customer.get('address', '')
        
        # 产品表格
        headers = ['No.', 'Description', 'Specification', 'Qty', 'Unit Price', 'Total']
        for col, header in enumerate(headers, start=1):
            ws.cell(row=10, column=col, value=header).font = Font(bold=True)
        
        products = data.get('products', [])
        for i, product in enumerate(products, start=1):
            row = 11 + i - 1
            ws.cell(row=row, column=1, value=i)
            ws.cell(row=row, column=2, value=product.get('description', ''))
            ws.cell(row=row, column=3, value=product.get('specification', ''))
            ws.cell(row=row, column=4, value=product.get('quantity', 0))
            ws.cell(row=row, column=5, value=f"${product.get('unit_price', 0):.2f}")
            line_total = product.get('quantity', 0) * product.get('unit_price', 0)
            ws.cell(row=row, column=6, value=f"${line_total:.2f}")
        
        # 总额
        subtotal = sum(p.get('quantity', 0) * p.get('unit_price', 0) for p in products)
        total_row = 11 + len(products)
        ws.cell(row=total_row, column=5, value='TOTAL:').font = Font(bold=True)
        ws.cell(row=total_row, column=6, value=f"${subtotal:.2f}").font = Font(bold=True)
        
        # 付款条款
        terms = data.get('terms', {})
        ws[f'A{total_row+2}'] = 'Payment Terms:'
        ws[f'A{total_row+3}'] = terms.get('payment', 'T/T 30% deposit, 70% before shipment')
        
        output_dir = os.path.dirname(output_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
        
        wb.save(output_path)
        return GenerationResult(success=True, output_path=output_path)
    except Exception as e:
        return GenerationResult(success=False, error=str(e))
