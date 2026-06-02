import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock


BATCH_PATH = Path(__file__).resolve().parents[1] / "scripts" / "batch_process_drive.py"
spec = importlib.util.spec_from_file_location("batch_process_drive", BATCH_PATH)
batch_process_drive = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(batch_process_drive)


class BatchProcessorTest(unittest.TestCase):
    def test_batch_resume_skips_success_and_splits_review_items(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            input_dir = root / "input"
            output_dir = root / "out"
            state_path = root / "state.json"
            input_dir.mkdir()
            accepted_pdf = input_dir / "599-028.pdf"
            review_pdf = input_dir / "599-029.pdf"
            skipped_pdf = input_dir / "599-030.pdf"
            for pdf in (accepted_pdf, review_pdf, skipped_pdf):
                pdf.write_bytes(b"%PDF test")
            state_path.write_text(json.dumps({
                "files": {
                    str(skipped_pdf): {"status": "success", "output_path": "already.md"}
                }
            }), encoding="utf-8")

            def fake_extract(pdf_path, *_args, **_kwargs):
                if Path(pdf_path).name == "599-029.pdf":
                    return {
                        "source_file": "599-029.pdf",
                        "drawing_no": "599-029",
                        "product_name": "Needs Review",
                        "confidence": 65,
                        "warnings": ["missing packaging"],
                        "bom": [],
                    }
                return {
                    "source_file": Path(pdf_path).name,
                    "drawing_no": Path(pdf_path).stem,
                    "product_name": "Accepted",
                    "confidence": 95,
                    "warnings": [],
                    "bom": [{"no": "1", "part_name": "CABLE", "spec": "HDMI", "quantity": "M"}],
                }

            with mock.patch.object(batch_process_drive, "extract_drawing_info", side_effect=fake_extract) as extract:
                summary = batch_process_drive.process_local_pdfs(
                    [accepted_pdf, review_pdf, skipped_pdf],
                    output_dir=output_dir,
                    state_path=state_path,
                    confidence_threshold=80,
                    resume=True,
                    force=False,
                )

            self.assertEqual(summary["processed"], 2)
            self.assertEqual(summary["skipped"], 1)
            self.assertEqual(summary["accepted"], 1)
            self.assertEqual(summary["review"], 1)
            self.assertTrue((output_dir / "accepted" / "599-028.json").exists())
            self.assertTrue((output_dir / "review" / "599-029.json").exists())
            self.assertEqual(extract.call_count, 2)

    def test_resume_report_includes_cumulative_state_counts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            input_dir = root / "input"
            output_dir = root / "out"
            state_path = output_dir / ".product-doc-reader-state.json"
            input_dir.mkdir()
            output_dir.mkdir()
            accepted_pdf = input_dir / "599-028.pdf"
            review_pdf = input_dir / "599-029.pdf"
            accepted_pdf.write_bytes(b"%PDF test")
            review_pdf.write_bytes(b"%PDF test")

            state_path.write_text(json.dumps({
                "version": 1,
                "updated_at": "2026-06-02T00:00:00+00:00",
                "files": {
                    str(accepted_pdf): {
                        "status": "success",
                        "bucket": "accepted",
                        "output_path": "accepted/599-028.json",
                    },
                    str(review_pdf): {
                        "status": "success",
                        "bucket": "review",
                        "output_path": "review/599-029.json",
                    },
                },
            }), encoding="utf-8")

            summary = batch_process_drive.process_local_pdfs(
                [accepted_pdf, review_pdf],
                output_dir=output_dir,
                state_path=state_path,
                resume=True,
                force=False,
            )

            report = (output_dir / "batch-summary.md").read_text(encoding="utf-8")
            self.assertEqual(summary["processed"], 0)
            self.assertEqual(summary["skipped"], 2)
            self.assertIn("- Current Accepted: 1", report)
            self.assertIn("- Current Review: 1", report)


if __name__ == "__main__":
    unittest.main()
