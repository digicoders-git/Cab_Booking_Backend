import os
import re

routes_dir = r"c:\Users\vivekvkraj\OneDrive\Desktop\CapBokkin\routes"
total_api_count = 0
file_counts = {}

# Patterns for express routes
route_pattern = re.compile(r"router\.(get|post|put|delete|patch)\s*\(")

for filename in os.listdir(routes_dir):
    if filename.endswith(".js"):
        file_path = os.path.join(routes_dir, filename)
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            matches = route_pattern.findall(content)
            count = len(matches)
            total_api_count += count
            file_counts[filename] = count

print(f"Total API Endpoints: {total_api_count}")
print("\nBreakdown by file:")
for file, count in sorted(file_counts.items(), key=lambda x: x[1], reverse=True):
    print(f"- {file}: {count}")
