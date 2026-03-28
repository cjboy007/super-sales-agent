#!/usr/bin/env python3
"""生成样品单 (Sample Request) - HTML 格式，支持打印/PDF 导出"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime

def generate_sample_html(output_path, data):
    """生成样品单 HTML"""
    
    # 输入校验
    errors = []
    customer = data.get('customer', {})
    customer_name = customer.get('company_name', customer.get('name', ''))
    if not customer_name:
        errors.append('缺少客户名称 (customer.company_name 或 customer.name)')

    products = data.get('products', [])
    if not products:
        errors.append('缺少产品列表 (products)')

    for i, p in enumerate(products):
        if not p.get('description', ''):
            errors.append(f'产品 {i+1} 缺少描述 (description)')
        if not p.get('quantity', 0):
            errors.append(f'产品 {i+1} 缺少数量 (quantity)')

    if errors:
        print('❌ 输入数据校验失败：')
        for e in errors:
            print(f'  - {e}')
        sys.exit(1)

    # 公司信息（Farreach）
    company_name = data.get('company_name', 'FARREACH ELECTRONIC CO LIMITED')
    company_address = data.get('company_address', 'No. 6, Chuangye Road East, Shuanglinpian, Liangang Industrial Zone, Zhuhai, China')
    company_phone = data.get('company_phone', '86-756-8699660')
    company_fax = data.get('company_fax', '86-756-8699663')
    company_website = data.get('company_website', 'www.farreach-cable.com')
    company_email = data.get('company_email', 'your-email')
    
    # 客户信息
    customer = data.get('customer', {})
    customer_name = customer.get('company_name', customer.get('name', '_________________'))
    customer_contact = customer.get('contact', customer.get('contact_name', 'Procurement Manager'))
    customer_email = customer.get('email', '')
    customer_phone = customer.get('phone', '')
    
    # 样品单信息
    sample = data.get('sample', {})
    sample_no = sample.get('sample_no', data.get('sampleNo', 'SPL-' + datetime.now().strftime('%Y%m%d-001')))
    sample_date = sample.get('date', data.get('date', datetime.now().strftime('%Y-%m-%d'))).replace('-', '.')
    purpose = sample.get('purpose', 'Testing / Evaluation')
    
    # 收货地址
    shipping_addr = data.get('shipping_address', {})
    shipping_company = shipping_addr.get('company_name', customer_name)
    shipping_contact = shipping_addr.get('contact', customer_contact)
    shipping_phone = shipping_addr.get('phone', customer_phone)
    shipping_address = shipping_addr.get('address', customer.get('address', ''))
    shipping_country = shipping_addr.get('country', customer.get('country', ''))
    shipping_postal = shipping_addr.get('postal_code', '')
    
    # 产品列表
    products = data.get('products', [])
    
    # 计算总额
    subtotal = sum(p.get('quantity', 0) * p.get('unit_price', p.get('unitPrice', 0)) for p in products)
    freight = data.get('shipping', {}).get('freight_amount', 0)
    total = subtotal + freight
    
    # 运输信息
    shipping = data.get('shipping', {})
    shipping_method = shipping.get('method', 'DHL')
    freight_account = shipping.get('account_no', '')
    freight_collect = shipping.get('freight_collect', True)
    
    # 条款
    terms = data.get('terms', {})
    sample_charge = terms.get('sample_charge', 'Free')
    lead_time = terms.get('lead_time', '3-5 days after confirmation')
    remarks = terms.get('remarks', '')
    
    html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sample Request - {sample_no}</title>
    <style>
        body {{
            font-family: 'Times New Roman', Times, serif;
            font-size: 12pt;
            line-height: 1.4;
            color: #000;
            background: #f5f5f5;
            margin: 0;
            padding: 20px;
        }}
        .page {{
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            background: white;
            padding: 25mm 20mm;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}
        @media print {{
            body {{
                background: white;
                margin: 0;
                padding: 0;
            }}
            .page {{
                margin: 0;
                box-shadow: none;
                padding: 20mm 15mm;
            }}
            .no-print {{
                display: none;
            }}
        }}
        table {{
            border-collapse: collapse;
            width: 100%;
        }}
        th, td {{
            border: 1px solid #000;
            padding: 8px;
            text-align: left;
        }}
        th {{
            background: #e0e0e0;
            font-weight: bold;
        }}
        .header {{
            border: 2px solid #000;
            padding: 15px;
            margin-bottom: 20px;
        }}
        .title {{
            font-size: 18pt;
            font-weight: bold;
            text-align: center;
            margin: 10px 0;
        }}
        .section {{
            margin-bottom: 15px;
        }}
        .section-title {{
            font-weight: bold;
            border-bottom: 1px solid #000;
            padding-bottom: 3px;
            margin-bottom: 8px;
        }}
        .right {{
            text-align: right;
        }}
        .center {{
            text-align: center;
        }}
        .bold {{
            font-weight: bold;
        }}
        .total-box {{
            border: 2px solid #000;
            padding: 10px;
            margin-top: 10px;
        }}
    </style>
</head>
<body>

    <div class="page">
        
        <!-- Header -->
        <div class="header">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1;">
                    <div class="title" style="text-align: left; font-size: 16pt;">
                        {company_name}
                    </div>
                    <div style="margin-top: 10px; font-size: 10pt;">
                        <strong>Address:</strong> {company_address}<br>
                        <strong>Tel:</strong> {company_phone} &nbsp;|&nbsp; 
                        <strong>Fax:</strong> {company_fax}<br>
                        <strong>Email:</strong> {company_email}<br>
                        <strong>Website:</strong> {company_website}
                    </div>
                </div>
                <div style="text-align: right; border: 2px solid #000; padding: 10px; margin-left: 20px;">
                    <div class="title">SAMPLE REQUEST</div>
                </div>
            </div>
        </div>

        <!-- Sample Info -->
        <div class="section">
            <table style="width: 100%; margin-bottom: 15px;">
                <tr>
                    <td style="width: 20%;" class="bold">Sample No:</td>
                    <td style="width: 30%;">{sample_no}</td>
                    <td style="width: 20%;" class="bold">Date:</td>
                    <td style="width: 30%;">{sample_date}</td>
                </tr>
                <tr>
                    <td class="bold">Purpose:</td>
                    <td colspan="3">{purpose}</td>
                </tr>
            </table>
        </div>

        <!-- Customer Info -->
        <div class="section">
            <div class="section-title">CUSTOMER INFORMATION:</div>
            <table style="width: 100%;">
                <tr>
                    <td style="width: 20%;" class="bold">Company:</td>
                    <td>{customer_name}</td>
                </tr>
                <tr>
                    <td class="bold">Attn:</td>
                    <td>{customer_contact}</td>
                </tr>
                <tr>
                    <td class="bold">Email:</td>
                    <td>{customer_email}</td>
                </tr>
                <tr>
                    <td class="bold">Phone:</td>
                    <td>{customer_phone}</td>
                </tr>
            </table>
        </div>

        <!-- Shipping Address -->
        <div class="section">
            <div class="section-title">SHIPPING ADDRESS:</div>
            <table style="width: 100%;">
                <tr>
                    <td style="width: 20%;" class="bold">Company:</td>
                    <td>{shipping_company}</td>
                </tr>
                <tr>
                    <td class="bold">Attn:</td>
                    <td>{shipping_contact}</td>
                </tr>
                <tr>
                    <td class="bold">Address:</td>
                    <td>{shipping_address}<br>{shipping_country} {shipping_postal}</td>
                </tr>
                <tr>
                    <td class="bold">Phone:</td>
                    <td>{shipping_phone}</td>
                </tr>
            </table>
        </div>

        <!-- Sample Items -->
        <div class="section">
            <div class="section-title">SAMPLE ITEMS:</div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 5%;" class="center">No.</th>
                        <th style="width: 45%;">Description</th>
                        <th style="width: 10%;" class="center">Qty</th>
                        <th style="width: 15%;" class="right">Unit Price</th>
                        <th style="width: 15%;" class="right">Amount</th>
                        <th style="width: 10%;">Remarks</th>
                    </tr>
                </thead>
                <tbody>
'''
    
    # 产品行
    for idx, product in enumerate(products, start=1):
        description = product.get('description', '')
        specification = product.get('specification', '')
        quantity = product.get('quantity', 0)
        unit_price = product.get('unit_price', product.get('unitPrice', 0))
        amount = quantity * unit_price
        remarks = product.get('remarks', '')
        
        # 规格显示
        spec_text = ''
        if specification:
            specs = [s.strip() for s in specification.split(',') if s.strip()]
            spec_text = '<br><small>' + ', '.join(specs) + '</small>'
        
        html_content += f'''
                    <tr>
                        <td class="center">{idx}</td>
                        <td>
                            <strong>{description}</strong>{spec_text}
                        </td>
                        <td class="center">{quantity}</td>
                        <td class="right">${unit_price:.2f}</td>
                        <td class="right">${amount:,.2f}</td>
                        <td>{remarks}</td>
                    </tr>
'''
    
    html_content += f'''
                </tbody>
            </table>
        </div>

        <!-- Totals -->
        <div class="section">
            <div style="float: right; width: 50%;">
                <table style="width: 100%;">
                    <tr>
                        <td class="bold">Sample Subtotal:</td>
                        <td class="right">${subtotal:,.2f}</td>
                    </tr>
                    {f'<tr><td class="bold">Freight:</td><td class="right">${freight:.2f}</td></tr>' if freight > 0 else '<tr><td class="bold">Freight:</td><td class="right">Collect</td></tr>'}
                    <tr>
                        <td class="bold" style="border-top: 2px solid #000; padding-top: 10px;">TOTAL:</td>
                        <td class="right bold" style="border-top: 2px solid #000; padding-top: 10px; font-size: 14pt;">${total:,.2f}</td>
                    </tr>
                </table>
            </div>
            <div style="clear: both;"></div>
        </div>

        <!-- Shipping & Terms -->
        <div class="section" style="margin-top: 30px;">
            <div class="section-title">SHIPPING & TERMS:</div>
            <table style="width: 100%;">
                <tr>
                    <td style="width: 30%;" class="bold">Courier:</td>
                    <td>{shipping_method}</td>
                </tr>
                <tr>
                    <td class="bold">Freight Account:</td>
                    <td>{freight_account if freight_account else 'N/A (Freight Collect)'}</td>
                </tr>
                <tr>
                    <td class="bold">Sample Charge:</td>
                    <td>{sample_charge}</td>
                </tr>
                <tr>
                    <td class="bold">Lead Time:</td>
                    <td>{lead_time}</td>
                </tr>
            </table>
        </div>

        <!-- Remarks -->
        {f'''
        <div class="section" style="margin-top: 20px;">
            <div class="section-title">REMARKS:</div>
            <div style="font-size: 10pt; white-space: pre-line;">{remarks}</div>
        </div>
        ''' if remarks else ''}

    </div>

</body>
</html>
'''
    
    # 写入文件
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    return output_path

def main():
    parser = argparse.ArgumentParser(
        description='生成样品单 (Sample Request)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例:
  # 从 JSON 数据生成样品单
  python3 generate_sample.py --data sample_data.json --output SPL-20260327-001.html
  
  # 快速测试
  python3 generate_sample.py --output test.html --quick-test
  
  # 在浏览器打开
  open SPL-20260327-001.html
        '''
    )
    
    parser.add_argument('--data', '-d', help='样品单数据 JSON 文件路径')
    parser.add_argument('--output', '-o', help='输出文件路径')
    parser.add_argument('--quick-test', action='store_true', help='使用测试数据快速生成')
    
    args = parser.parse_args()
    
    if args.output:
        data = None
        
        if args.data:
            with open(args.data, 'r', encoding='utf-8') as f:
                data = json.load(f)
        elif args.quick_test:
            data = {
                'customer': {
                    'company_name': 'Test Customer Corp',
                    'contact': 'John Smith',
                    'email': 'john@testcustomer.com',
                    'phone': '+86-755-8888-9999',
                    'address': 'Floor 12, Building A, High-Tech Park, Shenzhen',
                    'country': 'China'
                },
                'sample': {
                    'sample_no': 'SPL-20260327-001',
                    'date': '2026-03-27',
                    'purpose': 'Testing / Evaluation'
                },
                'products': [
                    {
                        'description': 'HDMI 2.1 Cable',
                        'specification': '8K@60Hz, 2m',
                        'quantity': 2,
                        'unit_price': 8.50,
                        'remarks': 'For quality testing'
                    }
                ],
                'shipping': {
                    'method': 'DHL',
                    'freight_collect': True
                },
                'terms': {
                    'sample_charge': 'Free',
                    'lead_time': '3-5 days after confirmation',
                    'remarks': '1. Sample lead time: 3-5 days.\\n2. Courier account preferred for freight collect.\\n3. Sample charge can be refunded upon bulk order.'
                }
            }
        
        if not args.data and not args.quick_test:
            print("❌ 请提供 --data 或 --quick-test", file=sys.stderr)
            sys.exit(1)
        
        output = generate_sample_html(args.output, data)
        print(f"✅ 样品单已生成：{output}")
        
        # 如果输出是 HTML，自动生成 PDF（去掉页脚和页眉）
        if str(output).endswith('.html'):
            import subprocess
            pdf_output = str(output).replace('.html', '.pdf')
            try:
                subprocess.run([
                    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                    '--headless=new',
                    '--disable-gpu',
                    f'--print-to-pdf={pdf_output}',
                    '--no-pdf-header-footer',
                    '--paper-width=8.27',
                    '--paper-height=11.69',
                    f'file://{output}'
                ], check=True, capture_output=True)
                print(f"✅ PDF 已生成：{pdf_output} (已去掉页眉页脚)")
            except Exception as e:
                print(f"⚠️  PDF 生成失败：{e}")
        return
    
    parser.print_help()

if __name__ == '__main__':
    main()
