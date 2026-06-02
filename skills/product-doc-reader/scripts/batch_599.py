#!/usr/bin/env python3
"""
Compatibility entrypoint for partial 599-series batch processing.

Use the same arguments as batch_process_drive.py, for example:
  python3 scripts/batch_599.py --input-dir ./drawings --output-dir ./output --resume
"""

from batch_process_drive import main


if __name__ == "__main__":
    main()
