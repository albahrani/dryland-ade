# Keep a session live across /clear

Type: task
Status: resolved

## Question

Claude Code's /clear fires SessionEnd for the old CLI session id and then SessionStart, UserPromptSubmit and Stop under a new id, while the CLI keeps running (verified on 2.1.302, see mattpocock-ade/74). The status mapping turns SessionEnd into session.ended, which createSessionStatus treats as final, so after /clear a live session's tab and ticket show it ended for good. Make a SessionEnd whose reason is clear (hook input field, or a SessionEnd matcher if Claude Code supports one; verify) not end the session, or let a later state event revive a session whose PTY is still alive. The session index already records the new id correctly (SessionRecorder only moves lastSeen on ended). Add a fake-CLI contract test for the /clear sequence and check once against the real CLI.

## Answer

SessionEnd with reason clear or resume no longer reports session.ended. The Claude Code adapter's statusEvents key is now 'SessionEnd:^(?!(clear|resume)$).*', which hookSettings turns into a hook matcher, so every other reason still ends the session (commits fbc064a, 4d7407b and the /resume follow-up). A fake-CLI contract test plays the sequence: the old id's SessionEnd:clear and SessionEnd:resume report nothing, the new id's UserPromptSubmit reports running. Checked against the real CLI (Claude Code 2.1.308, interactive): /clear fires SessionEnd reason 'clear' under the old id; /resume fires SessionEnd reason 'resume' under the old id then SessionStart source 'resume' under another, the CLI still running; /exit fires 'prompt_input_exit'. Known limits: the matcher regex must not contain a colon (the key splits on it); no revive-on-later-event fallback was added, so an unknown future reason that keeps the CLI alive would still end the session.
