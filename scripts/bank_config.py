#!/usr/bin/env python3
"""
银行账户配置管理模块

使用方式：
    from bank_config import get_primary_bank, get_bank
    
    # 获取主要银行账户
    bank = get_primary_bank()
    print(bank['beneficiary'])
    
    # 获取指定类型账户
    bank = get_bank('primary')
    
    # 重新加载配置
    from bank_config import reload_config
    reload_config()
"""

import json
import os
from pathlib import Path
from typing import Optional, Dict, Any


class BankConfig:
    """银行账户配置管理器（单例模式）"""
    
    _instance = None
    _config = None
    _config_path = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._config_path is None:
            # 查找配置文件（支持多级目录）
            possible_paths = [
                Path(__file__).parent.parent / 'config' / 'bank-accounts.json',
                Path(__file__).parent / 'config' / 'bank-accounts.json',
                Path('config') / 'bank-accounts.json',
            ]
            
            for path in possible_paths:
                if path.exists():
                    self._config_path = path
                    break
            
            if self._config_path is None:
                self._config_path = possible_paths[0]  # 默认使用第一个路径
    
    def load(self, throw_error: bool = False) -> Optional[Dict[str, Any]]:
        """
        加载配置文件
        
        Args:
            throw_error: 是否抛出错误（默认 False，返回 None）
        
        Returns:
            配置字典，加载失败时返回 None
        """
        if self._config is not None:
            return self._config
        
        try:
            with open(self._config_path, 'r', encoding='utf-8') as f:
                self._config = json.load(f)
                return self._config
        except (FileNotFoundError, json.JSONDecodeError) as e:
            error_msg = (
                f"❌ 错误：无法加载银行账户配置文件\n"
                f"路径：{self._config_path}\n"
                f"错误：{e}\n\n"
                f"请确保配置文件存在且格式正确。"
            )
            
            if throw_error:
                raise RuntimeError(error_msg) from e
            else:
                print(error_msg)
                return None
    
    def reload(self) -> Optional[Dict[str, Any]]:
        """重新加载配置（用于运行时配置更新）"""
        self._config = None
        return self.load(throw_error=True)
    
    def get_primary_bank(self, throw_error: bool = True) -> Optional[Dict[str, Any]]:
        """
        获取主要银行账户
        
        Args:
            throw_error: 是否抛出错误（默认 True）
        
        Returns:
            银行账户信息字典，失败时返回 None
        """
        config = self.load(throw_error)
        
        if not config:
            msg = '❌ 错误：未找到有效的主要银行账户配置'
            if throw_error:
                raise RuntimeError(msg)
            print(msg)
            return None
        
        if not config.get('primary') or not config['primary'].get('active'):
            msg = '❌ 错误：主要银行账户未激活或配置不完整'
            if throw_error:
                raise RuntimeError(msg)
            print(msg)
            return None
        
        return config['primary']
    
    def get_bank(self, bank_type: str = 'primary', throw_error: bool = True) -> Optional[Dict[str, Any]]:
        """
        获取指定银行账户
        
        Args:
            bank_type: 账户类型（'primary' 或 'legacy'）
            throw_error: 是否抛出错误（默认 True）
        
        Returns:
            银行账户信息字典，失败时返回 None
        """
        config = self.load(throw_error)
        
        if not config:
            msg = '❌ 错误：无法加载银行账户配置'
            if throw_error:
                raise RuntimeError(msg)
            print(msg)
            return None
        
        if bank_type not in config:
            msg = f'❌ 错误：未找到银行账户配置 "{bank_type}"'
            if throw_error:
                raise RuntimeError(msg)
            print(msg)
            return None
        
        return config[bank_type]
    
    def get_all_banks(self) -> Optional[Dict[str, Any]]:
        """获取所有银行账户配置"""
        return self.load(throw_error=False)
    
    def validate_bank_info(self, bank_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        验证银行账户信息完整性
        
        Returns:
            {'valid': bool, 'errors': list}
        """
        required = ['beneficiary', 'bank_name', 'account_no', 'swift_code']
        missing = [field for field in required if not bank_info.get(field)]
        
        if missing:
            return {
                'valid': False,
                'errors': [f'缺少必填字段：{field}' for field in missing]
            }
        
        # 验证 SWIFT 代码格式（8-11 位字母数字）
        swift = bank_info.get('swift_code', '')
        if swift and not (8 <= len(swift) <= 11 and swift.replace(' ', '').isalnum()):
            return {
                'valid': False,
                'errors': [f'SWIFT 代码格式错误：{swift}（应为 8-11 位字母数字）']
            }
        
        return {'valid': True, 'errors': []}


# 单例实例
_instance = BankConfig()


# 便捷函数
def get_primary_bank(throw_error: bool = True) -> Optional[Dict[str, Any]]:
    """获取主要银行账户"""
    return _instance.get_primary_bank(throw_error)


def get_bank(bank_type: str = 'primary', throw_error: bool = True) -> Optional[Dict[str, Any]]:
    """获取指定银行账户"""
    return _instance.get_bank(bank_type, throw_error)


def get_all_banks() -> Optional[Dict[str, Any]]:
    """获取所有银行账户配置"""
    return _instance.get_all_banks()


def reload_config() -> Optional[Dict[str, Any]]:
    """重新加载配置"""
    return _instance.reload()


def validate_bank_info(bank_info: Dict[str, Any]) -> Dict[str, Any]:
    """验证银行账户信息"""
    return _instance.validate_bank_info(bank_info)


if __name__ == '__main__':
    # 测试
    print("测试银行配置模块...")
    print("=" * 60)
    
    try:
        bank = get_primary_bank()
        if bank:
            print("✅ 银行配置加载成功:")
            print(f"  Beneficiary: {bank['beneficiary']}")
            print(f"  Bank Name: {bank['bank_name']}")
            print(f"  Account No: {bank['account_no']}")
            print(f"  SWIFT: {bank['swift_code']}")
            print(f"  Bank Address: {bank.get('bank_address', 'N/A')}")
        else:
            print("❌ 无法加载银行配置")
    except Exception as e:
        print(f"❌ 错误：{e}")
