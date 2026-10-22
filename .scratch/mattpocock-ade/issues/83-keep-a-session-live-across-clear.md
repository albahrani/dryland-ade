# Keep a session live across /clear

Type: task
Status: resolved

## Question

Claude Code's /clear fires SessionEnd for the old CLI session id and then SessionStart, UserPromptSubmit and Stop under a new id, while the CLI keeps running (verified on 2.1.302, see mattpocock-ade/74). The status mapping turns SessionEnd into session.ended, which createSessionStatus treats as final, so after /clear a live session's tab and ticket show it ended for good. Make a SessionEnd whose reason is clear (hook input field, or a SessionEnd matcher if Claude Code supports one; verify) not end the session, or let a later state event revive a session whose PTY is still alive. The session index already records the new id correctly (SessionRecorder only moves lastSeen on ended). Add a fake-CLI contract test for the /clear sequence and check once against the real CLI.

## Answer

SessionEnd with reason clear no longer reports session.ended. The Claude Code adapter's statusEvents key is now 'SessionEnd:^(?!clear$).*', which hookSettings turns into a hook matcher, so every other reason still ends the session (commits fbc064a and the follow-up). Fake-CLI contract test plays the /clear sequence (old id's SessionEnd:clear reports nothing, the new id's UserPromptSubmit reports running). Checked once against Claude Code 2.1.308: the matcher fires for reason 'other'; a real interactive /clear could not be triggered non-interactively, so that the real reason is 'clear' is not verified here. Known limits: reason 'resume' is still treated as ended, and no revive-on-later-event fallback was added.
