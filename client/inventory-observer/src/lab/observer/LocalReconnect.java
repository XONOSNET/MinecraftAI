package lab.observer;

import java.util.Set;
import java.util.concurrent.TimeUnit;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.DisconnectedScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.network.chat.Component;
import org.slf4j.LoggerFactory;

/** Reconnects a dropped observer session to its last local lab endpoint. */
final class LocalReconnect {
    private static final Set<String> LOOPBACK = Set.of("localhost", "127.0.0.1", "::1", "[::1]");
    private static final int INITIAL_DELAY = 5;
    private static final int MAX_DELAY = 30;
    private final int port;
    private ServerData target;
    private Screen failure;
    private long retryAt;
    private int delay = INITIAL_DELAY;

    private LocalReconnect(int port) {
        this.port = port;
    }

    static void install(int port) {
        var reconnect = new LocalReconnect(port);
        ClientPlayConnectionEvents.JOIN.register((listener, sender, client) -> {
            reconnect.joined(listener.getServerData());
        });
        ScreenEvents.AFTER_INIT.register((client, screen, width, height) -> reconnect.opened(client, screen));
        ClientTickEvents.END_CLIENT_TICK.register(reconnect::tick);
    }

    private void joined(ServerData server) {
        clear();
        if (server == null || !ServerAddress.isValidAddress(server.ip)) return;
        var address = ServerAddress.parseString(server.ip);
        if (address.getPort() == port && LOOPBACK.contains(address.getHost().toLowerCase(java.util.Locale.ROOT))) {
            target = server;
        }
    }

    private void clear() {
        target = null;
        failure = null;
        delay = INITIAL_DELAY;
    }

    private void opened(Minecraft client, Screen screen) {
        if (target == null) return;
        // The vanilla leave/cancel buttons return to a menu. Only a connection
        // failure screen keeps the last lab connection armed.
        if (screen instanceof TitleScreen || screen instanceof JoinMultiplayerScreen) {
            clear();
            return;
        }
        if (!(screen instanceof DisconnectedScreen)) return;
        if (failure != screen) {
            failure = screen;
            retryAt = System.nanoTime() + TimeUnit.SECONDS.toNanos(delay);
            delay = Math.min(MAX_DELAY, delay * 2);
        }
        ScreenEvents.afterExtract(screen).register((current, graphics, mouseX, mouseY, delta) -> {
            if (failure != current) return;
            long seconds = Math.max(1, (retryAt - System.nanoTime() + 999_999_999L) / 1_000_000_000L);
            graphics.centeredText(client.font, Component.translatable("ai_lab_observer.reconnecting", seconds),
                graphics.guiWidth() / 2, graphics.guiHeight() - 22, 0xffe2f0ff);
        });
    }

    private void tick(Minecraft client) {
        if (target == null || failure == null || client.gui.screen() != failure || System.nanoTime() - retryAt < 0) return;
        failure = null;
        LoggerFactory.getLogger("AI Lab Reconnect").info("Reconnecting to the local lab at {}", target.ip);
        var parent = new JoinMultiplayerScreen(new TitleScreen());
        ConnectScreen.startConnecting(parent, client, ServerAddress.parseString(target.ip), target, false, null);
    }
}
