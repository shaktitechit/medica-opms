import re

files_to_modify = [
    r"c:\Users\Dell\Desktop\medica\frontend\src\components\portal\admin\order\ListAdminOrdersPage.tsx",
    r"c:\Users\Dell\Desktop\medica\frontend\src\components\portal\finance\order\ListFinanceOrdersPage.tsx",
    r"c:\Users\Dell\Desktop\medica\frontend\src\components\portal\dispatch\order\ListDispatchOrdersPage.tsx"
]

def clean_file(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Remove the Assigned Staff HTML block
    # Matches {/* Assigned Staff */} ... </div> matching nesting
    assigned_staff_pattern = re.compile(
        r'\{\/\*\s*Assigned Staff\s*\*\/\}[\s\S]*?\{\/\*\s*Status Dimensions Grid\s*\*\/\}',
        re.DOTALL
    )
    
    # We want to replace it directly with the Status Dimensions Grid comment start
    content, count = assigned_staff_pattern.subn('{/* Status Dimensions Grid */}', content)
    if count > 0:
        print(f"Removed Assigned Staff block from {file_path}")
    else:
        # Fallback search if comments are slightly different
        fallback_pattern = re.compile(
            r'<div className="flex flex-col text-xs text-slate-500 dark:text-slate-400 min-w-\[160px\]">.*?</div>',
            re.DOTALL
        )
        content, count2 = fallback_pattern.subn('', content)
        if count2 > 0:
            print(f"Removed Assigned Staff block (fallback) from {file_path}")
        else:
            print(f"Warning: Assigned Staff block not found in {file_path}")

    # 2. Remove unused resolveUserDisplay declarations
    content = re.sub(r'const assignedAdminName = resolveUserDisplay\(.*?\);\s*', '', content)
    content = re.sub(r'const assignedFinanceName = resolveUserDisplay\(.*?\);\s*', '', content)
    content = re.sub(r'const assignedSalesName = resolveUserDisplay\(.*?\);\s*', '', content)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

for p in files_to_modify:
    clean_file(p)
