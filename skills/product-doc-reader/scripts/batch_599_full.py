#!/usr/bin/env python3
"""
Compatibility entrypoint for 599-series batch processing.

The old version hard-coded local workspace paths and Google Drive file IDs. This
wrapper delegates to batch_process_drive.py so all batch runs use the same
resume, review-splitting, and reporting behavior.
"""

from batch_process_drive import main


if __name__ == "__main__":
    main()
