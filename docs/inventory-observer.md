# Optional inventory observer (Minecraft Java 26.3)

1. In Minecraft Launcher, choose **AI Lab Observer (26.3)** and play.
2. Join the lab from this PC at `localhost:25565` as a Minecraft operator.
3. Use the dashboard's regular **Follow** camera and press **F8** to toggle
   the overlay. The key can be changed under Controls → Key Binds.

The overlay follows the lab camera's selected bot, including camera cycling.
It shows the 27 inventory slots, nine hotbar slots, selected hotbar slot, armor,
offhand and cursor stack. While a menu is open it also shows all container
slots, including both rows of a personal crafting grid or the three rows and
result of a workbench. Other menus (including furnaces) use slot order.
The view displays item types and counts; it does not replicate item metadata,
recipes, furnace progress bars or the bot's mouse input.

The viewer starts off. It requires a local multiplayer connection, spectator
mode and an enabled, attached lab camera session for a Paper operator. A short
local request renews while the viewer is on; closing the client, leaving the
server or turning the viewer off stops that request. The controller samples
the bot's existing inventory state up to four times a second, so transitions
shorter than one sample may not be visible. The last snapshot per observer is
overwritten, and the HUD drops stale data and data for a previous camera target.
There are no new dashboard endpoints, game packets or inventory controls.
The lab's local OS account and its data directory are the trust boundary;
do not share the observer directory with untrusted users.

To build, run `python scripts/build_inventory_observer.py --java <path-to-java.exe>`
with Minecraft Java 26.3 already installed. The Java 25 runtime must include
`jdk.compiler`. Add `--install` with Minecraft and its launcher closed to
create the separate launcher profile. The script uses Fabric Loader 0.20.1
and Fabric API 0.166.0+26.3. The standalone viewer jar is built under
`runtime/inventory-observer-deps`. The mod's configuration and dependencies
live under the dedicated profile's game directory, not the vanilla mods folder.
The bot controller must load this repository's observer bridge to supply data.
