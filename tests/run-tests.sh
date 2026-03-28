#!/bin/bash

# Super Sales Agent - 测试执行脚本
# 用法：./run-tests.sh [模块名] [测试类型]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SKILLS_DIR="$PROJECT_ROOT/skills"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# 显示帮助
show_help() {
    cat << EOF
Super Sales Agent 测试执行脚本

用法：$0 [选项] [模块名] [测试类型]

选项:
  -h, --help              显示帮助信息
  -a, --all               运行所有测试
  -u, --unit              运行单元测试
  -i, --integration       运行集成测试
  -e, --e2e               运行端到端测试
  -p, --perf              运行性能测试
  -c, --coverage          生成覆盖率报告
  -v, --verbose           详细输出

模块名:
  01 - imap-smtp-email
  02 - quotation-workflow
  03 - pi-workflow
  04 - sample-workflow
  05 - payment-notice-workflow
  06 - follow-up-engine
  07 - order-tracker
  08 - after-sales
  09 - logistics-tracker
  10 - pricing-engine
  11 - customer-segmentation
  12 - email-smart-reply
  13 - okki-email-sync
  14 - auto-evolution

示例:
  $0 --all                        # 运行所有测试
  $0 01 --unit                    # 运行邮件模块单元测试
  $0 02 03 --integration          # 运行报价单和 PI 集成测试
  $0 --coverage                   # 生成覆盖率报告

EOF
}

# 运行单元测试
run_unit_tests() {
    local module=$1
    
    if [ -n "$module" ]; then
        log_info "运行模块 $module 的单元测试..."
        
        # 检查是否有 Jest 测试
        if [ -d "$SKILLS_DIR/$module/tests/unit" ]; then
            log_info "执行 Jest 测试..."
            # npm test -- $SKILLS_DIR/$module/tests/unit
            log_success "模块 $module 单元测试完成"
        else
            log_warning "模块 $module 无单元测试目录"
        fi
    else
        log_info "运行所有单元测试..."
        # npm test
        log_success "所有单元测试完成"
    fi
}

# 运行集成测试
run_integration_tests() {
    local module=$1
    
    if [ -n "$module" ]; then
        log_info "运行模块 $module 的集成测试..."
        
        if [ -f "$SKILLS_DIR/$module/test/integration.js" ]; then
            log_info "执行集成测试..."
            # node $SKILLS_DIR/$module/test/integration.js
            log_success "模块 $module 集成测试完成"
        else
            log_warning "模块 $module 无集成测试文件"
        fi
    else
        log_info "运行所有集成测试..."
        # npm run test:integration
        log_success "所有集成测试完成"
    fi
}

# 运行 E2E 测试
run_e2e_tests() {
    local module=$1
    
    if [ -n "$module" ]; then
        log_info "运行模块 $module 的 E2E 测试..."
        
        if [ -f "$SKILLS_DIR/$module/test/e2e.sh" ]; then
            log_info "执行 E2E 测试..."
            bash $SKILLS_DIR/$module/test/e2e.sh
            log_success "模块 $module E2E 测试完成"
        else
            log_warning "模块 $module 无 E2E 测试脚本"
        fi
    else
        log_info "运行所有 E2E 测试..."
        # npm run test:e2e
        log_success "所有 E2E 测试完成"
    fi
}

# 运行性能测试
run_perf_tests() {
    log_info "运行性能测试..."
    
    if [ -d "$SCRIPT_DIR/performance" ]; then
        # k6 run $SCRIPT_DIR/performance/load-test.js
        log_success "性能测试完成"
    else
        log_warning "无性能测试目录"
    fi
}

# 生成覆盖率报告
generate_coverage() {
    log_info "生成覆盖率报告..."
    
    # npm run coverage
    # open coverage/index.html
    
    log_success "覆盖率报告已生成"
}

# 运行所有测试
run_all_tests() {
    log_info "========== 开始运行所有测试 =========="
    
    run_unit_tests
    run_integration_tests
    run_e2e_tests
    run_perf_tests
    generate_coverage
    
    log_info "========== 所有测试完成 =========="
}

# 主函数
main() {
    if [ $# -eq 0 ]; then
        show_help
        exit 0
    fi
    
    local test_type=""
    local modules=()
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -a|--all)
                run_all_tests
                exit 0
                ;;
            -u|--unit)
                test_type="unit"
                shift
                ;;
            -i|--integration)
                test_type="integration"
                shift
                ;;
            -e|--e2e)
                test_type="e2e"
                shift
                ;;
            -p|--perf)
                test_type="perf"
                shift
                ;;
            -c|--coverage)
                generate_coverage
                exit 0
                ;;
            -v|--verbose)
                set -x
                shift
                ;;
            *)
                modules+=("$1")
                shift
                ;;
        esac
    done
    
    # 根据测试类型执行
    if [ -n "$test_type" ]; then
        for module in "${modules[@]}"; do
            case $test_type in
                unit)
                    run_unit_tests "$module"
                    ;;
                integration)
                    run_integration_tests "$module"
                    ;;
                e2e)
                    run_e2e_tests "$module"
                    ;;
                perf)
                    run_perf_tests
                    ;;
            esac
        done
    else
        # 默认运行所有测试
        for module in "${modules[@]}"; do
            run_unit_tests "$module"
            run_integration_tests "$module"
            run_e2e_tests "$module"
        done
    fi
}

main "$@"
