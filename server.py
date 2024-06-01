import http.server
import socketserver

PORT = 8000
DIRECTORY = "."

class MyHttpRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

# Create an object of the above class
handler_object = MyHttpRequestHandler

# Create a socket server
with socketserver.TCPServer(("", PORT), handler_object) as httpd:
    print(f"Serving at port {PORT}")
    # Serve the files
    httpd.serve_forever()