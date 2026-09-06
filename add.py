import os

print("=" * 40)
print("       TXT FILE MERGER")
print("=" * 40)

# Kitni files add karni hain
while True:
    try:
        count = int(input("\nKitni files add karni hai? "))
        if count > 0:
            break
        print("1 ya usse zyada number daalo.")
    except ValueError:
        print("Sirf number daalo.")

all_data = []

# Ek-ek karke filepath lena
for i in range(1, count + 1):
    while True:
        path = input(f"\nFile {i} ka filepath daalo: ").strip()

        # Quotes hata dena agar paste karte waqt aa jaye
        path = path.strip('"').strip("'")

        if not os.path.isfile(path):
            print("❌ File nahi mili, filepath dobara daalo.")
            continue

        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                data = f.read().splitlines()

            all_data.extend(data)
            print(f"✅ File {i} add ho gayi ({len(data)} lines)")

            break

        except Exception as e:
            print(f"❌ File read nahi ho paayi: {e}")

# Empty lines hata kar output banana
all_data = [line for line in all_data if line.strip()]

output_file = "merged.txt"

with open(output_file, "w", encoding="utf-8") as f:
    f.write("\n".join(all_data))

print("\n" + "=" * 40)
print("✅ SABHI FILES MERGE HO GAYI")
print(f"📁 Output file: {output_file}")
print(f"📊 Total lines: {len(all_data)}")
print("=" * 40)
