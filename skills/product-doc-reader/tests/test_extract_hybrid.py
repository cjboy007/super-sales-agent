import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "extract_hybrid.py"
spec = importlib.util.spec_from_file_location("extract_hybrid", SCRIPT_PATH)
extract_hybrid = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(extract_hybrid)


SAMPLE_TEXT = """
珠海福睿电子 FARREACH
DRAWING NO. 599-028
MODEL NO.
5001-131A

客人品名 CUSTOMER ITEM        长度             包装规范
HDMI2CABLE4K6030F             9144+50          BJ0599-0053
HDMI2CABLE4K6010M             10000+50         BJ0599-0055

NO.  部件名称      规格                         用量
①    CABLE         HDMI2 4K60 30AWG BLACK       M
②    PLUG          HDMI GOLD PLATED             PCS
③    SHELL         PVC BLACK                    PCS
"""


class ExtractHybridTest(unittest.TestCase):
    def test_loads_default_config_and_detects_template(self):
        config = extract_hybrid.load_config(None)

        self.assertEqual(config["format"], "both")
        self.assertEqual(config["confidence_threshold"], 80)
        self.assertEqual(extract_hybrid.detect_template(SAMPLE_TEXT, config)["id"], "farreach_599")

        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json") as f:
            json.dump({"format": "json", "confidence_threshold": 88}, f)
            f.flush()
            override = extract_hybrid.load_config(f.name)

        self.assertEqual(override["format"], "json")
        self.assertEqual(override["confidence_threshold"], 88)
        self.assertEqual(override["vision"]["model"], config["vision"]["model"])

    def test_text_only_extracts_core_fields_without_vision(self):
        config = extract_hybrid.load_config(None)

        with mock.patch.object(extract_hybrid, "extract_text_with_pdftotext", return_value=SAMPLE_TEXT), \
             mock.patch.object(extract_hybrid, "pdf_to_images") as pdf_to_images, \
             mock.patch.object(extract_hybrid, "call_vision_api") as call_vision:
            result = extract_hybrid.extract_hybrid(
                "599-028.pdf",
                use_vision=True,
                use_text=True,
                config=config,
                dpi=144,
            )

        self.assertEqual(result["model_no"], "5001-131A")
        self.assertEqual(result["drawing_no"], "599-028")
        self.assertIn("BJ0599-0053", result["packaging_spec"])
        self.assertEqual(len(result["bom"]), 3)
        self.assertEqual(
            [product["customer_item"] for product in result["products"]],
            ["HDMI2CABLE4K6030F", "HDMI2CABLE4K6010M"],
        )
        self.assertGreaterEqual(result["confidence"], 80)
        self.assertEqual(result["extraction_method"], "pdftotext")
        self.assertFalse(pdf_to_images.called)
        self.assertFalse(call_vision.called)

    def test_calls_vision_when_text_result_is_low_confidence_and_caches(self):
        config = extract_hybrid.load_config(None)
        low_text = "MODEL NO. 5001-131A"
        vision_result = {
            "product_name": "HDMI2CABLE4K6030F",
            "model_no": "5001-131A",
            "drawing_no": "599-028",
            "packaging_spec": "BJ0599-0053",
            "bom": [{"no": "1", "part_name": "CABLE", "spec": "HDMI", "quantity": "M"}],
            "products": [{"customer_item": "HDMI2CABLE4K6030F", "length_mm": "9144+50", "packaging_spec": "BJ0599-0053"}],
        }

        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "599-028.pdf"
            pdf_path.write_bytes(b"%PDF test")
            cache_dir = Path(tmp) / "cache"
            config["cache_dir"] = str(cache_dir)

            with mock.patch.object(extract_hybrid, "extract_text_with_pdftotext", return_value=low_text), \
                 mock.patch.object(extract_hybrid, "pdf_to_images", return_value=[str(pdf_path)]), \
                 mock.patch.object(extract_hybrid, "_call_openrouter", return_value=vision_result) as provider_call:
                first = extract_hybrid.extract_hybrid(str(pdf_path), config=config)
                second = extract_hybrid.extract_hybrid(str(pdf_path), config=config)

        self.assertEqual(first["extraction_method"], "hybrid")
        self.assertEqual(second["product_name"], "HDMI2CABLE4K6030F")
        self.assertEqual(provider_call.call_count, 1)

    def test_vision_only_uses_custom_dpi(self):
        config = extract_hybrid.load_config(None)
        vision_result = {
            "product_name": "HDMI2CABLE4K6030F",
            "model_no": "5001-131A",
            "drawing_no": "599-028",
            "packaging_spec": "BJ0599-0053",
            "bom": [{"no": "1", "part_name": "CABLE", "spec": "HDMI", "quantity": "M"}],
        }

        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "599-028.pdf"
            pdf_path.write_bytes(b"%PDF test")
            with mock.patch.object(extract_hybrid, "pdf_to_images", return_value=[str(pdf_path)]) as pdf_to_images, \
                 mock.patch.object(extract_hybrid, "_call_openrouter", return_value=vision_result):
                result = extract_hybrid.extract_hybrid(
                    str(pdf_path),
                    use_vision=True,
                    use_text=False,
                    config=config,
                    dpi=180,
                    no_cache=True,
                )

        self.assertEqual(result["extraction_method"], "vision")
        self.assertEqual(result["drawing_no"], "599-028")
        self.assertEqual(pdf_to_images.call_args.kwargs["dpi"], 180)

    def test_vision_requires_openrouter_key_without_hardcoded_fallback(self):
        config = extract_hybrid.load_config(None)

        with mock.patch.dict("os.environ", {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "OPENROUTER_API_KEY"):
                extract_hybrid._call_openrouter(["abc"], config["vision"]["model"])


if __name__ == "__main__":
    unittest.main()
