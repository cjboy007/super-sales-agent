# Excel 需求清单生成脚本模板

当新客户询盘到达时，使用以下 Python 脚本生成三表 Excel：

```python
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill

wb = Workbook()

# 样式
header_font = Font(bold=True, size=12, color='FFFFFF')
header_fill = PatternFill(start_color='2F5496', end_color='2F5496', fill_type='solid')
header_alignment = Alignment(horizontal='center', vertical='center')
data_font = Font(size=11)
data_alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)

# Sheet 1: 客户信息
ws1 = wb.active
ws1.title = '客户信息'
client_info = [
    ('公司全称', '...'),
    ('国家', '...'),
    ('网站', '...'),
    ('联系人', '...'),
    ('邮箱', '...'),
    ('电话', '...'),
    ('2025年营收', '...'),
    ('年采购额估算', '...'),
    ('员工数', '...'),
]
for i, (label, value) in enumerate(client_info, 1):
    ws1.cell(row=i, column=1, value=label).font = Font(bold=True, size=11)
    ws1.cell(row=i, column=2, value=value).font = data_font
ws1.column_dimensions['A'].width = 18
ws1.column_dimensions['B'].width = 45

# Sheet 2: 需求清单
ws2 = wb.create_sheet('需求清单')
headers = ['类别', '型号', '产品描述', '长度', '数量', '备注']
for col, header in enumerate(headers, 1):
    cell = ws2.cell(row=1, column=col, value=header)
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = header_alignment
# 每行数据...
ws2.column_dimensions['A'].width = 15
ws2.column_dimensions['B'].width = 18
ws2.column_dimensions['C'].width = 40
ws2.column_dimensions['D'].width = 12
ws2.column_dimensions['E'].width = 12
ws2.column_dimensions['F'].width = 18

# Sheet 3: 风险评估
ws3 = wb.create_sheet('风险评估')
risk_headers = ['风险项', '等级', '说明']
for col, header in enumerate(risk_headers, 1):
    cell = ws3.cell(row=1, column=col, value=header)
    cell.font = header_font
    cell.fill = header_fill
# 每行数据...
ws3.column_dimensions['A'].width = 18
ws3.column_dimensions['B'].width = 12
ws3.column_dimensions['C'].width = 55

# 保存
wb.save('客户名_需求清单.xlsx')
```

**⚠️ 依赖：** `pip3 install openpyxl`
