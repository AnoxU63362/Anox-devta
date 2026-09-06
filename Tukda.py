#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import re
import random
import unicodedata


# ==========================================
# SETTINGS
# ==========================================

OUTPUT_DIR = "/sdcard/folder-d"


# ==========================================
# HINDI / DEVANAGARI -> ROMAN ENGLISH
# ==========================================

def transliterate_hindi(text):

    mapping = {
        "क्ष": "ksh",
        "त्र": "tr",
        "ज्ञ": "gy",

        "अ": "a", "आ": "aa", "इ": "i", "ई": "ee",
        "उ": "u", "ऊ": "oo", "ए": "e", "ऐ": "ai",
        "ओ": "o", "औ": "au",

        "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n",
        "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
        "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
        "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
        "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
        "य": "y", "र": "r", "ल": "l", "व": "v",
        "श": "sh", "ष": "sh", "स": "s", "ह": "h",

        "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo",
        "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",

        "ं": "n", "ः": "h", "ँ": "n",
        "्": "", "़": ""
    }

    for old, new in sorted(
        mapping.items(),
        key=lambda x: len(x[0]),
        reverse=True
    ):
        text = text.replace(old, new)

    text = re.sub(r"[\u0900-\u097F]", "", text)

    return text


# ==========================================
# REMOVE ACCENTS / SPECIAL UNICODE MARKS
# ==========================================

def normalize_unicode(text):

    text = unicodedata.normalize("NFKD", text)

    # Combining marks remove
    text = "".join(
        char for char in text
        if not unicodedata.combining(char)
    )

    return text


# ==========================================
# EXTRACT NORMAL NAME WORDS
# ==========================================

def extract_name_words(name):

    # Hindi first
    name = transliterate_hindi(name)

    # Unicode normalize
    name = normalize_unicode(name)

    # Convert fancy letters where possible
    try:
        name = name.encode(
            "ascii",
            "ignore"
        ).decode("ascii")
    except:
        pass

    # Remove quotes
    name = re.sub(
        r"""["'`“”‘’]""",
        " ",
        name
    )

    # Everything except English letters becomes space
    # This removes:
    # emojis
    # flags
    # stars
    # brackets
    # decorative symbols
    # numbers
    # underscores
    # dots
    # hyphens
    name = re.sub(
        r"[^A-Za-z]+",
        " ",
        name
    )

    # Lowercase
    name = name.lower()

    # Remove repeated spaces
    name = re.sub(
        r"\s+",
        " ",
        name
    ).strip()

    if not name:
        return []

    words = name.split()

    return words


# ==========================================
# USERNAME -> POSSIBLE NAME
# ==========================================

def username_name_words(username):

    # IMPORTANT:
    # Username itself is NEVER changed in output.
    # This function only reads it to recover a name.

    temp = username

    # Lowercase only for analysis
    temp = temp.lower()

    # Remove numbers
    temp = re.sub(
        r"\d+",
        " ",
        temp
    )

    # Separators -> spaces
    temp = re.sub(
        r"[_\-.]+",
        " ",
        temp
    )

    # Anything else -> space
    temp = re.sub(
        r"[^a-z]+",
        " ",
        temp
    )

    temp = re.sub(
        r"\s+",
        " ",
        temp
    ).strip()

    if not temp:
        return []

    words = temp.split()

    # Common prefixes that are usually not the person's name
    prefixes = {
        "mr",
        "mrs",
        "ms",
        "miss",
        "mrsh",
        "dr",
        "official",
        "real",
        "its",
        "im",
        "iam",
        "the",
        "user",
        "admin"
    }

    # Remove prefix only when there is another word
    while len(words) > 1 and words[0] in prefixes:
        words.pop(0)

    # Remove obvious generic suffixes
    suffixes = {
        "official",
        "real",
        "insta",
        "instagram",
        "fb",
        "facebook",
        "yt",
        "youtube"
    }

    while len(words) > 1 and words[-1] in suffixes:
        words.pop()

    return words


# ==========================================
# DECIDE FINAL NAME
# ==========================================

def clean_name(username, name):

    original_words = extract_name_words(name)

    username_words = username_name_words(username)

    # --------------------------------------
    # CASE 1:
    # Name contains usable words
    # --------------------------------------

    if original_words:

        # If name has 2 or more words,
        # keep first 2 meaningful words.
        #
        # Example:
        # "ankit Saini" -> ankit saini
        #
        # Decorative words are already removed.

        if len(original_words) >= 2:

            words = original_words[:2]

        else:

            words = original_words[:1]

        # ----------------------------------
        # If name is only ONE word:
        #
        # Prefer username name when it gives
        # a clear matching first name.
        # ----------------------------------

        if len(words) == 1 and username_words:

            first_name = username_words[0]

            # If the name from actual name looks
            # like the username's first part,
            # use it.
            if len(first_name) >= 2:

                # Keep the actual cleaned name.
                pass

    else:

        # ----------------------------------
        # CASE 2:
        # Name is only emoji/symbols/etc.
        #
        # Recover name from username.
        # ----------------------------------

        words = username_words[:2]

    # --------------------------------------
    # NO NAME FOUND
    # --------------------------------------

    if not words:

        return ""

    # --------------------------------------
    # If first usable name word is only 1:
    # duplicate it.
    #
    # raj -> raj raj
    # sachin -> sachin sachin
    # --------------------------------------

    if len(words) == 1:

        words.append(words[0])

    # --------------------------------------
    # Capitalization
    # --------------------------------------

    words = [
        word[0].lower() + word[1:].lower()
        for word in words
        if word
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

                line = line.rstrip("\r\n")

                if not line.strip():
                    continue

                # Header
                if line.strip().lower() == "username|name":
                    continue

                # Split ONLY at first |
                parts = line.split("|", 1)

                if len(parts) != 2:
                    continue

                # ----------------------------------
                # USERNAME EXACTLY AS IT IS
                # ----------------------------------

                username = parts[0].strip()

                name = parts[1].strip()

                if not username:
                    continue

                # ----------------------------------
                # DUPLICATE USERNAME
                # ----------------------------------

                username_key = username.lower()

                if username_key in seen:
                    continue

                seen.add(username_key)

                # ----------------------------------
                # CLEAN NAME
                # ----------------------------------

                cleaned_name = clean_name(
                    username,
                    name
                )

                # Name empty
                if not cleaned_name:
                    continue

                # ----------------------------------
                # USERNAME IS WRITTEN EXACTLY SAME
                # ----------------------------------

                rows.append(
                    f"{username}|{cleaned_name}"
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

    os.makedirs(
        OUTPUT_DIR,
        exist_ok=True
    )

    delete_old_files()

    # Randomize
    random.shuffle(rows)

    total = len(rows)

    # Unique numbers 1-100
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
    print(" EMOJI + SYMBOL + DUPLICATE CLEANER")
    print("=" * 40)
    print()

    # --------------------------------------
    # INPUT FILE
    # --------------------------------------

    input_file = input(
        "Input file path do: "
    ).strip()

    input_file = input_file.strip(
        "\"'"
    )

    if not os.path.isfile(input_file):

        print()
        print("File nahi mili:")
        print(input_file)
        return

    print()
    print("Input:", input_file)

    # --------------------------------------
    # CLEAN
    # --------------------------------------

    print()
    print("Data clean ho raha hai...")

    rows = clean_file(
        input_file
    )

    if not rows:

        print()
        print("Koi valid data nahi mila.")
        return

    print()
    print(
        "Unique usernames:",
        len(rows)
    )

    # --------------------------------------
    # FILE COUNT
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
    print("Files ban rahi hain...")
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
