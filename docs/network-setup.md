# Use your own local network address

Documentation uses `SERVER_LAN_IP` for the local IPv4 address of the computer
running the lab and `LAN_SUBNET` for its trusted network's subnet. Replace these
placeholders with your own values. They are not literal connection addresses.

On the server PC, run `ipconfig` in PowerShell. Find the IPv4 address on the
active Ethernet or Wi-Fi adapter used by the other devices. Use that address
when connecting from another computer or iPad on the same network. Identify
your adapter name with `Get-NetAdapter`; do not assume it is named Ethernet 2.
Determine the matching subnet from your network configuration rather than
copying the original deployment's subnet.

| Client | Server address | Port |
| --- | --- | --- |
| Dashboard on the server PC | `http://127.0.0.1:8000/` | 8000 |
| Java Minecraft on the server PC | `127.0.0.1` | 25565 |
| Java Minecraft on another LAN device | `SERVER_LAN_IP` | 25565 |
| iPad / Bedrock on the same LAN | `SERVER_LAN_IP` | 19132 |
| HTTPS dashboard on another LAN PC | `https://SERVER_LAN_IP:8000/` | 8000 |

`127.0.0.1` always refers to the device using it, so it cannot reach the server
from a different PC or iPad.

## Configure a fresh installation

The repository includes configuration and helper scripts from the original
deployment. They do not automatically discover your network. Before enabling
LAN features:

1. Set `address` and `subnet` in `config/lan.json` to your server's IPv4 address
   and LAN subnet. `enabled` controls the Minecraft LAN bridge;
   `dashboard_https` controls the LAN dashboard frontend.
2. Review the relevant firewall helpers for your local address, subnet and
   interface alias. `scripts/Enable-LanFirewall.ps1` accepts `-LocalAddress`,
   `-Subnet` and `-InterfaceAlias`. The dashboard and Bedrock firewall helpers
   also contain deployment-specific values that need adjustment before use.
3. For Bedrock, review the bind and advertised addresses in its setup code and
   generated Geyser configuration for the new installation; see
   [Bedrock connection notes](bedrock-connection.md).
4. For the HTTPS dashboard, use a certificate generated for your configured
   address and trust your installation's public CA certificate on client PCs;
   see [LAN dashboard setup](DASHBOARD_LAN.md).

Changing documentation does not change a running lab's network configuration.
