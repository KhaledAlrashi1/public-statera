"""Entry point for the Flask application."""

import os
from backend import create_app

app = create_app()

if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "127.0.0.1")
    port = int(os.getenv("FLASK_PORT", "5004"))
    debug = os.getenv("FLASK_ENV", "development") == "development"
    app.run(debug=debug, host=host, port=port)
