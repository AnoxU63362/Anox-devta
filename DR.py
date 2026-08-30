# -*- coding: utf-8 -*-

import time
from datetime import datetime

# ================= CONFIG =================
SECOND_FILE_PATH = "/sdcard/j4rv1s/insta-cookies.txt"
# ==========================================


def load_fullnames(filepath):
    fullnames = set()
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if "|" in line:
                    fullname = line.split("|")[0].strip().lower()
                    fullnames.add(fullname)
    except FileNotFoundError:
        print("SECOND file not found:", filepath)

    return fullnames


def remove_matching_from_first(first_file, second_fullnames):
    kept_lines = []
    seen_lines = set()  # exact duplicate line remove

    try:
        with open(first_file, "r", encoding="utf-8") as f:
            for line in f:
                clean = line.strip()

                # skip exact duplicate line
                if clean in seen_lines:
                    continue
                seen_lines.add(clean)

                # wrong format, keep line
                if "|" not in clean:
                    kept_lines.append(line)
                    continue

                fullname = clean.split("|")[0].strip().lower()

                # if fullname exists in second file, delete
                if fullname in second_fullnames:
                    continue

                kept_lines.append(line)

        # overwrite FIRST file
        with open(first_file, "w", encoding="utf-8") as f:
            f.writelines(kept_lines)

    except FileNotFoundError:
        print("FIRST file not found:", first_file)


# ================= MAIN =================

print("Enter FIRST file path (fullname|username):")
first_file = input().strip()

print("\nAuto cleanup started. Script will run every 5 minutes.\n")
print("Stop script using CTRL + C\n")

while True:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print("[" + now + "] Running cleanup...")

    second_fullnames = load_fullnames(SECOND_FILE_PATH)
    remove_matching_from_first(first_file, second_fullnames)

    print("Cleanup done. Waiting 5 minutes...\n")
    time.sleep(1800)  # 5 minutes