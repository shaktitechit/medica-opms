import re

files_to_fix = [
    r"c:\Users\Dell\Desktop\medica\frontend\src\components\portal\admin\order\ListAdminOrdersPage.tsx",
    r"c:\Users\Dell\Desktop\medica\frontend\src\components\portal\finance\order\ListFinanceOrdersPage.tsx",
    r"c:\Users\Dell\Desktop\medica\frontend\src\components\portal\dispatch\order\ListDispatchOrdersPage.tsx"
]

def fix_file(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Find the hook call block and state declaration block
    # We want to move the hook declarations after the state declarations
    hook_pattern = r"(  const \{ data, isFetching, isError, refetch \} = useListOrdersQuery\([\s\S]*?\);\s*const partiesQ = useListPartiesQuery\(\{\}\);\s*const usersQ = useListUsersQuery\(\{\}\);)"
    state_pattern = r"(  // Search & Filter State\s*const \[searchQuery, setSearchQuery\] = useState\(\"\"\);\s*const \[statusFilter, setStatusFilter\] = useState\(\"all\"\);\s*const \[priorityFilter, setPriorityFilter\] = useState\(\"all\"\);)"

    hook_match = re.search(hook_pattern, content)
    state_match = re.search(state_pattern, content)

    if hook_match and state_match:
        hook_text = hook_match.group(1)
        state_text = state_match.group(1)
        
        # Remove original blocks and place them in the correct order
        # First state declarations, then hook calls
        temp_content = content.replace(hook_text, "PLACEHOLDER_HOOK")
        temp_content = temp_content.replace(state_text, "PLACEHOLDER_STATE")
        
        temp_content = temp_content.replace("PLACEHOLDER_HOOK", "")
        # Replace PLACEHOLDER_STATE with state declarations followed by hook declarations
        new_block = state_text + "\n\n" + hook_text
        content = temp_content.replace("PLACEHOLDER_STATE", new_block)
        
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Successfully rearranged hooks and states in {file_path}")
    else:
        print(f"Error: Could not find hook or state patterns in {file_path}")

for p in files_to_fix:
    fix_file(p)
