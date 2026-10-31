"""Regression tests for Intel-only macOS Mach-O compatibility inspection.

These tests execute on Ubuntu too. They mock macOS inspection commands to
verify that fat/universal binaries are NEVER accepted without checking the
actual x86_64 slice and its deployment target.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[1]


def load(name: str, relative_path: str):
    spec = importlib.util.spec_from_file_location(name, REPO / relative_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


audit = load("pressforge_macho_audit", "scripts/audit-runtime-macos.py")
stage = load("pressforge_macho_stage", "scripts/stage-runtime-macos.py")
FILE = Path("/tmp/pressforge-universal-test.dylib")


class IntelMachOVersionTests(unittest.TestCase):
    def test_audit_versions_read_x86_slice_only(self):
        commands = []

        def fake_run(*args):
            commands.append(args)
            return ("cmd LC_BUILD_VERSION\n"
                    "cmdsize 32\nplatform 1\nminos 13.0\nsdk 15.0\n")

        with patch.object(audit, "run", side_effect=fake_run):
            self.assertEqual(audit.versions(FILE), [(13, 0, 0)])
        self.assertEqual(
            commands,
            [("otool", "-arch", "x86_64", "-l", str(FILE))],
        )

    def test_audit_legacy_minimum_version(self):
        fake = ("cmd LC_VERSION_MIN_MACOSX\n"
                "cmdsize 16\nversion 13.0\nsdk 13.3\n")
        with patch.object(audit, "run", return_value=fake):
            self.assertEqual(audit.versions(FILE), [(13, 0, 0)])

    def test_stage_checks_architecture_even_for_universal_file(self):
        calls = []

        def fake_run(*args, **kwargs):
            calls.append(args)
            if args[0] == "file":
                return "Mach-O universal binary with 2 architectures"
            if args[:4] == ("otool", "-arch", "x86_64", "-l"):
                return "cmd LC_BUILD_VERSION\nminos 13.0\n"
            self.fail(f"Unexpected command: {args!r}")

        def fake_probe(args, **kwargs):
            self.assertEqual(
                args,
                ["lipo", "-verify_arch", "x86_64", str(FILE)],
            )
            return SimpleNamespace(returncode=0)

        with patch.object(stage, "run", side_effect=fake_run):
            with patch.object(stage.subprocess, "run", side_effect=fake_probe):
                stage.versions_ok(FILE)
        self.assertTrue(any(x[:4] == ("otool", "-arch", "x86_64", "-l") for x in calls))

    def test_stage_rejects_missing_intel_slice(self):
        with patch.object(stage, "run", return_value="Mach-O universal binary"):
            with patch.object(stage.subprocess, "run",
                              return_value=SimpleNamespace(returncode=1)):
                with self.assertRaises(SystemExit):
                    stage.versions_ok(FILE)

    def test_stage_rejects_newer_intel_deployment_target(self):
        def fake_run(*args, **kwargs):
            return ("Mach-O universal binary" if args[0] == "file"
                    else "cmd LC_BUILD_VERSION\nminos 14.0\n")
        with patch.object(stage, "run", side_effect=fake_run):
            with patch.object(stage.subprocess, "run",
                              return_value=SimpleNamespace(returncode=0)):
                with self.assertRaises(SystemExit):
                    stage.versions_ok(FILE)


if __name__ == "__main__":
    unittest.main()
