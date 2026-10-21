"""Serve site/ on http://localhost:$PORT (default 5174) with no-cache headers."""
import functools
import http.server
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "site"


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5174"))
    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Serving {ROOT} on http://localhost:{port}")
        httpd.serve_forever()
