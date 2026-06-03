"""Upload speed tests — run locally against deployed NAS.
Auth uses HttpOnly cookies, not bearer tokens."""
import subprocess, json, time, os, tempfile

NAS = "http://192.168.3.21:5173"
COOKIE_JAR = os.path.join(tempfile.gettempdir(), "speedtest_cookies.txt")
EMAIL = "thrient@petalmail.com"
PASSWORD = "21a.@YXW"


def login():
    """Login via cookie-based auth. Returns the cookie jar path."""
    r = subprocess.run(
        ["curl", "-s", "-c", COOKIE_JAR,
         "-X", "POST", f"{NAS}/api/v1/auth/login",
         "-H", "Content-Type: application/json",
         "-d", json.dumps({"email": EMAIL, "password": PASSWORD})],
        capture_output=True, text=True,
    )
    resp = json.loads(r.stdout)
    assert resp.get("code") == 0, f"Login failed: {r.stdout[:200]}"
    print(f"Login OK: {resp['data']['username']} ({resp['data']['email']})")
    return COOKIE_JAR


def make_test_file(path, size_mb):
    """Create a file with random content of given size."""
    with open(path, "wb") as f:
        f.write(os.urandom(size_mb * 1024 * 1024))


def test_upload_speed():
    cookie = login()

    sizes = {"1MB": 1, "5MB": 5}

    for label, mb in sizes.items():
        fpath = os.path.join(tempfile.gettempdir(), f"speedtest_{label}.bin")
        if not os.path.exists(fpath):
            make_test_file(fpath, mb)

        print(f"\n--- {label} Direct Upload (Local Network) ---")
        times = []
        for run_idx in range(3):
            t0 = time.monotonic()
            r = subprocess.run(
                ["curl", "-s", "-b", cookie, "-o", os.devnull,
                 "-w", "%{http_code}|%{time_total}|%{speed_upload}|%{size_upload}",
                 "-X", "POST", f"{NAS}/api/v1/uploads/direct",
                 "-F", f"file=@{fpath}"],
                capture_output=True, text=True, timeout=30,
            )
            parts = r.stdout.strip().split("|")
            code = parts[0]
            elapsed = float(parts[1])
            speed_bps = float(parts[2])
            speed_mbps = speed_bps / 1024 / 1024
            size_bytes = parts[3]
            times.append(elapsed)
            print(f"  Run{run_idx+1}: HTTP={code} Time={elapsed:.2f}s "
                  f"Speed={speed_mbps:.1f}MB/s Size={size_bytes}B")

        avg_time = sum(times) / len(times)
        avg_speed = mb / avg_time
        print(f"  Avg: {avg_time:.2f}s, {avg_speed:.1f}MB/s")

    # Batch check test
    print("\n--- Batch Check (100 hashes) ---")
    sha_list = [os.urandom(32).hex() for _ in range(100)]
    t0 = time.monotonic()
    r = subprocess.run(
        ["curl", "-s", "-b", cookie, "-X", "POST", f"{NAS}/api/v1/files/check",
         "-H", "Content-Type: application/json",
         "-d", json.dumps({"sha256": sha_list})],
        capture_output=True, text=True,
    )
    elapsed = time.monotonic() - t0
    result = json.loads(r.stdout)
    data = result.get("data", {})
    print(f"  100 hashes: {elapsed*1000:.1f}ms")
    print(f"  existing={len(data.get('existing', []))}, missing={len(data.get('missing', []))}")

    print("\n=== Done ===")
