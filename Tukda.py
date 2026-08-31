#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import re
import random


# ==========================================
# SETTINGS
# ==========================================

OUTPUT_DIR = "/sdcard/folder-d"


# ==========================================
# HINDI / DEVANAGARI -> ROMAN ENGLISH
# ==========================================

def transliterate_hindi(text):

    mapping = {
        # Combined letters
        "क्ष": "ksh",
        "त्र": "tr",
        "ज्ञ": "gy",

        # Vowels
        "अ": "a",
        "आ": "aa",
        "इ": "i",
        "ई": "ee",
        "उ": "u",
        "ऊ": "oo",
        "ए": "e",
        "ऐ": "ai",
        "ओ": "o",
        "औ": "au",

        # Consonants
        "क": "k",
        "ख": "kh",
        "ग": "g",
        "घ": "gh",
        "ङ": "n",

        "च": "ch",
        "छ": "chh",
        "ज": "j",
        "झ": "jh",
        "ञ": "n",

        "ट": "t",
        "ठ": "th",
        "ड": "d",
        "ढ": "dh",
        "ण": "n",

        "त": "t",
        "थ": "th",
        "द": "d",
        "ध": "dh",
        "न": "n",

        "प": "p",
        "फ": "ph",
        "ब": "b",
        "भ": "bh",
        "म": "m",

        "य": "y",
        "र": "r",
        "ल": "l",
        "व": "v",

        "श": "sh",
        "ष": "sh",
        "स": "s",
        "ह": "h",

        # Matras
        "ा": "aa",
        "ि": "i",
        "ी": "ee",
        "ु": "u",
        "ू": "oo",
        "ृ": "ri",
        "े": "e",
        "ै": "ai",
        "ो": "o",
        "ौ": "au",

        # Other marks
        "ं": "n",
        "ः": "h",
        "ँ": "n",
        "्": "",
        "़": ""
    }

    # Long combinations first
    for old, new in sorted(
        mapping.items(),
        key=lambda x: len(x[0]),
        reverse=True
    ):
        text = text.replace(old, new)

    # Remove remaining Devanagari characters
    text = re.sub(
        r"[\u0900-\u097F]",
        "",
        text
    )

    return text


# ==========================================
# CLEAN + FORMAT NAME
# ==========================================

def clean_name(name):

    name = name.strip()

    # Underscore -> space
    name = name.replace("_", " ")

    # Hindi -> Roman English
    name = transliterate_hindi(name)

    # Remove unwanted repeated spaces
    name = re.sub(
        r"\s+",
        " ",
        name
    ).strip()

    if not name:
        return ""

    # Split into words
    words = name.split()

    # --------------------------------------
    # ONLY ONE WORD
    # Rakesh -> Rakesh Rakesh
    # Rajesh -> Rajesh Rajesh
    # --------------------------------------

    if len(words) == 1:
        words.append(words[0])

    # Capitalize each name word
    words = [
        word[0].upper() + word[1:]
        if word
        else word
        for word in words
    ]

    return " ".join(words)


# ==========================================
# READ + CLEAN INPUT
# ==========================================

def clean_file(input_file):

    seen = set()
    rows = []

    try:

        with open(
            input_file,
            "r",
            encoding="utf-8-sig"
        ) as f:

            for line in f:

                line = line.strip()

                # Empty line
                if not line:
                    continue

                # Header skip
                if line.lower() == "username|name":
                    continue

                # Split at first |
                parts = line.split("|", 1)

                if len(parts) != 2:
                    continue

                username = parts[0].strip()
                name = parts[1].strip()

                # Username empty
                if not username:
                    continue

                # ----------------------------------
                # DUPLICATE USERNAME REMOVE
                # ----------------------------------

                username_key = username.lower()

                if username_key in seen:
                    continue

                seen.add(username_key)

                # ----------------------------------
                # NAME CLEAN
                # ----------------------------------

                name = clean_name(name)

                # Agar name empty ho gaya
                if not name:
                    continue

                rows.append(
                    f"{username}|{name}"
                )

    except UnicodeDecodeError:

        print()
        print("ERROR: File UTF-8 format me nahi hai.")
        print("File ko UTF-8 me save karke dobara try karo.")
        return []

    except Exception as e:

        print()
        print("File read error:", e)
        return []

    return rows


# ==========================================
# DELETE OLD RANDOM FILES
# ==========================================

def delete_old_files():

    if not os.path.isdir(OUTPUT_DIR):
        return

    for filename in os.listdir(OUTPUT_DIR):

        if (
            filename.startswith("random(")
            and filename.endswith(").txt")
        ):

            path = os.path.join(
                OUTPUT_DIR,
                filename
            )

            try:
                os.remove(path)
            except:
                pass


# ==========================================
# SPLIT FILES
# ==========================================

def split_files(rows, number_of_files):

    # Create output folder
    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    # Delete old generated files
    delete_old_files()

    # Randomize rows
    random.shuffle(rows)

    total = len(rows)

    # Unique numbers from 1-100
    random_numbers = random.sample(
        range(1, 101),
        number_of_files
    )

    # Equal distribution
    base = total // number_of_files
    extra = total % number_of_files

    start = 0

    for i in range(number_of_files):

        size = base

        if i < extra:
            size += 1

        chunk = rows[
            start:start + size
        ]

        start += size

        number = random_numbers[i]

        output_file = os.path.join(
            OUTPUT_DIR,
            f"random({number}).txt"
        )

        try:

            with open(
                output_file,
                "w",
                encoding="utf-8"
            ) as f:

                f.write(
                    "Username|name\n"
                )

                for row in chunk:
                    f.write(
                        row + "\n"
                    )

            print(
                f"[{i + 1}/{number_of_files}] "
                f"random({number}).txt "
                f"-> {len(chunk)} lines"
            )

        except Exception as e:

            print(
                "File write error:",
                e
            )

    print()
    print("=" * 40)
    print("DONE")
    print("=" * 40)
    print(
        "Total unique usernames:",
        total
    )
    print(
        "Total files:",
        number_of_files
    )
    print(
        "Output:",
        OUTPUT_DIR
    )
    print("=" * 40)


# ==========================================
# MAIN
# ==========================================

def main():

    print()
    print("=" * 40)
    print(" USERNAME + NAME CLEANER")
    print(" DUPLICATE + HINDI + SPLITTER")
    print("=" * 40)
    print()

    # --------------------------------------
    # INPUT FILE PATH
    # --------------------------------------

    input_file = input(
        "Input file path do: "
    ).strip()

    # Remove accidental quotes
    input_file = input_file.strip(
        "\"'"
    )

    if not os.path.isfile(input_file):

        print()
        print(
            "File nahi mili:"
        )
        print(
            input_file
        )
        return

    print()
    print(
        "Input:",
        input_file
    )

    # --------------------------------------
    # CLEAN DATA
    # --------------------------------------

    print()
    print(
        "Data clean ho raha hai..."
    )

    rows = clean_file(
        input_file
    )

    if not rows:

        print()
        print(
            "Koi valid data nahi mila."
        )
        return

    print()
    print(
        "Unique usernames:",
        len(rows)
    )

    # --------------------------------------
    # ASK FILE COUNT
    # --------------------------------------

    while True:

        try:

            number_of_files = int(
                input(
                    "Kitne tukde/files banane hain? "
                ).strip()
            )

            if number_of_files < 1:

                print(
                    "1 ya usse zyada number do."
                )
                continue

            if number_of_files > 100:

                print(
                    "Maximum 100 files bana sakte ho."
                )
                continue

            if number_of_files > len(rows):

                print(
                    f"Sirf {len(rows)} "
                    "unique usernames hain."
                )
                continue

            break

        except ValueError:

            print(
                "Sirf number do, jaise: 5"
            )

    # --------------------------------------
    # SPLIT
    # --------------------------------------

    print()
    print(
        "Files ban rahi hain..."
    )
    print()

    split_files(
        rows,
        number_of_files
    )


# ==========================================
# START
# ==========================================

if __name__ == "__main__":
    main()