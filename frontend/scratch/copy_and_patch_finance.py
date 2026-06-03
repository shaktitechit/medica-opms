import re

dispatch_path = r"c:\Users\Dell\Desktop\medica\frontend\src\components\portal\dispatch\order\ListDispatchOrdersPage.tsx"
finance_path = r"c:\Users\Dell\Desktop\medica\frontend\src\components\portal\finance\order\ListFinanceOrdersPage.tsx"

with open(dispatch_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace file name / portal type definitions
content = content.replace("DISPATCH_ORDER_STATUSES", "FINANCE_ORDER_STATUSES")
content = content.replace("ListDispatchOrdersPage", "ListFinanceOrdersPage")

# Replace assigned user variables
content = content.replace("assigned_admin_user", "assigned_finance_user")
content = content.replace("assignedAdminName", "assignedFinanceName")
content = content.replace("assigned_finance_user", "assigned_finance_user")
content = content.replace("Finance:", "Finance:") # No-op just to be sure
content = content.replace("Admin:", "Finance:")
content = content.replace("Admin", "Finance")
content = content.replace("admin", "finance")

# Replace view link
content = content.replace("dispatch/order", "finance/order")

# Replace banner colors (blue-indigo -> emerald-teal)
content = content.replace("border-blue-500/10", "border-emerald-500/10")
content = content.replace("from-blue-600/5 to-indigo-600/10", "from-emerald-600/5 to-teal-600/10")
content = content.replace("dark:from-blue-500/5 dark:to-indigo-500/5", "dark:from-emerald-500/5 dark:to-teal-500/5")
content = content.replace("bg-blue-500/10", "bg-emerald-500/10")
content = content.replace("bg-indigo-500/10", "bg-teal-500/10")

# Replace header banner text
content = content.replace("Dispatch Orders Operations", "Finance Orders Review")
content = content.replace(
    "Track pending shipping fulfillment, assign transport drivers, and supervise logistics vehicles.",
    "Audit order pricing details, verify customer credit terms, and process pending financial approvals."
)

with open(finance_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Successfully generated ListFinanceOrdersPage.tsx from ListDispatchOrdersPage.tsx template!")
