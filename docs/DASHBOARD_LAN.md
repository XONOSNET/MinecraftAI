# LAN dashboard HTTPS

Open https://192.168.1.24:8000/ from another PC on 192.168.1.0/24.

Before opening, copy docs/dashboard-lan-ca.cer to that PC. In Windows, open the certificate, select Install Certificate, Current User, Place all certificates in the following store, and Trusted Root Certification Authorities. This trusts this lab's local certificate authority. Only the public certificate is copied; the server private key stays in ignored data/dashboard-tls. Restart the browser after importing if needed.

The frontend listens only on 192.168.1.24, accepts only the configured subnet and same-origin requests, and proxies to 127.0.0.1:8000. Local HTTP access remains available. LAN dashboard visitors have the existing dashboard administration controls; use only your trusted home network. There is no router port forwarding.

Start-Lab starts the HTTPS frontend; Stop-Lab stops it. Firewall setup: run scripts/Enable-DashboardFirewall.ps1 as Administrator once. The firewall rule allows TCP 8000 only on Ethernet 2, local address 192.168.1.24, remote subnet 192.168.1.0/24. Local certificate is valid for one year; a regenerated CA must be trusted again on other PCs.
