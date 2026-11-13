import time
from playwright.sync_api import sync_playwright
HTML = "<title>Interview</title><body style='font:42px sans-serif;padding:60px;background:white;color:black'><p style='color:#777;font-size:24px'>Interview with Acme - Question 3 of 10</p><p id=q>Can you explain how the JavaScript event loop works and why it matters for performance?</p></body>"

INIT = """
(() => {
  const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
  const g = c.getContext('2d'); window.__q = 'Can you explain how the JavaScript event loop works and why it matters for performance?';
  function draw(){ g.fillStyle='#fff'; g.fillRect(0,0,1280,720); g.fillStyle='#777'; g.font='24px sans-serif'; g.fillText('Interview with Acme - Question 3 of 10', 60, 80);
    g.fillStyle='#000'; g.font='36px sans-serif';
    const words = window.__q.split(' '); let line='', y=300; for (const w of words){ if (g.measureText(line+w).width>1100){ g.fillText(line,60,y); y+=52; line=''; } line+=w+' '; } g.fillText(line,60,y); }
  setInterval(draw, 100); draw();
  const stream = c.captureStream(10);
  navigator.mediaDevices.getDisplayMedia = async () => stream;
})();
"""
with sync_playwright() as p:
    b = p.chromium.launch(args=["--auto-select-desktop-capture-source=Entire screen","--use-fake-ui-for-media-stream","--enable-usermedia-screen-capturing","--allow-http-screen-capture"])
    ctx = b.new_context(viewport={"width":1280,"height":800}, permissions=["microphone"])
    iv = ctx.new_page(); iv.set_content(HTML)
    app = ctx.new_page(); app.add_init_script(INIT); logs=[]
    app.on("console", lambda m: logs.append(m.text)); app.on("pageerror", lambda e: logs.append("PAGEERROR "+str(e)))
    app.goto("http://localhost:8765/"); app.get_by_text("Live Interview Copilot").click()
    app.get_by_label("Listen to shared tab").uncheck()   # screen OCR only
    app.get_by_label("Check the screen every") if False else None
    app.get_by_role("button", name="Start listening").click()
    ok=False
    for _ in range(40):
        if app.get_by_text("FAKE ANSWER for: event loop").count(): ok=True; break
        time.sleep(0.5)
    print("ANSWER SHOWN:", ok)
    print("ENTRIES:", app.locator("article.entry").count())
    time.sleep(8)  # keep running: same question must NOT be answered again
    print("ENTRIES after 8s more (expect 1):", app.locator("article.entry").count())
    print("OCR panel:", app.locator("details.dbg pre").inner_text(timeout=2000).replace("\n"," | ")[:160])
    err = app.locator(".alert.error"); print("ERROR BOX:", err.inner_text() if err.count() else None)
    # new question appears -> second entry
    app.evaluate("window.__q='What is the difference between a process and a thread in an operating system?'"); 
    for _ in range(30):
        if app.locator("article.entry").count()==2: break
        time.sleep(0.5)
    print("ENTRIES after new question (expect 2):", app.locator("article.entry").count())
    app.screenshot(path="/tmp/e2e.png", full_page=True)
    app.get_by_role("button", name="Stop").click(timeout=3000); time.sleep(0.5)
    print("stopped, start button back:", app.get_by_role("button", name="Start listening").count()==1)
    print("console errors:", [l for l in logs if "error" in l.lower()][:5])
    b.close()
