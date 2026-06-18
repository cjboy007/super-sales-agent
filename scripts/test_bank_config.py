import importlib.util
import json
import os
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parent / "bank_config.py"
spec = importlib.util.spec_from_file_location("bank_config", SCRIPT_PATH)
bank_config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bank_config)


def write_bank_config(path, bank_name):
    path.write_text(json.dumps({
        "primary": {
            "beneficiary": "Test Company",
            "bank_name": bank_name,
            "account_no": "TEST-001",
            "swift_code": "TESTSWIFT",
            "active": True,
        }
    }), encoding="utf-8")


def test_bank_config_reloads_when_file_changes(tmp_path):
    bank_path = tmp_path / "bank-accounts.json"
    old_path = os.environ.get("SSA_BANK_ACCOUNTS_PATH")
    try:
        os.environ["SSA_BANK_ACCOUNTS_PATH"] = str(bank_path)
        write_bank_config(bank_path, "FIRST BANK")
        assert bank_config.get_primary_bank()["bank_name"] == "FIRST BANK"

        write_bank_config(bank_path, "SECOND BANK")
        assert bank_config.get_primary_bank()["bank_name"] == "SECOND BANK"
    finally:
        bank_config.reload_config()
        if old_path is None:
            os.environ.pop("SSA_BANK_ACCOUNTS_PATH", None)
        else:
            os.environ["SSA_BANK_ACCOUNTS_PATH"] = old_path
