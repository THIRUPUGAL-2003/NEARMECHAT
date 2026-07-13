"""
╔══════════════════════════════════════════════════════╗
║              NearMe — Project Launcher               ║
║  Starts Backend (FastAPI) + Frontend (Static Server) ║
╚══════════════════════════════════════════════════════╝

Run:
    python run.py

Stops with:  Ctrl + C
"""

import subprocess
import sys
import os
import time
import signal
import threading
import socket
import http.server
import socketserver

# ─── PORTS ────────────────────────────────────────────
BACKEND_PORT  = 8000
FRONTEND_PORT = 3000

# ─── PATHS ────────────────────────────────────────────
ROOT_DIR     = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR  = os.path.join(ROOT_DIR, "backend")
FRONTEND_DIR = os.path.join(ROOT_DIR, "frontend")
REQUIREMENTS = os.path.join(BACKEND_DIR, "requirements.txt")

# ─── COLORS ───────────────────────────────────────────
RESET  = "\033[0m"
BOLD   = "\033[1m"
CYAN   = "\033[96m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
PURPLE = "\033[95m"
BLUE   = "\033[94m"
DIM    = "\033[2m"

def clr(text, color, bold=False):
    b = BOLD if bold else ""
    return f"{b}{color}{text}{RESET}"

def banner():
    print()
    print(clr("╔══════════════════════════════════════════════════════╗", CYAN))
    print(clr("║", CYAN) + clr("          📍  NearMe — Project Launcher              ", PURPLE, bold=True) + clr("║", CYAN))
    print(clr("║", CYAN) + clr("     Backend (FastAPI) + Frontend (Static Server)    ", DIM) + clr("║", CYAN))
    print(clr("╚══════════════════════════════════════════════════════╝", CYAN))
    print()

def section(title):
    print(clr(f"\n▶  {title}", YELLOW, bold=True))
    print(clr("─" * 54, DIM))

def ok(msg):
    print(clr("  ✔  ", GREEN, bold=True) + msg)

def info(msg):
    print(clr("  ℹ  ", BLUE) + msg)

def warn(msg):
    print(clr("  ⚠  ", YELLOW) + msg)

def err(msg):
    print(clr("  ✖  ", RED, bold=True) + msg)

# ─── PORT CHECK ───────────────────────────────────────
def port_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) != 0

# ─── INSTALL DEPS ─────────────────────────────────────
def install_dependencies():
    section("Installing Backend Dependencies")
    if not os.path.exists(REQUIREMENTS):
        warn("requirements.txt not found — skipping pip install.")
        return
    info(f"Reading {REQUIREMENTS}")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", REQUIREMENTS, "-q"],
        capture_output=True,
        text=True
    )
    if result.returncode == 0:
        ok("All packages installed / up to date.")
    else:
        warn("Some packages may have failed to install:")
        print(clr(result.stderr[:600], RED))

# ─── STREAM PROCESS OUTPUT ────────────────────────────
def stream(proc, prefix, color):
    """Read lines from a process and print with a colored prefix."""
    for line in iter(proc.stdout.readline, ""):
        stripped = line.rstrip()
        if stripped:
            print(f"{clr(prefix, color, bold=True)} {stripped}")
    proc.stdout.close()

def stream_stderr(proc, prefix, color):
    for line in iter(proc.stderr.readline, ""):
        stripped = line.rstrip()
        if stripped:
            print(f"{clr(prefix, color, bold=True)} {clr(stripped, DIM)}")
    proc.stderr.close()

# ─── FRONTEND STATIC SERVER ───────────────────────────
class SilentHandler(http.server.SimpleHTTPRequestHandler):
    """Serve frontend files silently (suppress request logs)."""
    def log_message(self, format, *args):
        pass  # suppress per-request logs

def run_frontend_server():
    os.chdir(FRONTEND_DIR)
    with socketserver.TCPServer(("", FRONTEND_PORT), SilentHandler) as httpd:
        httpd.serve_forever()

# ─── MAIN ─────────────────────────────────────────────
processes = []

def cleanup(signum=None, frame=None):
    print()
    print(clr("\n  🛑  Shutting down NearMe servers…", YELLOW, bold=True))
    for p in processes:
        try:
            p.terminate()
        except Exception:
            pass
    print(clr("  👋  All servers stopped. Goodbye!\n", GREEN))
    sys.exit(0)

signal.signal(signal.SIGINT,  cleanup)
signal.signal(signal.SIGTERM, cleanup)

def main():
    banner()

    # ── Install dependencies ──────────────────────────
    install_dependencies()

    # ── Port availability checks ──────────────────────
    section("Checking Ports")
    for port, name in [(BACKEND_PORT, "Backend"), (FRONTEND_PORT, "Frontend")]:
        if port_free(port):
            ok(f"Port {port} is free  ({name})")
        else:
            warn(f"Port {port} already in use! Trying to continue anyway… ({name})")

    # ── Start Backend ─────────────────────────────────
    section("Starting Backend  (FastAPI + Uvicorn)")
    if not os.path.exists(BACKEND_DIR):
        err(f"Backend directory not found: {BACKEND_DIR}")
        sys.exit(1)

    backend_proc = subprocess.Popen(
        [
            sys.executable, "-m", "uvicorn",
            "main:app",
            "--host", "0.0.0.0",
            "--port", str(BACKEND_PORT),
            "--reload",
        ],
        cwd=BACKEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    processes.append(backend_proc)
    ok(f"Backend process started  (PID: {backend_proc.pid})")

    # Stream backend output in background threads
    threading.Thread(
        target=stream,
        args=(backend_proc, "[BACKEND]", BLUE),
        daemon=True
    ).start()
    threading.Thread(
        target=stream_stderr,
        args=(backend_proc, "[BACKEND]", BLUE),
        daemon=True
    ).start()

    # Give uvicorn a moment to boot
    time.sleep(2)

    # ── Start Frontend ────────────────────────────────
    section("Starting Frontend  (Static File Server)")
    if not os.path.exists(FRONTEND_DIR):
        err(f"Frontend directory not found: {FRONTEND_DIR}")
        sys.exit(1)

    frontend_thread = threading.Thread(target=run_frontend_server, daemon=True)
    frontend_thread.start()
    ok(f"Frontend server started  (Thread)")

    # Give it a moment
    time.sleep(1)

    # ── Print URLs ────────────────────────────────────
    print()
    print(clr("╔══════════════════════════════════════════════════════╗", GREEN))
    print(clr("║", GREEN) + clr("            🚀  NearMe is Running!                   ", GREEN, bold=True) + clr("║", GREEN))
    print(clr("╠══════════════════════════════════════════════════════╣", GREEN))
    print(clr("║", GREEN) + f"  🌐  Frontend  →  {clr(f'http://localhost:{FRONTEND_PORT}', CYAN, bold=True):<40}" + clr("   ║", GREEN))
    print(clr("║", GREEN) + f"  ⚡  Backend   →  {clr(f'http://localhost:{BACKEND_PORT}', CYAN, bold=True):<40}" + clr("   ║", GREEN))
    print(clr("║", GREEN) + f"  📄  API Docs  →  {clr(f'http://localhost:{BACKEND_PORT}/docs', CYAN, bold=True):<40}" + clr("   ║", GREEN))
    print(clr("║", GREEN) + f"  ❤️   Health    →  {clr(f'http://localhost:{BACKEND_PORT}/healthz', CYAN, bold=True):<40}" + clr("   ║", GREEN))
    print(clr("╠══════════════════════════════════════════════════════╣", GREEN))
    print(clr("║", GREEN) + clr("  Press  Ctrl + C  to stop all servers               ", DIM) + clr("║", GREEN))
    print(clr("╚══════════════════════════════════════════════════════╝", GREEN))
    print()

    # ── Keep alive ────────────────────────────────────
    try:
        while True:
            # Check if backend crashed
            if backend_proc.poll() is not None:
                err("Backend process exited unexpectedly!")
                cleanup()
            time.sleep(3)
    except KeyboardInterrupt:
        cleanup()

if __name__ == "__main__":
    main()
