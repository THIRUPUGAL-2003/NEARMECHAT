#!/usr/bin/env python3
import subprocess
import sys
import os
from datetime import datetime

# Colors for terminal output (Windows compatible)
os.system("") # Enable ANSI escape codes in Windows
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
RESET = "\033[0m"

def run_command(cmd):
    """Helper to run a system command and return output, code"""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, shell=True)
        return result.stdout.strip(), result.stderr.strip(), result.returncode
    except Exception as e:
        return "", str(e), 1

def main():
    print(f"\n{YELLOW}=================================================={RESET}")
    print(f"       NearMe GitHub Auto-Update & Push")
    print(f"{YELLOW}=================================================={RESET}\n")

    # 1. Check if Git is initialized
    if not os.path.exists(".git"):
        print(f"{RED}❌ Error: Not a Git repository. Run 'git init' first.{RESET}")
        sys.exit(1)

    # 2. Get status to see if there are changes
    stdout, stderr, code = run_command("git status --short")
    if not stdout:
        print(f"{GREEN}✅ No changes detected. Working tree is clean.{RESET}")
        sys.exit(0)

    print("Changes detected:")
    print("--------------------------------------------------")
    print(stdout)
    print("--------------------------------------------------\n")

    # 3. Add all changes
    print(f"Staging all changes...")
    _, _, code = run_command("git add -A")
    if code != 0:
        print(f"{RED}❌ Error staging changes.{RESET}")
        sys.exit(1)

    # 4. Generate/Prompt for Commit Message
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    default_msg = f"Auto-update: changes committed on {timestamp}"
    
    print(f"Enter commit message (Press Enter for auto-commit: '{default_msg}'):")
    try:
        commit_msg = input("> ").strip()
    except KeyboardInterrupt:
        print("\nOperation cancelled.")
        sys.exit(1)
        
    if not commit_msg:
        commit_msg = default_msg

    # 5. Commit
    print(f"\nCommitting changes...")
    stdout, stderr, code = run_command(f'git commit -m "{commit_msg}"')
    if code != 0:
        print(f"{RED}❌ Error committing changes: {stderr}{RESET}")
        sys.exit(1)
    print(f"{GREEN}✅ Changes committed successfully!{RESET}")

    # 6. Push to GitHub
    print(f"\nPushing to GitHub (main branch)...")
    stdout, stderr, code = run_command("git push -u origin main")
    
    if code == 0:
        print(f"\n{GREEN}=================================================={RESET}")
        print(f"{GREEN}🎉 Success! Code successfully pushed to GitHub.{RESET}")
        print(f"Render will automatically start building the new deployment.")
        print(f"{GREEN}=================================================={RESET}\n")
    else:
        print(f"\n{RED}❌ Error pushing to GitHub: {stderr}{RESET}")
        print(f"{YELLOW}Hint: Ensure your GitHub remote is set up and authentication is configured.{RESET}")
        sys.exit(1)

if __name__ == "__main__":
    main()
