#!/usr/bin/env python3
"""
报价单数据验证模块
验证客户数据、产品数据、报价单编号等
"""

import re
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class ValidationError:
    """验证错误"""
    field: str
    message: str
    value: Optional[str] = None


@dataclass
class ValidationResult:
    """验证结果"""
    is_valid: bool
    errors: List[ValidationError]
    
    def has_error(self) -> bool:
        return not self.is_valid
    
    def error_messages(self) -> List[str]:
        return [e.message for e in self.errors]


class QuotationValidator:
    """报价单验证器"""
    
    # 示例/测试数据关键词
    EXAMPLE_KEYWORDS = [
        'example', 'test', 'sample', 'demo', 'placeholder',
        'foo', 'bar', 'baz', 'lorem ipsum'
    ]
    
    # 测试邮箱域名
    TEST_EMAIL_DOMAINS = [
        'example.com', 'test.com', 'test.org', 
        'example.org', 'demo.com', 'sample.com'
    ]
    
    # 占位符地址模式
    PLACEHOLDER_ADDRESS_PATTERNS = [
        r'^123\s',
        r'^1\s+',
        r'test\s+street',
        r'example\s+street',
        r'main\s+street',
        r'xxx\s+',
        r'\d+\s+test',
    ]
    
    # 报价单编号格式
    QUOTATION_NUMBER_PATTERN = r'^QT-\d{8}-\d{3}$'
    
    def __init__(self):
        self.errors: List[ValidationError] = []
    
    def validate(self, data: dict) -> ValidationResult:
        """验证报价单数据"""
        self.errors = []
        
        # 验证客户
        if 'customer' in data:
            self._validate_customer(data['customer'])
        
        # 验证产品
        if 'products' in data:
            self._validate_products(data['products'])
        
        # 验证报价单编号
        if 'quotation' in data:
            self._validate_quotation(data['quotation'])
        
        return ValidationResult(
            is_valid=len(self.errors) == 0,
            errors=self.errors
        )
    
    def _validate_customer(self, customer: dict):
        """验证客户信息"""
        # 公司名称
        company_name = customer.get('company_name', '')
        if self._contains_example_keyword(company_name):
            self.errors.append(ValidationError(
                field='customer.company_name',
                message='公司名称包含示例关键词，请使用真实客户名称',
                value=company_name
            ))
        
        # 邮箱
        email = customer.get('email', '')
        if self._is_test_email(email):
            self.errors.append(ValidationError(
                field='customer.email',
                message='使用测试邮箱域名，请使用真实客户邮箱',
                value=email
            ))
        
        # 地址
        address = customer.get('address', '')
        if self._is_placeholder_address(address):
            self.errors.append(ValidationError(
                field='customer.address',
                message='地址包含占位符，请使用真实客户地址',
                value=address
            ))
    
    def _validate_products(self, products: list):
        """验证产品列表"""
        if not products:
            self.errors.append(ValidationError(
                field='products',
                message='产品列表不能为空'
            ))
            return
        
        for i, product in enumerate(products):
            # 数量
            quantity = product.get('quantity', 0)
            if quantity <= 0:
                self.errors.append(ValidationError(
                    field=f'products[{i}].quantity',
                    message='产品数量必须大于 0',
                    value=str(quantity)
                ))
            
            # 价格
            unit_price = product.get('unit_price', 0)
            if unit_price <= 0:
                self.errors.append(ValidationError(
                    field=f'products[{i}].unit_price',
                    message='产品单价必须大于 0',
                    value=str(unit_price)
                ))
    
    def _validate_quotation(self, quotation: dict):
        """验证报价单信息"""
        quotation_no = quotation.get('quotation_no', '')
        if not self._is_valid_quotation_number(quotation_no):
            self.errors.append(ValidationError(
                field='quotation.quotation_no',
                message='报价单编号格式错误，应为 QT-YYYYMMDD-XXX',
                value=quotation_no
            ))
    
    def _contains_example_keyword(self, text: str) -> bool:
        """检查是否包含示例关键词"""
        text_lower = text.lower()
        return any(keyword in text_lower for keyword in self.EXAMPLE_KEYWORDS)
    
    def _is_test_email(self, email: str) -> bool:
        """检查是否是测试邮箱"""
        email_lower = email.lower()
        return any(domain in email_lower for domain in self.TEST_EMAIL_DOMAINS)
    
    def _is_placeholder_address(self, address: str) -> bool:
        """检查是否是占位符地址"""
        address_lower = address.lower()
        return any(
            re.search(pattern, address_lower) 
            for pattern in self.PLACEHOLDER_ADDRESS_PATTERNS
        )
    
    def _is_valid_quotation_number(self, number: str) -> bool:
        """验证报价单编号格式"""
        return bool(re.match(self.QUOTATION_NUMBER_PATTERN, number))


def validate_quotation(data: dict) -> ValidationResult:
    """验证报价单数据（便捷函数）"""
    validator = QuotationValidator()
    return validator.validate(data)
