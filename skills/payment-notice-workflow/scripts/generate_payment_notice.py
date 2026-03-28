#!/usr/bin/env python3
"""生成收款通知 (Payment Notice) - HTML 格式，支持打印/PDF 导出"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime

def generate_payment_notice_html(output_path, data):
    """生成收款通知 HTML"""
    
    # 输入校验
    errors = []
    customer = data.get('customer', {})
    customer_name = customer.get('company_name', customer.get('name', ''))
    if not customer_name:
        errors.append('缺少客户名称 (customer.company_name 或 customer.name)')

    payment = data.get('payment', {})
    if not payment.get('total_amount', 0):
        errors.append('缺少总金额 (payment.total_amount)')

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
    
    # 通知信息
    notice = data.get('notice', {})
    notice_no = notice.get('notice_no', data.get('noticeNo', 'PN-' + datetime.now().strftime('%Y%m%d-001')))
    notice_date = notice.get('date', data.get('date', datetime.now().strftime('%Y-%m-%d'))).replace('-', '.')
    due_date = notice.get('due_date', data.get('dueDate', '')).replace('-', '/')
    
    # 参考信息
    reference = data.get('reference', {})
    pi_no = reference.get('pi_no', reference.get('piNo', ''))
    quotation_no = reference.get('quotation_no', reference.get('quotationNo', ''))
    order_no = reference.get('order_no', reference.get('orderNo', ''))
    
    # 付款信息
    payment = data.get('payment', {})
    total_amount = payment.get('total_amount', 0)
    currency = payment.get('currency', 'USD')
    deposit_amount = payment.get('deposit_amount', 0)
    deposit_date = payment.get('deposit_date', '').replace('-', '.')
    balance_due = payment.get('balance_due', total_amount)
    
    # 银行信息
    bank_info = data.get('bank_info', {
        'beneficiary': 'FARREACH ELECTRONIC CO LIMITED',
        'bank_name': 'HSBC Hong Kong',
        'account_no': '411-758097-838',
        'swift_code': 'HSBCHKHHHKH',
        'bank_address': 'No.1 Queen\'s Road Central,Central, Hong Kong'
    })
    
    # 条款
    terms = data.get('terms', {})
    payment_terms = terms.get('payment_terms', 'T/T 30% deposit, 70% before shipment')
    remarks = terms.get('remarks', '')
    
    html_content = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Notice - {notice_no}</title>
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
        .highlight {{
            background: #ffffcc;
            font-weight: bold;
        }}
        .amount-box {{
            border: 2px solid #000;
            padding: 15px;
            margin-top: 20px;
            background: #f9f9f9;
        }}
        .bank-box {{
            border: 1px solid #000;
            padding: 10px;
            background: #f0f0f0;
        }}
        .urgent {{
            color: #cc0000;
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
                    <div class="title" style="font-size: 14pt;">PAYMENT NOTICE</div>
                </div>
            </div>
        </div>

        <!-- Notice Info -->
        <div class="section">
            <table style="width: 100%; margin-bottom: 15px;">
                <tr>
                    <td style="width: 20%;" class="bold">Notice No:</td>
                    <td style="width: 30%;">{notice_no}</td>
                    <td style="width: 20%;" class="bold">Date:</td>
                    <td style="width: 30%;">{notice_date}</td>
                </tr>
                <tr>
                    <td class="bold">Due Date:</td>
                    <td colspan="3" class="urgent">{due_date}</td>
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
                    <td class="bold">Email:</td>
                    <td>{customer_email}</td>
                </tr>
                <tr>
                    <td class="bold">Phone:</td>
                    <td>{customer_phone}</td>
                </tr>
            </table>
        </div>

        <!-- Reference -->
        <div class="section">
            <div class="section-title">REFERENCE:</div>
            <table style="width: 100%;">
                {f'<tr><td style="width: 20%;" class="bold">PI No:</td><td>{pi_no}</td></tr>' if pi_no else ''}
                {f'<tr><td class="bold">Quotation No:</td><td>{quotation_no}</td></tr>' if quotation_no else ''}
                {f'<tr><td class="bold">Order No:</td><td>{order_no}</td></tr>' if order_no else ''}
            </table>
        </div>

        <!-- Payment Summary -->
        <div class="section">
            <div class="section-title">PAYMENT SUMMARY:</div>
            <div class="amount-box">
                <table style="width: 100%;">
                    <tr>
                        <td style="width: 60%;" class="bold">Total Amount:</td>
                        <td class="right bold">{currency} {total_amount:,.2f}</td>
                    </tr>
                    {f'''
                    <tr>
                        <td class="bold">Deposit Received ({deposit_date}):</td>
                        <td class="right">{currency} {deposit_amount:,.2f}</td>
                    </tr>
                    ''' if deposit_amount > 0 else ''}
                    <tr>
                        <td class="bold" style="border-top: 2px solid #000; padding-top: 10px; font-size: 14pt;">Balance Due:</td>
                        <td class="right highlight" style="border-top: 2px solid #000; padding-top: 10px; font-size: 14pt;">{currency} {balance_due:,.2f}</td>
                    </tr>
                </table>
            </div>
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

        <!-- Terms & Remarks -->
        <div class="section" style="margin-top: 20px;">
            <div class="section-title">TERMS & REMARKS:</div>
            <table style="width: 100%;">
                <tr>
                    <td style="width: 30%;" class="bold">Payment Terms:</td>
                    <td>{payment_terms}</td>
                </tr>
            </table>
            {f'''
            <div style="margin-top: 15px; font-size: 10pt; white-space: pre-line;">{remarks}</div>
            ''' if remarks else ''}
        </div>

        <!-- Contact -->
        <div class="section" style="margin-top: 30px; padding: 10px; background: #f9f9f9; border: 1px solid #ddd;">
            <p style="margin: 0;"><strong>For any questions regarding this payment notice, please contact:</strong></p>
            <p style="margin: 5px 0 0 0; font-size: 10pt;">
                Email: {company_email} | Tel: {company_phone}
            </p>
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
        description='生成收款通知 (Payment Notice)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例:
  # 从 JSON 数据生成收款通知
  python3 generate_payment_notice.py --data payment_data.json --output PN-20260327-001.html
  
  # 快速测试
  python3 generate_payment_notice.py --output test.html --quick-test
  
  # 在浏览器打开
  open PN-20260327-001.html
        '''
    )
    
    parser.add_argument('--data', '-d', help='收款通知数据 JSON 文件路径')
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
                    'phone': '+86-755-8888-9999'
                },
                'notice': {
                    'notice_no': 'PN-20260327-001',
                    'date': '2026-03-27',
                    'due_date': '2026-04-10'
                },
                'reference': {
                    'pi_no': 'PI-20260327-001'
                },
                'payment': {
                    'total_amount': 8600.00,
                    'currency': 'USD',
                    'deposit_amount': 2580.00,
                    'deposit_date': '2026-03-20',
                    'balance_due': 6020.00
                },
                'terms': {
                    'payment_terms': 'T/T 30% deposit, 70% before shipment',
                    'remarks': '1. Please arrange payment before the due date.\\n2. Send payment slip to your-email.\\n3. Goods will be shipped after payment confirmation.'
                }
            }
        
        if not args.data and not args.quick_test:
            print("❌ 请提供 --data 或 --quick-test", file=sys.stderr)
            sys.exit(1)
        
        output = generate_payment_notice_html(args.output, data)
        print(f"✅ 收款通知已生成：{output}")
        
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
