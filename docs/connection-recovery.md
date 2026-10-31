# Minecraft connection recovery

`SERVER_LAN_IP` below represents the server computer's local IPv4 address. Use your own address; see [local network setup](network-setup.md).

The reported getsockopt reconnect failure coincided with the Java Minecraft process being down. The LAN bridge still listened on SERVER_LAN_IP:25565, but its localhost backend was unavailable. The PC retained LAN address SERVER_LAN_IP.

Minecraft's watchdog dump showed the server thread in CloneCommands.clone -> Level.setBlock -> ServerLevel.sendBlockUpdated, followed by a watchdog shutdown. This identifies terrain copying as the operation in progress; it does not establish the underlying cause of the stall.

Automatic recovery failed before launch because lifecycle preparation called SurvivalLessons.cleanup_survival(), which attempted console commands against the stopped Java process. The method now tolerates exactly the expected 'Minecraft server is not running' error while clearing stale lesson state. Other RuntimeErrors still propagate. WorldTraining.stop already tolerates unavailable-server cleanup tickets and parking commands.

Validation: 34 focused Python lifecycle, world training and survival tests passed, including a dead-server stop/cleanup/start recovery and propagation of unrelated command errors. The standard lab restart completed. Native Minecraft status pings succeeded through both 127.0.0.1:25565 and SERVER_LAN_IP:25565, each reporting Paper 1.21.4 and eight connected bots. Automatic learning resumed in a fresh baseline with protected-model restoration complete. Status evidence: logs/connection-recovery.json.

This fixes the recovery blocker and restores connectivity. It does not claim to have eliminated the underlying Minecraft terrain-copy stall. No firewall or authentication rules were changed.
