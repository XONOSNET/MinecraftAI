# World learning and the stone-age curriculum

The dashboard's **Automatic world learning** control starts a persistent loop:

1. Restore the camp and measure the saved specialists in student mode.
2. Restore it with a different tree arrangement and collect teacher examples.
3. Protect the expedition, gathering and shelter weights **and optimizer states**.
4. Train each specialist with at least 30 fresh examples, balancing fresh observations with retained earlier replay. Training uses 100 CPU epochs. Withhold up to 512 earlier observations to check action agreement.
5. Restore the camp to the baseline's evaluation arrangement and measure the candidate in student mode.
6. Retain the candidate bundle only if measured completion, health and lesson progress support it; otherwise restore the protected bundle. Keep collected demonstrations in either case, then repeat.

The three evaluation arrangements rotate between cycles; both students within one comparison receive the same arrangement. This reduces simple practice-layout bias but does not establish generalization to arbitrary Minecraft worlds.

World travel can sprint to the quarry, trees and other destinations when the verified route has at least six clear, straight, level blocks ahead. It walks for corners, stairs, doors, construction, close approaches and food below twelve points. Ground and clearance checks continue while running. Both teacher and student use this shared motor assistance; it preserves the existing neural actions and weights. Activity reports show “Sprinting on clear ground” while it is active.

On world routes, forward movement can also auto-step onto a verified adjacent one-block rise with clear landing and jump headroom. Wait and turn decisions remain respected; unsupported gaps and unknown terrain do not qualify. This is shared motor assistance, so successful stair climbing alone does not demonstrate learned jump timing. Home trips open the front door even when the resource lies behind the house, following the route's actual crossing direction. Reserved survival wood has a separate collection apron outside the animal fence.

Selection prioritizes complete sequences, low-health failures and verified milestone progress. Small capped credit for gathering and hut placement helps measure early progress. Timing is secondary: equal fully successful candidates must not become over 15% slower. Slower gathering is not eliminated by an adaptive timer. The existing 20-minute overall safety deadline still applies. A drop of over eight percentage points on withheld earlier-example action agreement also rejects the candidate. That guard is a limited replay proxy, not a replacement for full basics regression testing.

World movement now applies the same observed-ground safety check to teacher and student commands. It checks held movement intentions every 100 ms as well as new policy commands, so delayed API replies cannot leave forward movement unchecked. It blocks unsupported drops and unplanned jumping while retaining checked one-block steps and doorway descents; it does not select teacher actions for the student. Physically stationary attempts with no inventory, building or lesson progress end after 90 seconds, with a dashboard and in-game countdown after 15 seconds. Slow searches that keep moving or gathering continue. Such endings are failed attempts, never credited successes. Inaccessible trees are skipped temporarily so another resource can be checked. Bot requests also have a ten-second timeout so a stalled HTTP request cannot hold a controller indefinitely.

Two consecutive champion cycles with at least 75% full student completion advance from **Settlement** to **Stone age**, then to the next of twelve natural sites. Disable automatic progression to keep practicing a selected site and mission. Prepared camps reserve safe working ground and refresh actual harvestable resources; they are structured lessons within natural regions, not unrestricted wilderness survival.

## Twelve verified milestones

1. Enclose a hut with a usable door.
2. Craft and place a chest.
3. Craft a wooden pickaxe.
4. Craft a wooden axe.
5. Craft a wooden shovel.
6. Store eight planks and equip the axe.
7. Mine real stone with the wooden pickaxe and collect cobblestone.
8. Craft a stone pickaxe.
9. Craft a stone axe.
10. Craft and place a furnace.
11. Smelt a real log into charcoal, using planks as fuel.
12. Craft torches, mount one high on the interior wall and one beside the entrance outside, then return inside and close the door. Both wall attachments must verify.

Quarries and fuel stumps appear once per bot after the settlement is verified. No production inventory grants bypass harvesting or crafting. Stone tools and the furnace require fourteen cobblestone in total; sixteen stone blocks provide a small collection margin.

Each quarry has a separate safe apron and an access corridor. Fuel stops collect two logs: one can become planks for handles and furnace fuel, while the other remains raw for charcoal. These stations stay outside the earlier wood-supply rows so a fast bot cannot erase a slower neighbour's lesson resources.

The world controller also uses a block-center visibility ray. Mineflayer's existing near-corner ray range can stop before an elevated target, leaving a plainly visible final block unrecognized. The corrected ray still stops at intervening solid blocks; this is a sensing fix, not knowledge of hidden resources.

## What learns

The expedition, gathering and shelter action policies learn navigation, harvesting/mining and entering shelter. All bots share each specialist's weights; their individual observations and spatial memory remain separate. Route planning, target selection, recipes, placement, storage and furnace operation are scripted helpers in **both** teacher and student runs. Completing a stone-age sequence does not mean the network independently invented crafting or construction.

## Controls and recovery

The dashboard explains the current phase, shows fresh demonstration counts and retains forty before/after comparisons with model decisions. In-game `/trigger lab_world` opens the existing native menu, including automatic world learning. No client mod is required. Existing per-bot HUD lesson counters expand to twelve milestones.

Pause world learning safely before manual model operations. Switching to basics or manual world trials waits for training/save completion and restores unvalidated candidates first. Service/server recovery restores protected models before starting a fresh comparison. State is in `data/world-learning.json`; protected checkpoints are in `checkpoints/world-learning/`. Do not remove those files while `restore_pending` is true.

The native verification script `scripts/verify_stone_age_native.cjs` uses an isolated survival player with explicit fixture ingredients, mines real stone and checks actual server crafting, furnace output and torch placement. Fixture grants are never used by production lessons.

## Initial verification

On 2026-10-25, 181 Python and 107 JavaScript tests passed. The isolated native fixture mined sixteen real stone blocks, collected enough cobblestone for both tools and the furnace, smelted charcoal and placed a torch ([record](stone-age-native.json)). A full production teacher run completed all twelve milestones for seven of eight bots; one stopped on its return to shelter ([record](stone-age-world-native.json)). That timeout prompted a bounded local-recovery retry, covered by a regression test. The seven-of-eight measurement predates that final retry fix. These results establish teacher feasibility, not learned student mastery; the automatic student's first comparison must supply that evidence.

The subsequent baseline-stall fix passed 182 Python and 113 JavaScript tests. A native fixture with policy commands deliberately spaced 800 ms apart held safely at a platform edge, while the unguarded control fell; checked one-block ascent still completed ([record](world-edges-native.json)). All four hinge/direction doorway cases also passed with the safety check enabled ([record](world-door-native.json)). These are actuator checks, not proof that the new stone-age policy has mastered navigation.
