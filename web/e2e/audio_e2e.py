import time
from playwright.sync_api import sync_playwright
texts = ["Tell me about yourself and what brought you to apply for this role?", "Okay. How would you design a rate limiter for a public API?"]
reqs = []
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream","--use-file-for-fake-audio-capture=web/e2e/fake_mic.wav"])
    ctx = b.new_context(permissions=["microphone"]); app = ctx.new_page(); logs=[]
    app.on("pageerror", lambda e: logs.append(str(e)))
    def handle(route):
        body = route.request.post_data_buffer or b""
        reqs.append(len(body)); i = min(len(reqs)-1, 1)
        route.fulfill(status=200, content_type="application/json", body='{"text": "%s", "model": "stub"}' % texts[i])
    app.route("**/api/transcription/transcribe", handle)
    app.goto("http://localhost:8765/"); app.get_by_text("Live Interview Copilot").click()
    app.get_by_label("Read questions on screen").uncheck(); app.get_by_label("Listen to shared tab").uncheck()
    app.get_by_label("Listen to my microphone").check()
    app.get_by_role("button", name="Start listening").click()
    for _ in range(40):
        if app.locator("article.entry").count()>=2: break
        time.sleep(0.5)
    print("TRANSCRIBE REQUESTS (utterances uploaded):", len(reqs), "sizes(bytes):", reqs[:4])
    print("ENTRIES:", app.locator("article.entry").count())
    for t in app.locator("article.entry .q").all_inner_texts(): print("  Q:", t)
    print("ANSWERS:", app.get_by_text("FAKE ANSWER").count())
    err = app.locator(".alert.error"); print("ERROR BOX:", err.inner_text() if err.count() else None)
    print("page errors:", logs)
    b.close()
