"""Local preview, bound only to loopback. Run with Python 3.11+."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import webbrowser
root=Path(__file__).resolve().parent
server=ThreadingHTTPServer(('127.0.0.1',8766),partial(SimpleHTTPRequestHandler,directory=str(root)))
print('Local site: http://127.0.0.1:8766/ — Ctrl+C to stop.')
webbrowser.open('http://127.0.0.1:8766/')
try: server.serve_forever()
except KeyboardInterrupt: server.server_close()
