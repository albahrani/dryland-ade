# Verify the Codex CLI adapter on a host with Codex installed

Type: task
Status: ready-for-human

## Question

Run on a host with the Codex CLI installed (`codex` on PATH), against the app built from main. Nothing is built unless a check fails: then fix the adapter entry (CODEX_CLI / GEMINI_CLI in packages/core/src/agent-adapter.ts) or file a ticket. Checks: (1) the CLI shows as available when picking an Agent CLI on a ticket; (2) Start work opens it in the ticket's worktree with its interactive launch and the command pre-typed in its syntax ($implement shop/02), not submitted; (3) its folder trust dialog, if any, is waited out before typing, and the blockingPrompts text matches what it really shows; (4) the skills folders listed in the adapter (.agents/skills, .codex/skills) are where it really finds skills, so the skill picker offers them; (5) the badge goes working while it prints and idle after a pause, with the (approximate) marking in the tooltip and Sessions view, and ended when it exits; (6) with auto-submit on, globally and as a project override, the command is submitted, and a key typed before pre-typing starts cancels it; (7) a CLI started by hand in a Dryland terminal is left alone. Record the CLI version and any difference from the adapter in the ticket's Answer. Ticket 44 built the adapter from the CLI's documentation only.
