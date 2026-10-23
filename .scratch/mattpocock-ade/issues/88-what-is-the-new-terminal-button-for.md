# What is the New terminal button for?

Type: grilling
Status: resolved

## Question

The New terminal button next to the project selector has no clear purpose to the user. Decide whether it stays (and where, and with what label or tooltip), moves, or goes, given sessions already open their own terminals and openShell exists for CLIs started by hand.

## Answer

The plain terminal stays: it is the only way to start a Hand-started session (openShell links it to a ticket by working directory) and the user's general shell. It moves out of the top bar, where it looked like part of the project selector, to a '+' button in the tab strip, plus a File > New Terminal menu item with a shortcut. The name stays 'New terminal' with the tooltip: Open a shell in the project's main checkout. Start an agent CLI by hand here. It always starts in the main checkout; a worktree-aware shell from a ticket tab is out of scope. No glossary change. Implementation: mattpocock-ade/116.
