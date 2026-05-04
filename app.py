"""Thin wrapper — keeps `python app.py` working for backward compatibility.

All application code now lives in the ``backend/`` package.
Prefer ``python run.py`` or ``make dev`` for development.
"""

from backend import create_app

app = create_app()

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5001)
