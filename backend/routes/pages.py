"""CSRF token endpoint. Template routes removed — the React SPA handles all page rendering."""

from flask import Blueprint, jsonify
from flask_wtf.csrf import generate_csrf

bp = Blueprint("pages", __name__)


@bp.route("/api/csrf-token")
def api_csrf_token():
    return jsonify({"csrf_token": generate_csrf()})
