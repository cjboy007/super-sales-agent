#!/usr/bin/env python3
"""
PDF 转换器
使用 Chrome/Chromium 无头模式将 HTML 转换为 PDF
"""

from dataclasses import dataclass
from typing import Optional
import subprocess
import os


@dataclass
class ConversionResult:
    """转换结果"""
    success: bool
    output_path: Optional[str] = None
    error: Optional[str] = None
    skipped: bool = False  # Chrome 未安装时跳过


def convert_html_to_pdf(html_path: str, output_path: str) -> ConversionResult:
    """
    将 HTML 文件转换为 PDF
    
    Args:
        html_path: HTML 文件路径
        output_path: PDF 输出文件路径
    
    Returns:
        ConversionResult: 转换结果
    """
    try:
        # 确保输出目录存在
        output_dir = os.path.dirname(output_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
        
        # 查找 Chrome
        chrome_path = find_chrome()
        
        if not chrome_path:
            return ConversionResult(
                success=False,
                error='Chrome/Chromium 未安装',
                skipped=True
            )
        
        # 转换为 PDF
        cmd = [
            chrome_path,
            '--headless',
            '--disable-gpu',
            '--print-to-pdf=' + output_path,
            '--print-to-pdf-no-header',
            '--print-to-pdf-no-footer',
            '--paper-width=8.27',
            '--paper-height=11.69',
            '--margin-top=0.4',
            '--margin-bottom=0.4',
            '--margin-left=0.4',
            '--margin-right=0.4',
            'file://' + os.path.abspath(html_path)
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return ConversionResult(
                success=False,
                error=f'Chrome 转换失败：{result.stderr}'
            )
        
        if not os.path.exists(output_path):
            return ConversionResult(
                success=False,
                error='PDF 文件未创建'
            )
        
        return ConversionResult(
            success=True,
            output_path=output_path
        )
        
    except subprocess.TimeoutExpired:
        return ConversionResult(
            success=False,
            error='PDF 转换超时（30 秒）'
        )
    except Exception as e:
        return ConversionResult(
            success=False,
            error=str(e)
        )


def find_chrome() -> Optional[str]:
    """查找 Chrome/Chromium 路径"""
    
    chrome_paths = [
        # macOS
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        # Linux
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        # Windows
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    ]
    
    for path in chrome_paths:
        if os.path.exists(path):
            return path
    
    # 尝试 PATH 中的命令
    try:
        result = subprocess.run(
            ['which', 'google-chrome'],
            capture_output=True,
            text=True
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except:
        pass
    
    try:
        result = subprocess.run(
            ['which', 'chromium-browser'],
            capture_output=True,
            text=True
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except:
        pass
    
    return None
