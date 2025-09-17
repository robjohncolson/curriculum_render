#!/usr/bin/env python3
"""
Simple Development Server for AP Stats Quiz
No build process required - just serves the HTML file
"""

import http.server
import socketserver
import os
import webbrowser
import sys

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        # Add CORS headers for development
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()
    
    def log_message(self, format, *args):
        # Colored output for better visibility
        if "GET" in format % args:
            print(f"\033[92m{format % args}\033[0m")  # Green for GET
        elif "404" in format % args:
            print(f"\033[91m{format % args}\033[0m")  # Red for 404
        else:
            print(format % args)

def start_server():
    print(f"""
╔═══════════════════════════════════════════════════╗
║     AP Statistics Quiz - Development Server      ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  Server running at: http://localhost:{PORT}/      ║
║                                                   ║
║  Files being served from:                        ║
║  {DIRECTORY:<49}║
║                                                   ║
║  Press Ctrl+C to stop the server                 ║
║                                                   ║
║  DevTools available in browser console:          ║
║  - window.DevTools.inspectData()                 ║
║  - window.DevTools.enableDebugMode()             ║
║  - window.DevTools.getMemoryUsage()              ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
    """)
    
    try:
        with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
            # Auto-open browser
            if len(sys.argv) > 1 and sys.argv[1] == '--no-browser':
                print("Skipping browser auto-open")
            else:
                webbrowser.open(f'http://localhost:{PORT}/index.html')
                print("Browser opened automatically")
            
            print(f"\nServing at http://localhost:{PORT}/")
            print("Watching for file changes...\n")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\nServer stopped.")
        sys.exit(0)
    except OSError as e:
        if e.errno == 48:  # Port already in use
            print(f"\n❌ Error: Port {PORT} is already in use.")
            print("Try closing other servers or use a different port.\n")
        else:
            print(f"\n❌ Error: {e}\n")
        sys.exit(1)

if __name__ == "__main__":
    os.chdir(DIRECTORY)
    start_server()