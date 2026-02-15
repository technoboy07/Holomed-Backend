"""
HoloMed Application Entry Point

This is the top-level launcher that wires together:
- core.tracker.HandTracker (Vision Controller / "Senses")
- core.renderer.HoloRenderer (Render Pipeline / "Holos")

The processing engine and ingestion vault will be added in core.processor later.

NOTE: Currently uses mesh_model.py implementation until full MVC refactor is complete.
"""

from mesh_model import JarvisVisualizer


def main() -> None:
    """Launch HoloMed application."""
    app = JarvisVisualizer()
    app.start()


if __name__ == "__main__":
    main()

