#!/usr/bin/env python3

import importlib.util
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "generate_quotation_html.py"
spec = importlib.util.spec_from_file_location("generate_quotation_html", SCRIPT_PATH)
generate_quotation_html = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generate_quotation_html)


def test_quotation_html_escapes_customer_and_product_values(tmp_path):
    output = tmp_path / "quotation.html"
    generate_quotation_html.generate_html_quotation(output, {
        "company_name": "<script>alert('company')</script>",
        "customer": {
            "company_name": "<script>alert(1)</script>",
            "contact": "Buyer <img src=x onerror=alert(1)>",
            "address": "<b>Address</b>",
        },
        "products": [
            {
                "description": "<img src=x onerror=alert(1)> Cable",
                "specification": "8K, <script>alert(2)</script>",
                "quantity": 10,
                "unit_price": 1.25,
            }
        ],
        "bank_info": {
            "beneficiary": "<script>bank()</script>",
            "bank_name": "Safe Bank",
            "account_no": "123",
            "swift_code": "SAFEUS33",
        },
    })

    html = output.read_text(encoding="utf-8")
    assert "<script>alert(1)</script>" not in html
    assert "<img src=x onerror=alert(1)>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "&lt;img src=x" in html
