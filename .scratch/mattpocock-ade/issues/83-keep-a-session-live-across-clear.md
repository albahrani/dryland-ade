# Keep a session live across /clear

Type: task

## Question

Claude Code's /clear fires SessionEnd for the old CLI session id and then SessionStart, UserPromptSubmit and Stop under a new id, while the CLI keeps running (verified on 2.1.302, see mattpocock-ade/74). The status mapping turns SessionEnd into session.ended, which createSessionStatus treats as final, so after /clear a live session's tab and ticket show it ended for good. Make a SessionEnd whose reason is clear (hook input field, or a SessionEnd matcher if Claude Code supports one; verify) not end the session, or let a later state event revive a session whose PTY is still alive. The session index already records the new id correctly (SessionRecorder only moves lastSeen on ended). Add a fake-CLI contract test for the /clear sequence and check once against the real CLI.
