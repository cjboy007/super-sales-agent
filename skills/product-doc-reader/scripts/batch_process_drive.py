#!/usr/bin/env python3
"""
Batch process product drawing PDFs with resume support and review splitting.

Examples:
  python3 scripts/batch_process_drive.py --input-dir ./drawings --output-dir ./output --resume
  python3 scripts/batch_process_drive.py --drive-folder-id <folder_id> --output-dir ./output --resume
"""

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
EXTRACT_SCRIPT = SCRIPT_DIR / "extract_hybrid.py"
DEFAULT_STATE_FILE = ".product-doc-reader-state.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path, fallback):
    try:
        if not path.exists():
            return fallback
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_drive_files(folder_id: str) -> dict[str, str]:
    """Return {drawing_no: file_id} for PDFs in a Google Drive folder."""
    cmd = ["gog", "drive", "ls", "--parent", folder_id]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "gog drive ls failed")

    files = {}
    for line in result.stdout.splitlines():
        if ".pdf" not in line.lower():
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        file_id = parts[0]
        file_name = parts[1]
        if file_name.lower().endswith(".pdf"):
            files[Path(file_name).stem] = file_id
    return files


def download_file(file_id: str, output_path: Path) -> bool:
    """Download a Google Drive file through gog."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["gog", "drive", "download", file_id]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return False

    for line in result.stdout.splitlines():
        if line.startswith("path"):
            downloaded_path = Path(line.split("\t")[1].strip())
            shutil.move(str(downloaded_path), str(output_path))
            return True
    return False


def extract_drawing_info(pdf_path: Path, config_path: Path | None = None, no_cache: bool = False) -> dict:
    """Run the product-doc-reader extractor and return JSON data."""
    cmd = [sys.executable, str(EXTRACT_SCRIPT), str(pdf_path), "--stdout", "-f", "json"]
    if config_path:
        cmd.extend(["--config", str(config_path)])
    if no_cache:
        cmd.append("--no-cache")

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "extract_hybrid.py failed")

    try:
        return json.loads(result.stdout.strip())
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"JSON parse failed: {exc}") from exc


def is_review_item(data: dict, confidence_threshold: int) -> bool:
    return (
        float(data.get("confidence") or 0) < confidence_threshold
        or bool(data.get("needs_review"))
        or bool(data.get("warnings"))
    )


def output_stem(pdf_path: Path, data: dict) -> str:
    drawing_no = str(data.get("drawing_no") or "").strip()
    if drawing_no:
        return drawing_no.replace("/", "_")
    return pdf_path.stem


def write_outputs(data: dict, pdf_path: Path, output_dir: Path, confidence_threshold: int) -> dict:
    bucket = "review" if is_review_item(data, confidence_threshold) else "accepted"
    bucket_dir = output_dir / bucket
    bucket_dir.mkdir(parents=True, exist_ok=True)
    stem = output_stem(pdf_path, data)
    json_path = bucket_dir / f"{stem}.json"
    write_json(json_path, data)
    return {
        "bucket": bucket,
        "json_path": str(json_path),
    }


def initial_state() -> dict:
    return {
        "version": 1,
        "updated_at": now_iso(),
        "files": {},
    }


def state_key(pdf_path: Path) -> str:
    return str(pdf_path.resolve())


def find_existing_state(files_state: dict, pdf_path: Path) -> tuple[str, dict]:
    """Find state by current canonical key or older raw-path keys."""
    candidates = [
        state_key(pdf_path),
        str(pdf_path),
        str(pdf_path.absolute()),
    ]
    for candidate in candidates:
        if candidate in files_state:
            return candidate, files_state[candidate]
    return candidates[0], {}


def process_local_pdfs(
    pdf_paths: Iterable[Path],
    output_dir: Path,
    state_path: Path,
    confidence_threshold: int = 80,
    resume: bool = True,
    force: bool = False,
    config_path: Path | None = None,
    no_cache: bool = False,
) -> dict:
    """Process local PDFs, recording resumable status and accepted/review outputs."""
    output_dir.mkdir(parents=True, exist_ok=True)
    state = read_json(state_path, initial_state())
    files_state = state.setdefault("files", {})

    summary = {
        "total": 0,
        "processed": 0,
        "skipped": 0,
        "accepted": 0,
        "review": 0,
        "failed": 0,
    }

    for raw_path in pdf_paths:
        pdf_path = Path(raw_path)
        key, existing = find_existing_state(files_state, pdf_path)
        summary["total"] += 1

        if resume and not force and existing.get("status") == "success":
            summary["skipped"] += 1
            continue

        try:
            data = extract_drawing_info(pdf_path, config_path=config_path, no_cache=no_cache)
            output = write_outputs(data, pdf_path, output_dir, confidence_threshold)
            bucket = output["bucket"]
            summary["processed"] += 1
            summary[bucket] += 1
            files_state[key] = {
                "status": "success",
                "bucket": bucket,
                "output_path": output["json_path"],
                "confidence": data.get("confidence"),
                "warnings": data.get("warnings", []),
                "updated_at": now_iso(),
            }
        except Exception as exc:
            summary["failed"] += 1
            files_state[key] = {
                "status": "failed",
                "error": str(exc),
                "updated_at": now_iso(),
            }
        finally:
            state["updated_at"] = now_iso()
            write_json(state_path, state)

    write_summary_report(output_dir, summary, state)
    return summary


def write_summary_report(output_dir: Path, summary: dict, state: dict) -> Path:
    report_path = output_dir / "batch-summary.md"
    successful = [
        (path, info)
        for path, info in state.get("files", {}).items()
        if info.get("status") == "success"
    ]
    failed = [
        (path, info)
        for path, info in state.get("files", {}).items()
        if info.get("status") == "failed"
    ]
    review = [
        (path, info)
        for path, info in state.get("files", {}).items()
        if info.get("bucket") == "review"
    ]
    accepted = [
        (path, info)
        for path, info in successful
        if info.get("bucket") == "accepted"
    ]

    lines = [
        "# Product Doc Reader Batch Summary",
        "",
        f"- Updated: {state.get('updated_at', now_iso())}",
        "",
        "## Current State",
        "",
        f"- Current Success: {len(successful)}",
        f"- Current Accepted: {len(accepted)}",
        f"- Current Review: {len(review)}",
        f"- Current Failed: {len(failed)}",
        "",
        "## This Run",
        "",
        f"- Total: {summary['total']}",
        f"- Processed: {summary['processed']}",
        f"- Skipped: {summary['skipped']}",
        f"- Accepted: {summary['accepted']}",
        f"- Review: {summary['review']}",
        f"- Failed: {summary['failed']}",
        "",
        "## Review Items",
        "",
    ]
    if review:
        for path, info in review:
            reason = "; ".join(info.get("warnings", [])) or f"confidence {info.get('confidence')}"
            lines.append(f"- `{Path(path).name}`: {reason}")
    else:
        lines.append("- None")

    lines.extend(["", "## Failed Items", ""])
    if failed:
        for path, info in failed:
            lines.append(f"- `{Path(path).name}`: {info.get('error', 'unknown error')}")
    else:
        lines.append("- None")

    report_path.write_text("\n".join(lines), encoding="utf-8")
    return report_path


def collect_input_pdfs(input_dir: Path, limit: int = 0) -> list[Path]:
    pdfs = sorted(input_dir.glob("*.pdf"))
    return pdfs[:limit] if limit > 0 else pdfs


def collect_drive_pdfs(folder_id: str, temp_dir: Path, limit: int = 0) -> list[Path]:
    files = get_drive_files(folder_id)
    items = list(files.items())[:limit] if limit > 0 else list(files.items())
    pdf_paths = []
    temp_dir.mkdir(parents=True, exist_ok=True)
    for drawing_no, file_id in items:
        pdf_path = temp_dir / f"{drawing_no}.pdf"
        if pdf_path.exists() or download_file(file_id, pdf_path):
            pdf_paths.append(pdf_path)
    return pdf_paths


def main():
    parser = argparse.ArgumentParser(description="批量处理产品图纸并分离待复核结果")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input-dir", help="本地 PDF 目录")
    source.add_argument("--drive-folder-id", help="Google Drive 文件夹 ID")
    parser.add_argument("--output-dir", required=True, help="输出目录")
    parser.add_argument("--temp-dir", default=".product-doc-reader-tmp", help="Drive 下载临时目录")
    parser.add_argument("--state-file", default=None, help="断点状态文件")
    parser.add_argument("--confidence-threshold", type=int, default=80)
    parser.add_argument("--config", help="extract_hybrid 配置文件")
    parser.add_argument("--limit", type=int, default=0, help="限制处理数量（0=全部）")
    parser.add_argument("--resume", action="store_true", help="跳过已成功项目")
    parser.add_argument("--force", action="store_true", help="重新处理已成功项目")
    parser.add_argument("--no-cache", action="store_true", help="禁用 Vision 缓存")

    args = parser.parse_args()
    output_dir = Path(args.output_dir)
    state_path = Path(args.state_file) if args.state_file else output_dir / DEFAULT_STATE_FILE
    config_path = Path(args.config) if args.config else None

    if args.input_dir:
        pdf_paths = collect_input_pdfs(Path(args.input_dir), limit=args.limit)
    else:
        pdf_paths = collect_drive_pdfs(args.drive_folder_id, Path(args.temp_dir), limit=args.limit)

    summary = process_local_pdfs(
        pdf_paths,
        output_dir=output_dir,
        state_path=state_path,
        confidence_threshold=args.confidence_threshold,
        resume=args.resume or not args.force,
        force=args.force,
        config_path=config_path,
        no_cache=args.no_cache,
    )

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
