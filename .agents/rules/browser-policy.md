# Browser Usage & Quota Policy

- **Do NOT open the browser or use `browser_subagent` autonomously.**
- **Do NOT ask for permission to open the browser.**
- Browser interactions consume high quota and must only be executed when the user explicitly instructs to interact with or open the browser.
- Rely on CLI scripts, automated test suites (`vitest`), type checks (`tsc`), linters, and direct HTTP requests (`read_url_content`) for all testing and verification.
