function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderErrorPage(error?: unknown): string {
  let errorDetail = "";
  if (error) {
    if (error instanceof Error) {
      errorDetail = `${error.stack || `${error.name}: ${error.message}`}`;
      if (error.cause) {
        errorDetail += `\nCaused by: ${String(error.cause)}`;
      }
    } else {
      errorDetail = typeof error === "string" ? error : JSON.stringify(error);
    }
  }

  const errorHtml = errorDetail
    ? `<pre style="text-align: left; background: #fef2f2; border: 1px solid #fee2e2; color: #991b1b; padding: 1rem; border-radius: 0.375rem; font-family: monospace; font-size: 11px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; margin-top: 1.5rem;">${escapeHtml(errorDetail)}</pre>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 32rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
      ${errorHtml}
    </div>
  </body>
</html>`;
}
