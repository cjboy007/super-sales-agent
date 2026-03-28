#!/usr/bin/env python3
"""生成传统风格 PI (形式发票) - HTML 格式，支持打印/PDF 导出"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime

def generate_pi_html(output_path, data):
    """生成传统风格 PI HTML"""
    
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
        if not p.get('unit_price', p.get('unitPrice', 0)):
            errors.append(f'产品 {i+1} 缺少单价 (unit_price 或 unitPrice)')

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
    company_email = data.get('company_email', 'your-email@farreach-electronic.com')
    
    # 客户信息
    customer = data.get('customer', {})
    customer_name = customer.get('company_name', customer.get('name', '_________________'))
    customer_contact = customer.get('contact', customer.get('contact_name', 'Procurement Manager'))
    customer_address = customer.get('address', '_________________')
    customer_email = customer.get('email', '')
    customer_phone = customer.get('phone', '')
    
    # PI 信息
    pi = data.get('pi', {})
    pi_no = pi.get('pi_no', data.get('piNo', 'PI-' + datetime.now().strftime('%Y%m%d-001')))
    pi_date = pi.get('date', data.get('date', datetime.now().strftime('%Y-%m-%d'))).replace('-', '.')
    valid_until = pi.get('valid_until', data.get('validUntil', '')).replace('-', '/')
    
    # 贸易条款
    trade_terms = data.get('trade_terms', {})
    terms = data.get('terms', {})
    incoterms = trade_terms.get('incoterms', terms.get('incoterms', 'FOB Shenzhen'))
    currency = data.get('currency', terms.get('currency', 'USD'))
    delivery = trade_terms.get('delivery', terms.get('delivery', '15-20 days'))
    
    # 产品列表
    products = data.get('products', [])
    
    # 计算总额
    subtotal = sum(p.get('quantity', 0) * p.get('unit_price', p.get('unitPrice', 0)) for p in products)
    freight = data.get('freight', 0)
    tax = data.get('tax', 0)
    total = subtotal + freight + tax
    
    # 银行信息
    bank_info = data.get('bank_info', {
        'beneficiary': 'FARREACH ELECTRONIC CO LIMITED',
        'bank_name': 'HSBC Hong Kong',
        'account_no': '411-758097-838',
        'swift_code': 'HSBCHKHHHKH',
        'bank_address': 'No.1 Queen\'s Road Central,Central, Hong Kong'
    })
    
    # 条款
    terms_data = data.get('terms', {})
    payment_terms = terms_data.get('payment', 'T/T 30% deposit, 70% before shipment')
    packaging = terms_data.get('packaging', 'Standard export packaging')
    remarks = terms_data.get('remarks', '')
    
    html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Proforma Invoice - {pi_no}</title>
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
        .total-box {{
            border: 2px solid #000;
            padding: 10px;
            margin-top: 10px;
        }}
        .bank-box {{
            border: 1px solid #000;
            padding: 10px;
            background: #f9f9f9;
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
                    <div class="title">PROFORMA INVOICE</div>
                </div>
            </div>
        </div>

        <!-- PI Info -->
        <div class="section">
            <table style="width: 100%; margin-bottom: 15px;">
                <tr>
                    <td style="width: 20%;" class="bold">PI No:</td>
                    <td style="width: 30%;">{pi_no}</td>
                    <td style="width: 20%;" class="bold">Date:</td>
                    <td style="width: 30%;">{pi_date}</td>
                </tr>
                <tr>
                    <td class="bold">Valid Until:</td>
                    <td>{valid_until}</td>
                    <td class="bold">Currency:</td>
                    <td>{currency}</td>
                </tr>
            </table>
        </div>

        <!-- Bill To -->
        <div class="section">
            <div class="section-title">BILL TO:</div>
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
                    <td class="bold">Address:</td>
                    <td>{customer_address}</td>
                </tr>
                {f'<tr><td class="bold">Email:</td><td>{customer_email}</td></tr>' if customer_email else ''}
                {f'<tr><td class="bold">Phone:</td><td>{customer_phone}</td></tr>' if customer_phone else ''}
            </table>
        </div>

        <!-- Products -->
        <div class="section">
            <div class="section-title">GOODS DESCRIPTION:</div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 5%;" class="center">No.</th>
                        <th style="width: 50%;">Description</th>
                        <th style="width: 10%;" class="center">Qty</th>
                        <th style="width: 15%;" class="right">Unit Price</th>
                        <th style="width: 20%;" class="right">Amount</th>
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
                        <td class="bold">Subtotal:</td>
                        <td class="right">${subtotal:,.2f}</td>
                    </tr>
                    {f'<tr><td class="bold">Freight:</td><td class="right">${freight:.2f}</td></tr>' if freight > 0 else ''}
                    {f'<tr><td class="bold">Tax:</td><td class="right">${tax:.2f}</td></tr>' if tax > 0 else ''}
                    <tr>
                        <td class="bold" style="border-top: 2px solid #000; padding-top: 10px;">TOTAL:</td>
                        <td class="right bold" style="border-top: 2px solid #000; padding-top: 10px; font-size: 14pt;">${total:,.2f}</td>
                    </tr>
                </table>
            </div>
            <div style="clear: both;"></div>
        </div>

        <!-- Payment Terms -->
        <div class="section" style="margin-top: 30px;">
            <div class="section-title">PAYMENT TERMS & CONDITIONS:</div>
            <table style="width: 100%;">
                <tr>
                    <td style="width: 30%;" class="bold">Payment Method:</td>
                    <td>{payment_terms}</td>
                </tr>
                <tr>
                    <td class="bold">Delivery Time:</td>
                    <td>{delivery}</td>
                </tr>
                <tr>
                    <td class="bold">Port of Loading:</td>
                    <td>{incoterms}</td>
                </tr>
                <tr>
                    <td class="bold">Packaging:</td>
                    <td>{packaging}</td>
                </tr>
            </table>
        </div>

        <!-- Bank Details -->
        <div class="section" style="margin-top: 30px;">
            <div class="section-title">BANK DETAILS FOR PAYMENT:</div>
            <div class="bank-box">
                <table style="width: 100%; border: none;">
                    <tr>
                        <td style="width: 25%; border: none;" class="bold">Beneficiary:</td>
                        <td style="border: none;">{bank_info.get('beneficiary', '')}</td>
                    </tr>
                    <tr>
                        <td style="border: none;" class="bold">Bank Name:</td>
                        <td style="border: none;">{bank_info.get('bank_name', '')}</td>
                    </tr>
                    <tr>
                        <td style="border: none;" class="bold">Account No:</td>
                        <td style="border: none;">{bank_info.get('account_no', '')}</td>
                    </tr>
                    <tr>
                        <td style="border: none;" class="bold">SWIFT Code:</td>
                        <td style="border: none;">{bank_info.get('swift_code', '')}</td>
                    </tr>
                    <tr>
                        <td style="border: none;" class="bold">Bank Address:</td>
                        <td style="border: none;">{bank_info.get('bank_address', '')}</td>
                    </tr>
                </table>
            </div>
        </div>

        <!-- Terms & Conditions -->
        <div class="section" style="margin-top: 20px;">
            <div class="section-title">TERMS & CONDITIONS:</div>
            <table style="width: 100%;">
                <tr>
                    <td style="width: 30%;" class="bold">Payment:</td>
                    <td>{payment_terms}</td>
                </tr>
                <tr>
                    <td class="bold">Delivery:</td>
                    <td>{delivery}</td>
                </tr>
                <tr>
                    <td class="bold">Packaging:</td>
                    <td>{packaging}</td>
                </tr>
            </table>
        </div>

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
        description='生成传统风格 PI (形式发票)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例:
  # 从 JSON 数据生成 PI
  python3 generate_pi.py --data pi_data.json --output PI-20260327-001.html
  
  # 快速测试
  python3 generate_pi.py --output test.html --quick-test
  
  # 在浏览器打开
  open PI-20260327-001.html
        '''
    )
    
    parser.add_argument('--data', '-d', help='PI 数据 JSON 文件路径')
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
                    'address': 'Floor 12, Building A, High-Tech Park, Shenzhen',
                    'email': 'john@testcustomer.com',
                    'phone': '+86-755-8888-9999'
                },
                'pi': {
                    'pi_no': 'PI-20260327-001',
                    'date': '2026-03-27',
                    'valid_until': '2026-04-26'
                },
                'products': [
                    {
                        'description': 'HDMI 2.1 Ultra High Speed Cable',
                        'specification': '8K@60Hz, 48Gbps, 2m',
                        'quantity': 500,
                        'unit_price': 8.50
                    },
                    {
                        'description': 'USB-C to USB-C Cable',
                        'specification': 'USB 4.0, 80Gbps, 100W PD, 1m',
                        'quantity': 1000,
                        'unit_price': 12.00
                    }
                ],
                'currency': 'USD',
                'freight': 350.00,
                'bank_info': {
                    'beneficiary': 'FARREACH ELECTRONIC CO LIMITED',
                    'bank_name': 'HSBC Hong Kong',
                    'account_no': '411-758097-838',
                    'swift_code': 'HSBCHKHHHKH',
                    'bank_address': 'No.1 Queen\'s Road Central,Central, Hong Kong'
                }
            }
        
        if not args.data and not args.quick_test:
            print("❌ 请提供 --data 或 --quick-test", file=sys.stderr)
            sys.exit(1)
        
        output = generate_pi_html(args.output, data)
        print(f"✅ PI 已生成：{output}")
        
        # 如果输出是 HTML，自动生成 PDF（去掉页眉页脚）
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
