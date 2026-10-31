"""Offline security regression tests for pinned PHP/MariaDB source extraction."""
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/build-runtime-from-source.py"
spec = importlib.util.spec_from_file_location("pressforge_source_builder", SCRIPT)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def make_archive(filename: Path, entries: list[tuple[str, str, bytes]]) -> None:
    with tarfile.open(filename, "w") as archive:
        for name, kind, value in entries:
            member = tarfile.TarInfo(name)
            if kind == "file":
                member.size = len(value)
                archive.addfile(member, io.BytesIO(value))
            elif kind == "link":
                member.type = tarfile.SYMTYPE
                member.linkname = value.decode()
                archive.addfile(member)
            elif kind == "hardlink":
                member.type = tarfile.LNKTYPE
                member.linkname = value.decode()
                archive.addfile(member)
            elif kind == "dir":
                member.type = tarfile.DIRTYPE
                archive.addfile(member)


class SourceArchiveTests(unittest.TestCase):
    def test_extract_normal_source_tree(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = root / "sample.tar"
            make_archive(archive, [
                ("release/README.txt", "file", b"test source"),
                ("release/lib/module.c", "file", b"int main() { return 0; }"),
            ])
            output = builder.unpack(archive, root / "src")
            self.assertEqual((output / "README.txt").read_bytes(), b"test source")
            self.assertTrue((root / "src/.pressforge-extracted").is_file())
            self.assertEqual(builder.unpack(archive, root / "src"), output)

    def test_reject_parent_directory_escape(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = root / "escape.tar"
            make_archive(archive, [("../outside", "file", b"malicious")])
            with self.assertRaises(SystemExit):
                builder.unpack(archive, root / "target")
            self.assertFalse((root / "outside").exists())

    def test_reject_arbitrary_symlink(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = root / "links.tar"
            make_archive(archive, [
                ("release/escape", "link", b"../../../outside"),
                ("release/file", "file", b"test"),
            ])
            with self.assertRaises(SystemExit):
                builder.unpack(archive, root / "target")
            self.assertFalse((root / "outside").exists())

    def test_reject_hardlinks(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = root / "hardlinks.tar"
            make_archive(archive, [("release/redirect", "hardlink", b"../outside")])
            with self.assertRaises(SystemExit):
                builder.unpack(archive, root / "target")

    def test_only_known_mariadb_test_symlinks_are_skipped(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = root / "mysql.tar"
            known = sorted(builder.TEST_FIXTURE_SYMLINKS)[0]
            make_archive(archive, [
                ("mariadb-11.4.13/CMakeLists.txt", "file", b"project(mariadb)"),
                (known, "link", b"../../outside"),
            ])
            output = builder.unpack(archive, root / "target")
            self.assertTrue((output / "CMakeLists.txt").exists())
            self.assertFalse((root / "target" / known).exists())

    def test_reject_preexisting_unmarked_target(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = root / "valid.tar"
            make_archive(archive, [("release/README", "file", b"hi")])
            target = root / "target"
            target.mkdir()
            (target / "unrelated").write_bytes(b"keep")
            with self.assertRaises(SystemExit):
                builder.unpack(archive, target)
            self.assertEqual((target / "unrelated").read_bytes(), b"keep")


if __name__ == "__main__":
    unittest.main()
