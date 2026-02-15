from pathlib import Path

from setuptools import find_packages, setup


def _read_requirements() -> list[str]:
    req = Path(__file__).with_name("requirements.txt")
    if not req.exists():
        return []
    lines = []
    for raw in req.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        lines.append(line)
    return lines


setup(
    name="holomed",
    version="0.1.0",
    description="HoloMed: Holographic medical visualization with real-time vision control",
    python_requires=">=3.10",
    packages=find_packages(include=["core", "core.*"]),
    include_package_data=True,
    install_requires=_read_requirements(),
    entry_points={
        "console_scripts": [
            "holomed=main:main",
        ]
    },
)

