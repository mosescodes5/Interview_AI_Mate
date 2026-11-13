import json
from http.server import BaseHTTPRequestHandler, HTTPServer
class H(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def _j(self,o):
        b=json.dumps(o).encode(); self.send_response(200); self.send_header("content-type","application/json"); self.send_header("content-length",str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        self._j({"version":"0.0-fake"} if "version" in self.path else {"models":[{"name":"qwen2.5:3b","size":1}]})
    def do_POST(self):
        n=int(self.headers.get("content-length",0)); body=json.loads(self.rfile.read(n))
        q=body["messages"][-1]["content"]
        self._j({"message":{"content":"FAKE ANSWER for: "+("event loop" if "event loop" in q else "other")}})
HTTPServer(("127.0.0.1",11434),H).serve_forever()
