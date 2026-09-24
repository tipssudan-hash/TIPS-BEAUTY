# Workspace Rules & Guidelines

## Browser Usage & Quota Policy
- **Never open the browser or launch the browser subagent (`browser_subagent`) autonomously.** Opening browser instances consumes a large amount of quota.
- **Never ask for permission to open the browser.**
- Only invoke browser tools if the user explicitly and directly requests browser automation in their prompt.
- For all verification and testing, rely on automated unit/integration tests, command line test runners, build/typecheck validation, or direct HTTP/API requests (`read_url_content`).
