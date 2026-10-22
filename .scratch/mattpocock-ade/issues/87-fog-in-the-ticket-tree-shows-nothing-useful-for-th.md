# Fog in the ticket tree shows nothing useful for the Matt Pocock ADE map

Type: research
Status: resolved

## Question

Opened on our own project, the Fog shown in the left ticket tree for the mattpocock-ade map is not useful. Find out what the app reads and shows as Fog compared with the Fog section of that map.md, and decide what it should show.

## Answer

Nothing is misread: parseMap (packages/core/src/map.ts) takes the bullets of '## Not yet specified' and the tree shows them, matching map.md (2 items: the carried-over destination note and the build-risk note). The Fog is unhelpful because on this map those items are long prose paragraphs, not short open questions, and TicketsView renders each whole paragraph as an italic row in a narrow tree, with no truncation, tooltip or click target. Decision: keep reading the section as is; show each item as a one-line label (up to the first sentence or colon, ellipsised) with the full text as a tooltip, and make a fog row open the map tab. Follow-up task ticket created for the change. No code changed.
