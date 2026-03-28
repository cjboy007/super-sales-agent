#!/usr/bin/env python3
"""
环境检查脚本

检查所有依赖是否已正确配置

使用方式：
python3 scripts/check-env.py
"""

import sys
import os
import subprocess
from pathlib import Path

# 颜色输出
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def print_header(text):
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")

def print_success(text):
    print(f"{Colors.GREEN}✅ {text}{Colors.RESET}")

def print_error(text):
    print(f"{Colors.RED}❌ {text}{Colors.RESET}")

def print_warning(text):
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.RESET}")

def check_python_version():
    """检查 Python 版本"""
    print_header("1. Python 版本")
    
    version = sys.version_info
    if version.major >= 3 and version.minor >= 7:
        print_success(f"Python {version.major}.{version.minor}.{version.micro}")
        return True
    else:
        print_error(f"Python 版本过低：{version.major}.{version.minor}.{version.micro}")
        print("需要 Python 3.7 或更高版本")
        return False

def check_nodejs():
    """检查 Node.js"""
    print_header("2. Node.js")
    
    try:
        result = subprocess.run(['node', '--version'], capture_output=True, text=True)
        version = result.stdout.strip()
        print_success(f"Node.js {version}")
        return True
    except FileNotFoundError:
        print_error("Node.js 未安装")
        print("请安装 Node.js: https://nodejs.org/")
        return False

def check_python_packages():
    """检查 Python 依赖包"""
    print_header("3. Python 依赖包")
    
    required_packages = {
        'openpyxl': 'Excel 处理',
        'python-docx': 'Word 处理'
    }
    
    all_installed = True
    
    for package, description in required_packages.items():
        try:
            __import__(package.replace('-', '_'))
            print_success(f"{package} - {description}")
        except ImportError:
            print_error(f"{package} - {description} - 未安装")
            print(f"   安装命令：pip3 install {package}")
            all_installed = False
    
    return all_installed

def check_chrome():
    """检查 Google Chrome"""
    print_header("4. Google Chrome (PDF 导出)")
    
    chrome_paths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',  # macOS
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',  # Windows
        '/usr/bin/google-chrome'  # Linux
    ]
    
    for chrome_path in chrome_paths:
        if os.path.exists(chrome_path):
            print_success(f"Google Chrome 已安装")
            print(f"   路径：{chrome_path}")
            return True
    
    print_warning("Google Chrome 未找到")
    print("PDF 导出功能将不可用")
    print("建议安装 Google Chrome")
    return False

def check_okki_client():
    """检查 OKKI 客户端"""
    print_header("5. OKKI 客户端")
    
    okki_client_path = Path(__file__).parent.parent / 'xiaoman-okki' / 'api' / 'okki_client.py'
    
    if okki_client_path.exists():
        print_success(f"OKKI 客户端已安装")
        print(f"   路径：{okki_client_path}")
        
        # 检查 API 凭证
        env_vars = ['OKKI_API_KEY', 'OKKI_API_SECRET']
        missing_vars = [var for var in env_vars if not os.environ.get(var)]
        
        if missing_vars:
            print_warning(f"缺少环境变量：{', '.join(missing_vars)}")
            print("OKKI 集成功能将不可用")
        else:
            print_success("OKKI API 凭证已配置")
        
        return True
    else:
        print_warning("OKKI 客户端未找到")
        print("OKKI 集成功能将不可用")
        print(f"预期路径：{okki_client_path}")
        return False

def check_bank_config():
    """检查银行配置文件"""
    print_header("6. 银行配置文件")
    
    bank_config_path = Path(__file__).parent.parent / 'config' / 'bank-accounts.json'
    
    if bank_config_path.exists():
        print_success(f"银行配置文件已存在")
        print(f"   路径：{bank_config_path}")
        
        # 检查文件内容
        try:
            import json
            with open(bank_config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            if config.get('primary') and config['primary'].get('active'):
                print_success("主要银行账户已配置并激活")
                print(f"   银行：{config['primary'].get('bank_name', 'N/A')}")
            else:
                print_warning("主要银行账户未激活")
            
            return True
        except Exception as e:
            print_error(f"配置文件格式错误：{e}")
            return False
    else:
        print_error("银行配置文件不存在")
        print(f"预期路径：{bank_config_path}")
        return False

def check_workspace_structure():
    """检查工作区结构"""
    print_header("7. 工作区结构")
    
    required_dirs = [
        'skills/quotation-workflow',
        'skills/pi-workflow',
        'skills/sample-workflow',
        'skills/payment-notice-workflow',
        'config',
        'output',
        'data'
    ]
    
    all_exist = True
    base_path = Path(__file__).parent.parent
    
    for dir_path in required_dirs:
        full_path = base_path / dir_path
        if full_path.exists():
            print_success(f"{dir_path}")
        else:
            print_error(f"{dir_path} - 不存在")
            all_exist = False
    
    return all_exist

def main():
    print(f"\n{Colors.BOLD}文档生成系统 - 环境检查{Colors.RESET}")
    print(f"检查时间：{subprocess.run(['date'], capture_output=True, text=True).stdout.strip()}")
    
    results = []
    
    # 执行所有检查
    results.append(("Python 版本", check_python_version()))
    results.append(("Node.js", check_nodejs()))
    results.append(("Python 依赖包", check_python_packages()))
    results.append(("Google Chrome", check_chrome()))
    results.append(("OKKI 客户端", check_okki_client()))
    results.append(("银行配置文件", check_bank_config()))
    results.append(("工作区结构", check_workspace_structure()))
    
    # 总结
    print_header("检查总结")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    print(f"通过：{passed}/{total}")
    
    if passed == total:
        print_success("\n🎉 所有检查通过！系统已就绪")
        print("\n可以开始使用：")
        print("  node scripts/generate-document.js --type pi --data data/customer.json --output PI-001")
        return 0
    else:
        print_error("\n⚠️  部分检查未通过")
        print("请根据上述提示修复问题")
        return 1

if __name__ == '__main__':
    sys.exit(main())
