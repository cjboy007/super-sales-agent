#!/usr/bin/env python3
"""
review-with-sonnet.py - 使用 Sonnet 自动审阅任务

用法：python3 review-with-sonnet.py <task-id>

通过 OpenClaw RPC API spawn 子 agent 执行审阅，返回 JSON 结果。
"""

import sys
import json
import os
import subprocess

def spawn_sonnet_review(task_json: str, task_id: str) -> dict:
    """
    使用 OpenClaw sessions_spawn 创建 Sonnet 子 agent 执行审阅
    """
    review_prompt = f"""你是 Revolution 系统审阅员。请审阅以下任务的执行结果。

## 任务信息
```json
{task_json}
```

## 审阅要求

### 1. 读取所有 reference_files，理解上下文

### 2. 评估执行结果
- 是否达到 subtask 目标？
- 代码质量如何？
- 测试是否通过？

### 3. 判断 verdict
- **approve**: 执行成功，继续下一个 subtask
- **revise**: 需要修改，但不是致命错误
- **reject**: 执行完全错误，需要重新理解任务
- **complete**: 所有 subtasks 完成，任务可以结束

### 4. 输出格式（严格 JSON，不要 markdown 包裹）
{{
  "verdict": "approve|revise|reject|complete",
  "confidence": 0.0-1.0,
  "feedback": "审阅意见",
  "next_instructions": "详细的下一步执行指令（如果 verdict=approve/revise）",
  "acceptance_criteria": ["验收标准 1", "验收标准 2"],
  "risk_flags": [],
  "technical_review": "技术选型审查说明"
}}

如果 verdict 是 revise/reject，请在 feedback 中说明需要修改什么。"""

    # 使用 openclaw agent 运行 Sonnet
    cmd = [
        'openclaw', 'agent',
        '--agent', 'wilson',
        '--message', review_prompt,
        '--json',
        '--session-id', f'review-{task_id}'
    ]
    
    env = os.environ.copy()
    env['ANTHROPIC_MODEL'] = 'aiberm/claude-sonnet-4-6'
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,  # 5 分钟超时
            env=env
        )
        
        if result.returncode != 0:
            raise Exception(f"OpenClaw 命令失败：{result.stderr}")
        
        # 解析 JSON 输出 - 处理 OpenClaw 响应格式
        import re
        
        # 尝试从 payloads[0].text 中提取 JSON
        try:
            response = json.loads(result.stdout)
            if isinstance(response, dict) and 'result' in response:
                payloads = response['result'].get('payloads', [])
                if payloads and 'text' in payloads[0]:
                    text = payloads[0]['text']
                    # 提取 markdown 代码块
                    md_match = re.search(r'```json\s*([\s\S]*?)\s*```', text)
                    if md_match:
                        return json.loads(md_match.group(1))
                    # 提取 JSON
                    json_match = re.search(r'\{[\s\S]*"verdict"[\s\S]*\}', text)
                    if json_match:
                        return json.loads(json_match.group())
        except:
            pass
        
        # 尝试直接从输出中提取 JSON
        json_match = re.search(r'\{[\s\S]*"verdict"[\s\S]*\}', result.stdout)
        if json_match:
            return json.loads(json_match.group())
        
        raise Exception(f"无法解析 JSON 响应：{result.stdout[:500]}")
                
    except subprocess.TimeoutExpired:
        raise Exception("Sonnet 审阅超时（5 分钟）")
    except Exception as e:
        raise Exception(f"Sonnet 审阅失败：{str(e)}")


def main():
    if len(sys.argv) < 2:
        print("用法：python3 review-with-sonnet.py <task-id>")
        print("")
        print("示例：")
        print("  python3 review-with-sonnet.py task-015")
        sys.exit(1)
    
    task_num = sys.argv[1]
    
    # 支持两种格式：15 或 task-015
    if task_num.isdigit():
        task_id = f"task-{task_num.zfill(3)}"
    else:
        task_id = task_num
    
    tasks_dir = os.path.join(os.path.dirname(__file__), '..', 'tasks')
    task_file = os.path.join(tasks_dir, f"{task_id}.json")
    
    if not os.path.exists(task_file):
        print(f"❌ 任务不存在：{task_id}")
        sys.exit(1)
    
    with open(task_file, 'r', encoding='utf-8') as f:
        task = json.load(f)
    
    print(f"🧠 开始 Sonnet 审阅：{task_id}")
    print("=" * 50)
    
    try:
        review = spawn_sonnet_review(json.dumps(task, ensure_ascii=False), task_id)
        
        print(f"✅ 审阅完成：{review['verdict']} (置信度：{review['confidence']})")
        print("")
        print("审阅结果：")
        print(json.dumps(review, indent=2, ensure_ascii=False))
        
        # 输出 JSON 到 stdout，供调用方使用
        print("")
        print("=== JSON OUTPUT ===")
        print(json.dumps(review, ensure_ascii=False))
        
    except Exception as e:
        print(f"❌ 审阅失败：{str(e)}")
        sys.exit(1)


if __name__ == '__main__':
    main()
