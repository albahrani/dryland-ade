# Reduce the cost of synchronous status hooks

Type: task
Blocked by: 61

## Question

Each Claude Code status hook runs `dryland status` synchronously: about 80 ms per call through the Electron launcher with no app running (ticket 36, research/hook-status-mapping.md), so about 160 ms on top of each tool call from PreToolUse and PostToolUse. Async hooks were rejected: they give up ordering, so a late running report could land after Stop and leave the badge on working. Once Dryland generally works and there is user feedback, measure whether the cost is noticeable in real sessions and, only if it is, find a cheaper way that keeps events in order (for example a lighter status entry point than the full CLI bundle, or fewer hooked events).
