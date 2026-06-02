import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "extract_hybrid.py"
HERMES_PDF_DIR = Path("/Users/wilson/.hermes/skills/sales/product-doc-reader/test-pdfs")
spec = importlib.util.spec_from_file_location("extract_hybrid", SCRIPT_PATH)
extract_hybrid = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(extract_hybrid)


@unittest.skipUnless(HERMES_PDF_DIR.exists(), "Hermes product-doc-reader test PDFs are not available")
class HermesPdfRegressionTest(unittest.TestCase):
    def test_599_001_extracts_reference_fields(self):
        data = extract_hybrid.extract_hybrid(
            str(HERMES_PDF_DIR / "599-001.pdf"),
            use_vision=False,
            use_text=True,
            config=extract_hybrid.load_config(None),
        )

        self.assertEqual(data["template_id"], "farreach_599")
        self.assertEqual(data["drawing_no"], "599-001")
        self.assertEqual(data["packaging_spec"], "BJ0599-0001")
        self.assertEqual(data["products"][0]["customer_item"], "GCHDMIFF")
        self.assertEqual(len(data["bom"]), 5)
        self.assertFalse(data["needs_review"])

    def test_599_030_extracts_three_products_and_bom_without_hdpe_leak(self):
        data = extract_hybrid.extract_hybrid(
            str(HERMES_PDF_DIR / "599-030.pdf"),
            use_vision=False,
            use_text=True,
            config=extract_hybrid.load_config(None),
        )

        self.assertEqual(data["template_id"], "farreach_599")
        self.assertEqual(data["drawing_no"], "599-030")
        self.assertEqual(data["model_no"], "5001-130A")
        self.assertEqual(
            [product["customer_item"] for product in data["products"]],
            ["HDMI2CABLEGRIP35F", "HDMI2CABLEGRIP15M", "HDMI2CABLEGRIP10M"],
        )
        self.assertNotIn("HDPE0", data["product_name"])
        self.assertGreaterEqual(len(data["bom"]), 7)
        self.assertGreaterEqual(data["confidence"], 80)
        self.assertFalse(data["needs_review"])


if __name__ == "__main__":
    unittest.main()
