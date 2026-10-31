# iPad / Bedrock cross-play

In this guide, `SERVER_LAN_IP` is your lab server PC's local IPv4 address. Configure it for your installation using [local network setup](network-setup.md); do not enter the placeholder literally. The verification notes below describe the original deployment.

The original request described cross-play as an eventual goal. This deployment installs Geyser-Spigot 2.12.1 build 1279 and Floodgate 2.2.5 build 141 from official download.geysermc.org artifacts; SHA-256 digests and pinned URLs are recorded in config/bedrock.json. Existing ViaVersion permits Geyser's newer Java protocol to connect to Paper 1.21.4. No client mod is needed.

Geyser binds only the LAN address SERVER_LAN_IP. The client entry port is 19132: legacy RakNet uses UDP 19132; current NetherNet uses built-in HTTP signaling on TCP 19132 and WebRTC on UDP 19133. Advertising is explicitly restricted to SERVER_LAN_IP:19133 with STUN discovery disabled. The generated Geyser config uses Floodgate authentication. Java's existing loopback binding and offline bot setup remain unchanged; no player is made an operator.

Live verification: Floodgate enabled, Geyser enabled, a Bedrock UDP unconnected ping received a valid pong/MOTD advertising version 26.60, and the built-in signaling HTTP server responded. All eight bots reconnected, the Java server is online, and learning resumed with a fresh baseline after protected-model recovery. A real authenticated iPad join is not yet verified.

Windows network profile is Public. Existing enabled inbound Public block rules apply to the exact bundled server java.exe and both TCP/UDP. Automatic approval review rejected launching elevated firewall setup with 'blocked by policy' and no further reason. No firewall rules were changed by this deployment.

Manual completion: double-click scripts/Enable-BedrockLAN.cmd and accept the Windows administrator prompt. It invokes the existing PowerShell 7 runtime without changing execution policy. Enable-BedrockFirewall.ps1 backs up the matching Any-port Java block rules, exempts only Bedrock ports from those blocks, and adds LAN-address/subnet/interface-scoped allow rules. All other Java ports retain their Public-profile blocks. The result is recorded in data/bedrock-firewall-result.json. Router forwarding is unnecessary for devices on the same network and was not configured.

On the iPad, use the regular updated Minecraft app, connect to the same home Wi-Fi, and add server address SERVER_LAN_IP with port 19132. No Java Edition purchase is needed for the Bedrock player when using Floodgate. The first newer-client signaling connection may display Geyser's documented trust prompt for built-in HTTP signaling.

Sources: https://geysermc.org/wiki/geyser/setup/ and https://geysermc.org/wiki/floodgate/setup/ . Server-generated Floodgate keys stay in ignored server runtime storage; never commit or share them.

Firewall follow-up: the user allowed the Windows OpenJDK prompt. Read-only verification now shows enabled inbound TCP and UDP Allow rules for the exact bundled server Java executable on the active Public network profile. The earlier Block rules are gone. The existing application rules cover the Bedrock ports, so the separate administrator firewall helper is no longer necessary for connectivity and was not run. Bedrock LAN discovery on SERVER_LAN_IP:19132 again returned a valid pong, signaling HTTP responded, and the lab remains online. A real iPad login still needs confirmation on the device.
