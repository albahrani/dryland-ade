# Show fog items in the ticket tree as short labels with the full text on hover

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-22T14:09:45.772Z","was":""}} -->

## Question

The Fog branch in the left ticket tree (TicketsView.tsx, styles .fog) renders each Not yet specified bullet as its whole paragraph, so on our own map two long prose notes fill the narrow tree. Show each item as a one-line label (text up to the first sentence or colon, ellipsised) with the full text as tooltip, and open the map tab when a fog row is clicked. Findings: ticket 87.
