#!/usr/bin/env python3
"""
样品单生成器
"""

from dataclasses import dataclass
from typing import Optional
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment
import os


@dataclass
class GenerationResult:
    success: bool
    output_path: Optional[str] = None
    error: Optional[str] = None


def generate_sample_excel(data: dict, output_path: str) -> GenerationResult:
    """生成样品单 Excel 文件"""
    try:
        wb = Workbook()
        ws = wb.active
        ws.title = 'Sample Order'
        
        # 标题
        ws.merge_cells('A1:E1')
        title = ws['A1']
        title.value = 'SAMPLE ORDER'
        title.font = Font(bold=True, size=16)
        title.alignment = Alignment(horizontal='center')
        
        # 样品单信息
        sample = data.get('sample', {})
        ws['A3'] = f"Sample No: {sample.get('sample_no', 'N/A')}"
        ws['B3'] = f"Date: {sample.get('date', 'N/A')}"
        ws['C3'] = f"Purpose: {sample.get('purpose', 'N/A')}"
        
        # 客户信息
        customer = data.get('customer', {})
        ws['A5'] = 'To:'
        ws['A6'] = customer.get('company_name', '')
        ws['A7'] = customer.get('address', '')
        
        # 收货地址
        shipping = data.get('shipping_address', {})
        ws['A9'] = 'Shipping Address:'
        ws['A10'] = shipping.get('company_name', '')
        ws['A11'] = shipping.get('address', '')
        
        # 产品表格
        headers = ['No.', 'Description', 'Specification', 'Qty', 'Unit Price']
        for col, header in enumerate(headers, start=1):
            ws.cell(row=14, column=col, value=header).font = Font(bold=True)
        
        products = data.get('products', [])
        for i, product in enumerate(products, start=1):
            row = 15 + i - 1
            ws.cell(row=row, column=1, value=i)
            ws.cell(row=row, column=2, value=product.get('description', ''))
            ws.cell(row=row, column=3, value=product.get('specification', ''))
            ws.cell(row=row, column=4, value=product.get('quantity', 0))
            ws.cell(row=row, column=5, value=f"${product.get('unit_price', 0):.2f}")
        
        # 物流信息
        shipping_method = data.get('shipping', {})
        total_row = 15 + len(products)
        ws[f'A{total_row+2}'] = 'Shipping Method:'
        ws[f'B{total_row+2}'] = shipping_method.get('method', 'DHL')
        ws[f'A{total_row+3}'] = 'Freight Collect:'
        ws[f'B{total_row+3}'] = 'Yes' if shipping_method.get('freight_collect') else 'No'
        
        output_dir = os.path.dirname(output_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
        
        wb.save(output_path)
        return GenerationResult(success=True, output_path=output_path)
    except Exception as e:
        return GenerationResult(success=False, error=str(e))
