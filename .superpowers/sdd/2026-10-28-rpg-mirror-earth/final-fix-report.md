# final-fix report
1. rpg.js: story dialog buttons now only call dlg.close(); the close listener does storyRead (Esc/button alike). New e2e story_button_chains_next (rpg_home) + storySaved helper (save is now written on the async close event, so existing story test waits for it). Concern: the new e2e also passes against the OLD rpg.js (a re-render evidently happens after close anyway), so it is a regression guard, not a proven red->green.
2. rpg-battle.js final2 text -> 「...ふたつの地球を守った！ ${mates}」; plan doc line updated.
3. rpg-core.js similarChoices tier 1 filtered with REGION.has. Unit assertion added to similar_choices_always_four (failed first, now passes).
4. rpg.js chtabsHTML local open -> isOpen; removed b.disabled guard.
5. rpg.css: dark blocks (media + data-theme=dark) set .is-mirror .rpg-am-r.is-done fill to var(--rpg-c) (no extra white mix). Not visually checked.
Cache bust: rpg.css v16, rpg-core.js v7, rpg.js v8, rpg-battle.js v7.
Tests: node --test 'tests/unit/*.test.mjs' -> 159 pass, 0 fail. e2e rpg_home/rpg_amap/rpg_battle -> 73 pass, 0 fail.
