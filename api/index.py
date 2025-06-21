from http.server import BaseHTTPRequestHandler
import sys
import os
import json

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

try:
    from server import app
except ImportError as e:
    print(f"Import error: {e}")
    app = None

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            # Handle static files
            if self.path.startswith("/"):
                # Try to serve from frontend
                file_path = os.path.join("frontend", self.path.lstrip("/"))
                if os.path.exists(file_path):
                    with open(file_path, "rb") as f:
                        content = f.read()
                    
                    # Set content type
                    if file_path.endswith(".html"):
                        content_type = "text/html"
                    elif file_path.endswith(".css"):
                        content_type = "text/css"
                    elif file_path.endswith(".js"):
                        content_type = "application/javascript"
                    else:
                        content_type = "text/plain"
                    
                    self.send_response(200)
                    self.send_header("Content-type", content_type)
                    self.end_headers()
                    self.wfile.write(content)
                    return
        except Exception as e:
            print(f"Error serving static file: {e}")
        
        # Fallback response
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(b"<h1>InfiniMunch Server</h1><p>Server is running!</p>")
    
    def do_POST(self):
        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok"}).encode())
