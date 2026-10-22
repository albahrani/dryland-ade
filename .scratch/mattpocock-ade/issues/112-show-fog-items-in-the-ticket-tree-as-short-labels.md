# Show fog items in the ticket tree as short labels with the full text on hover

Type: task
Status: resolved

## Question

The Fog branch in the left ticket tree (TicketsView.tsx, styles .fog) renders each Not yet specified bullet as its whole paragraph, so on our own map two long prose notes fill the narrow tree. Show each item as a one-line label (text up to the first sentence or colon, ellipsised) with the full text as tooltip, and open the map tab when a fog row is clicked. Findings: ticket 87.

## Answer

Fog items in the Tickets tree are now one-line ellipsised labels (fogLabel in tree-tooltips.ts: text up to the first colon or sentence end, whole text if that is empty) with the full text as tooltip; clicking a fog row opens the map tab. Commits 3a3b8e0 and the follow-up fallback commit. Limit: abbreviations such as 'e.g.' end the label early.
