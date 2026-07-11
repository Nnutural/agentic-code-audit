from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlparse

from .models import InputSource


GIT_URL_RE = re.compile(r"^(https://|http://|git@|ssh://).+\.git/?$")
GITHUB_SHORT_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


@dataclass(frozen=True)
class RepoSpec:
    url: str
    ref: str = ""
    github_ref_path: str = ""

    @property
    def cache_key(self) -> str:
        ref = self.ref or self.github_ref_path
        return f"{self.url}\n{ref}" if ref else self.url


class TargetResolver:
    def __init__(self, workspace_root: Path):
        self.workspace_root = workspace_root.resolve()
        self.git_env = self._git_env()

    def resolve(self, target: str) -> InputSource:
        raw = target.strip()
        if not raw:
            raise ValueError("target is required")

        path = Path(raw)
        if not path.is_absolute():
            path = Path.cwd() / path
        path = path.resolve()
        if path.exists() and path.is_dir():
            return InputSource(original=raw, kind="local", local_path=str(path), workspace=str(path))

        if self._looks_like_repo(raw):
            return self._clone_or_update(raw)

        raise ValueError(f"Target directory does not exist and target is not a recognized Git repo: {raw}")

    def _looks_like_repo(self, value: str) -> bool:
        if GITHUB_SHORT_RE.match(value):
            return True
        if GIT_URL_RE.match(value):
            return True
        parsed = urlparse(value)
        return parsed.netloc.lower() in {"github.com", "www.github.com"} and bool(parsed.path.strip("/"))

    def _normalize_repo_url(self, value: str) -> str:
        return self._normalize_repo_spec(value).url

    def _normalize_repo_spec(self, value: str) -> RepoSpec:
        if GITHUB_SHORT_RE.match(value):
            return RepoSpec(f"https://github.com/{value}.git")
        parsed = urlparse(value)
        if parsed.netloc.lower() in {"github.com", "www.github.com"}:
            parts = [unquote(part) for part in parsed.path.strip("/").split("/") if part]
            if len(parts) < 2:
                return RepoSpec(value)
            owner = parts[0]
            repo = parts[1][:-4] if parts[1].endswith(".git") else parts[1]
            url = f"https://github.com/{owner}/{repo}.git"
            if len(parts) >= 4 and parts[2] in {"tree", "blob"}:
                return RepoSpec(url, github_ref_path="/".join(parts[3:]))
            return RepoSpec(url)
        return RepoSpec(value.rstrip("/"))

    def _clone_or_update(self, value: str) -> InputSource:
        spec = self._normalize_repo_spec(value)
        if not shutil.which("git"):
            raise ValueError("git is required to audit remote repositories")

        if spec.github_ref_path:
            spec = RepoSpec(spec.url, ref=self._resolve_github_ref_path(spec.url, spec.github_ref_path))

        repo_id = hashlib.sha1(spec.cache_key.encode("utf-8")).hexdigest()[:12]
        repo_dir = self.workspace_root / "repos" / repo_id
        repo_dir.parent.mkdir(parents=True, exist_ok=True)

        cloned = False
        if repo_dir.exists() and (repo_dir / ".git").exists():
            self._run_git(["git", "fetch", "--all", "--prune"], repo_dir)
            self._run_git(["git", "fetch", "--tags", "--prune"], repo_dir)
            if not self._has_tracked_changes(repo_dir):
                if spec.ref:
                    self._checkout_ref(repo_dir, spec.ref)
                else:
                    self._run_git(["git", "pull", "--ff-only"], repo_dir)
        else:
            if repo_dir.exists():
                shutil.rmtree(repo_dir)
            clone_command = ["git", "clone", "--depth", "1"]
            if spec.ref:
                clone_command.extend(["--branch", spec.ref, "--single-branch"])
            clone_command.extend([spec.url, str(repo_dir)])
            self._run_git(clone_command, Path.cwd())
            cloned = True

        commit = self._run_git(["git", "rev-parse", "HEAD"], repo_dir).strip()
        return InputSource(
            original=value,
            kind="git",
            local_path=str(repo_dir.resolve()),
            workspace=str(repo_dir.parent.resolve()),
            cloned=cloned,
            commit=commit,
        )

    def _resolve_github_ref_path(self, url: str, ref_path: str) -> str:
        requested = ref_path.strip("/")
        if requested.endswith(".git"):
            requested = requested[:-4]
        if not requested:
            raise ValueError(f"GitHub tree/blob URL does not contain a ref: {url}")
        refs_output = self._run_git(["git", "ls-remote", "--heads", "--tags", url], Path.cwd())
        refs: set[str] = set()
        for line in refs_output.splitlines():
            parts = line.split()
            if len(parts) != 2:
                continue
            ref_name = parts[1]
            if ref_name.endswith("^{}"):
                ref_name = ref_name[:-3]
            for prefix in ("refs/heads/", "refs/tags/"):
                if ref_name.startswith(prefix):
                    refs.add(ref_name[len(prefix):])
        for ref in sorted(refs, key=len, reverse=True):
            if requested == ref or requested.startswith(f"{ref}/"):
                return ref
        if "/" not in requested:
            return requested
        raise ValueError(
            "Could not resolve GitHub tree/blob ref "
            f"'{requested}' for {url}; use a repository URL plus a valid branch or tag."
        )

    def _checkout_ref(self, repo_dir: Path, ref: str) -> None:
        self._run_git(["git", "checkout", "--quiet", ref], repo_dir)
        if self._has_local_branch(repo_dir, ref):
            self._run_git(["git", "pull", "--ff-only"], repo_dir)

    def _has_local_branch(self, repo_dir: Path, ref: str) -> bool:
        proc = subprocess.run(
            ["git", "show-ref", "--verify", "--quiet", f"refs/heads/{ref}"],
            cwd=str(repo_dir),
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
            env=self.git_env,
        )
        return proc.returncode == 0

    def _run_git(self, command: list[str], cwd: Path) -> str:
        proc = subprocess.run(
            command,
            cwd=str(cwd),
            text=True,
            capture_output=True,
            timeout=300,
            check=False,
            env=self.git_env,
        )
        if proc.returncode != 0:
            detail = proc.stderr.strip() or proc.stdout.strip()
            raise ValueError(f"git command failed: {' '.join(command)}\n{detail}")
        return proc.stdout

    def _has_tracked_changes(self, repo_dir: Path) -> bool:
        status = self._run_git(
            ["git", "status", "--porcelain", "--untracked-files=no"],
            repo_dir,
        )
        return bool(status.strip())

    def _git_env(self) -> dict[str, str]:
        env = os.environ.copy()
        for key, env_names in {
            "http.proxy": ("HTTP_PROXY", "http_proxy"),
            "https.proxy": ("HTTPS_PROXY", "https_proxy"),
        }.items():
            proxy = self._read_git_config(key)
            if proxy:
                for env_name in env_names:
                    env.setdefault(env_name, proxy)
        return env

    def _read_git_config(self, key: str) -> str:
        try:
            proc = subprocess.run(
                ["git", "config", "--get", key],
                cwd=str(Path.cwd()),
                text=True,
                capture_output=True,
                timeout=10,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            return ""
        return proc.stdout.strip() if proc.returncode == 0 else ""
