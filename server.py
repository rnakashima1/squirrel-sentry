from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import time
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen


HOST = "127.0.0.1"
PORT = 4173


class SquirrelSentryHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/proxy-snapshot":
            self.proxy_snapshot(parsed.query)
            return
        super().do_GET()

    def proxy_snapshot(self, query):
        params = parse_qs(query)
        target = params.get("url", [""])[0]
        parsed_target = urlparse(target)
        if parsed_target.scheme not in ("http", "https"):
            self.send_error(400, "Missing or invalid snapshot URL")
            return

        try:
            fresh_target = add_cache_bust(target)
            request = Request(
                fresh_target,
                headers={
                    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache",
                },
            )
            with urlopen(request, timeout=10) as response:
                data = response.read()
                content_type = response.headers.get("Content-Type", "image/jpeg")
        except Exception as error:
            self.send_error(502, f"Snapshot fetch failed: {error}")
            return

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def add_cache_bust(url):
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    params["_squirrel_sentry"] = [str(time.time_ns())]
    query = urlencode(params, doseq=True)
    return urlunparse(parsed._replace(query=query))


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), SquirrelSentryHandler)
    print(f"Squirrel Sentry running at http://{HOST}:{PORT}")
    server.serve_forever()
