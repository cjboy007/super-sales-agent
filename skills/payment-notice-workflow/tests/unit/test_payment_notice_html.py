#!/usr/bin/env python3

import importlib.util
import json
from pathlib import Path

import pytest


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "generate_payment_notice.py"
spec = importlib.util.spec_from_file_location("generate_payment_notice", SCRIPT_PATH)
generate_payment_notice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generate_payment_notice)


def base_notice_data():
    return {
        "customer": {
            "company_name": "Acme Components GmbH",
            "contact": "Anna Buyer",
            "email": "anna@acme.example",
            "phone": "+49 30 0000",
        },
        "notice": {
            "notice_no": "PN-20260611-001",
            "date": "2026-06-11",
            "due_date": "2026-06-20",
        },
        "reference": {
            "pi_no": "PI-20260611-001",
        },
        "payment": {
            "total_amount": 1000.00,
            "currency": "USD",
            "deposit_amount": 300.00,
            "deposit_date": "2026-06-01",
        },
    }


def test_payment_notice_defaults_to_primary_bank(tmp_path):
    output = tmp_path / "notice.html"
    bank_config = tmp_path / "bank-accounts.json"
    bank_config.write_text(json.dumps({
        "primary": {
            "beneficiary": "FARREACH ELECTRONIC CO LIMITED",
            "bank_name": "PRIMARY TEST BANK",
            "account_no": "PRIMARY-001",
            "swift_code": "PRIMARYSWIFT",
            "bank_address": "Primary Bank Address",
            "active": True,
        },
        "legacy": {
            "beneficiary": "FARREACH ELECTRONIC CO LIMITED",
            "bank_name": "HSBC Hong Kong",
            "account_no": "LEGACY-001",
            "swift_code": "LEGACYSWIFT",
            "bank_address": "Legacy Bank Address",
            "active": False,
        },
    }), encoding="utf-8")

    import os
    old_path = os.environ.get("SSA_BANK_ACCOUNTS_PATH")
    os.environ["SSA_BANK_ACCOUNTS_PATH"] = str(bank_config)
    try:
        generate_payment_notice.generate_payment_notice_html(output, base_notice_data())
    finally:
        if old_path is None:
            os.environ.pop("SSA_BANK_ACCOUNTS_PATH", None)
        else:
            os.environ["SSA_BANK_ACCOUNTS_PATH"] = old_path

    html = output.read_text(encoding="utf-8")
    assert "PRIMARY TEST BANK" in html
    assert "HSBC Hong Kong" not in html


def test_payment_notice_rejects_inconsistent_balance_due(tmp_path):
    output = tmp_path / "notice.html"
    data = base_notice_data()
    data["payment"]["balance_due"] = 999.00

    with pytest.raises(ValueError, match="balance_due"):
        generate_payment_notice.generate_payment_notice_html(output, data)
