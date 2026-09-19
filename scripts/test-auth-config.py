"""Guard non-secret auth defaults without syncing hosted project settings."""
from pathlib import Path
import tomllib

config = tomllib.loads(
    (Path(__file__).resolve().parents[1] / "supabase/config.toml").read_text(encoding="utf-8")
)


def check(auth, label):
    assert auth.get("enable_signup") is True, f"{label}: signup must be enabled"
    assert auth.get("minimum_password_length") == 8, f"{label}: expected 8-character minimum"
    email = auth.get("email", {})
    assert email.get("enable_signup") is True, f"{label}: email provider must be enabled"
    assert email.get("enable_confirmations") is True, f"{label}: email confirmation required"


check(config["auth"], "defaults")
for name, remote in config.get("remotes", {}).items():
    overrides = remote.get("auth", {})
    merged = config["auth"] | overrides
    merged["email"] = config["auth"]["email"] | overrides.get("email", {})
    check(merged, name)
print("Auth configuration contract passed")
