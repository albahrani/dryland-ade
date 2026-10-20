# Test the tracker widget actions and stop loading the whole project for them

Type: task
Status: claimed
<!-- dryland: {"claim":{"holder":"main","at":"2026-10-20T21:06:56.825Z","was":""}} -->
Blocked by: 048

## Question

The tracker:widget-action handler (reveal issues folder, open issues in browser through gh/glab) has no test, and it calls projectView() just to get the main checkout path. Move the action into a testable module that takes a runner and an opener, test both actions and their failures, and look the checkout up with findMainCheckout. Also read the tracker doc once in readTrackerInfo instead of twice. Raised in review of ticket 48.
