package lab.observer;

import com.google.gson.*;
import java.io.IOException;
import java.nio.file.*;
import java.util.concurrent.*;
import java.util.regex.Pattern;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.ItemStack;
import com.mojang.blaze3d.platform.InputConstants;

public final class InventoryObserver implements ClientModInitializer {
    private static final Pattern LOCAL = Pattern.compile("(?i)(localhost|127\\.0\\.0\\.1|\\[::1\\])(?::[0-9]{1,5})?");
    private static final Pattern PLAYER = Pattern.compile("[A-Za-z0-9_]{1,16}");
    private static final int BG = 0xe6131925, SLOT = 0xff293444, SELECTED = 0xff786438;
    private volatile String viewer;
    private volatile View view;
    private Path root;
    private boolean enabled = true;
    private boolean detailed;
    private String leased;
    private long renewAt;
    private record View(String owner, String bot, long at, String type, ItemStack[] player,
                        ItemStack[] window, ItemStack cursor, int selected,
                        double health, double food, double air, int level, double xp) {}

    @Override public void onInitializeClient() {
        try {
            Path config = FabricLoader.getInstance().getConfigDir().resolve("ai-lab-observer.json");
            var settings = read(config);
            if (!settings.has("autoReconnect") || settings.get("autoReconnect").getAsBoolean()) {
                int port = settings.has("reconnectPort") ? settings.get("reconnectPort").getAsInt() : 25565;
                if (port > 0 && port <= 65535) LocalReconnect.install(port);
            }
            root = Path.of(settings.get("labDirectory").getAsString()).toAbsolutePath().normalize();
        } catch (IOException | RuntimeException ignored) {}
        var panel = KeyMappingHelper.registerKeyMapping(new KeyMapping(
            "key.ai_lab_observer.toggle", InputConstants.KEY_F8, KeyMapping.Category.MISC));
        var toggle = KeyMappingHelper.registerKeyMapping(new KeyMapping(
            "key.ai_lab_observer.hud", InputConstants.KEY_F7, KeyMapping.Category.MISC));
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (toggle.consumeClick()) enabled = !enabled;
            while (panel.consumeClick()) {
                detailed = !detailed;
                if (detailed) enabled = true;
            }
            var server = client.getCurrentServer();
            var player = client.player;
            String name = player == null ? "" : player.getGameProfile().name();
            viewer = enabled && player != null && player.isSpectator() && server != null
                && LOCAL.matcher(server.ip).matches() && PLAYER.matcher(name).matches() ? name : null;
        });
        HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT,
            Identifier.fromNamespaceAndPath("ai_lab_observer", "inventory"), (g, ticks) -> render(g));
        var worker = Executors.newSingleThreadScheduledExecutor(job -> {
            var thread = new Thread(job, "AI Lab inventory observer");
            thread.setDaemon(true);
            return thread;
        });
        worker.scheduleWithFixedDelay(this::poll, 0, 150, TimeUnit.MILLISECONDS);
        org.slf4j.LoggerFactory.getLogger("AI Lab Inventory Observer")
            .info("Inventory viewer initialized (local lab configured: {})", root != null);
    }

    private static JsonObject read(Path file) throws IOException {
        if (Files.size(file) > 262144) throw new IOException("Oversized observer file");
        return JsonParser.parseString(Files.readString(file)).getAsJsonObject();
    }
    private void poll() {
        if (root == null) return;
        String owner = viewer;
        Path dir = root.resolve("data/inventory-observer");
        try {
            if (leased != null && !leased.equals(owner)) {
                Files.deleteIfExists(dir.resolve("request-" + leased));
                leased = null;
                view = null;
            }
            if (owner == null) return;
            long now = System.currentTimeMillis();
            if (!owner.equals(leased) || now >= renewAt) {
                Files.createDirectories(dir);
                Files.writeString(dir.resolve("request-" + owner), "");
                leased = owner;
                renewAt = now + 600;
            }
            String target = null;
            for (var e : read(root.resolve("data/observers.json")).entrySet()) {
                if (!e.getKey().equalsIgnoreCase(owner)) continue;
                var session = e.getValue().getAsJsonObject();
                if (session.get("enabled").getAsBoolean() && session.get("attached").getAsBoolean())
                    target = session.get("target").getAsString();
            }
            var data = read(dir.resolve("snapshot-" + owner + ".json"));
            long at = data.get("at").getAsLong();
            if (target == null || !target.equals(data.get("bot").getAsString()) || now-at > 1500 || at-now > 1000) {
                view = null;
                return;
            }
            var window = data.getAsJsonObject("window");
            var vitals = data.getAsJsonObject("vitals");
            view = new View(owner, target, at, window.get("type").getAsString(),
                stacks(data.getAsJsonArray("player"), 46), stacks(window.getAsJsonArray("slots"), 90),
                stack(data.get("cursor")), data.get("selected").getAsInt(),
                metric(vitals,"health"), metric(vitals,"food"), metric(vitals,"air"),
                (int) metric(vitals,"level"), metric(vitals,"xp"));
        } catch (IOException | RuntimeException e) { view = null; }
    }
    private static double metric(JsonObject values, String key) {
        var value = values == null ? null : values.get(key);
        return value == null || value.isJsonNull() ? -1 : value.getAsDouble();
    }

    private static ItemStack[] stacks(JsonArray items, int limit) {
        ItemStack[] result = new ItemStack[Math.min(items.size(), limit)];
        for (int i = 0; i < result.length; i++) result[i] = stack(items.get(i));
        return result;
    }
    private static ItemStack stack(JsonElement value) {
        if (value == null || value.isJsonNull()) return ItemStack.EMPTY;
        var obj = value.getAsJsonObject();
        var id = Identifier.tryParse(obj.get("id").getAsString());
        var item = id == null ? null : BuiltInRegistries.ITEM.getValue(id);
        return item == null ? ItemStack.EMPTY : new ItemStack(item, Math.clamp(obj.get("count").getAsInt(), 1, 99));
    }
    private static ItemStack at(ItemStack[] list, int i) {
        return i < list.length ? list[i] : ItemStack.EMPTY;
    }
    private static void text(GuiGraphicsExtractor g, String value, int x, int y, int color, int width) {
        var font = Minecraft.getInstance().font;
        g.text(font, font.plainSubstrByWidth(value, width), x, y, color, false);
    }
    private static void slot(GuiGraphicsExtractor g, ItemStack item, int x, int y, boolean selected) {
        g.fill(x, y, x+18, y+18, selected ? SELECTED : SLOT);
        if (!item.isEmpty()) {
            g.fakeItem(item, x+1, y+1);
            g.itemDecorations(Minecraft.getInstance().font, item, x+1, y+1);
        }
    }
    private static void sprite(GuiGraphicsExtractor g, String name, int x, int y, int w, int h) {
        g.blitSprite(RenderPipelines.GUI_TEXTURED, Identifier.fromNamespaceAndPath("minecraft","hud/"+name),x,y,w,h);
    }
    private static void hotbar(GuiGraphicsExtractor g, View v) {
        int x = (g.guiWidth()-182)/2, y = g.guiHeight()-23;
        if (x < 0 || y < 55) return;
        sprite(g,"hotbar",x,y,182,22);
        if (v.selected>=0 && v.selected<9) sprite(g,"hotbar_selection",x-1+20*v.selected,y-1,24,24);
        var font = Minecraft.getInstance().font;
        for (int i=0;i<9;i++) {
            var item=at(v.player,36+i);
            if (!item.isEmpty()) {
                g.fakeItem(item,x+3+i*20,y+3);
                g.itemDecorations(font,item,x+3+i*20,y+3);
            }
        }
        var offhand=at(v.player,45);
        if (x>=28 && !offhand.isEmpty()) {
            sprite(g,"hotbar_offhand_left",x-29,y-1,29,24);
            g.fakeItem(offhand,x-25,y+3);
            g.itemDecorations(font,offhand,x-25,y+3);
        }
        for (int i=0;i<10;i++) {
            if (v.health>=0) {
                sprite(g,"heart/container",x+i*8,y-18,9,9);
                double fill=v.health-2*i;
                if (fill>0) sprite(g,fill>1?"heart/full":"heart/half",x+i*8,y-18,9,9);
            }
            if (v.food>=0) {
                int right=x+173-i*8;
                sprite(g,"food_empty",right,y-18,9,9);
                double fill=v.food-2*i;
                if (fill>0) sprite(g,fill>1?"food_full":"food_half",right,y-18,9,9);
            }
            if(v.air>=0 && v.air<20) sprite(g,v.air>2*i?"air":"air_empty",x+173-i*8,y-28,9,9);
        }
        if (v.xp>=0) {
            sprite(g,"experience_bar_background",x,y-7,182,5);
            int width=(int)(182*Math.clamp(v.xp,0,1));
            if(width>0) {
                g.enableScissor(x,y-7,x+width,y-2);
                try { sprite(g,"experience_bar_progress",x,y-7,182,5); }
                finally { g.disableScissor(); }
            }
            if(v.level>0) g.centeredText(font,Integer.toString(v.level),g.guiWidth()/2,y-17,0xffa8ff43);
        }
    }
    private void render(GuiGraphicsExtractor g) {
        String owner = viewer;
        if (owner == null) return;
        View v = view;
        if (v == null || !owner.equals(v.owner) || System.currentTimeMillis()-v.at > 1500) {
            if (!detailed) return;
            g.fill(6, 6, Math.min(286,g.guiWidth()-6), 23, BG);
            text(g, root == null ? "AI Lab viewer: configure the lab directory" : "AI Lab viewer: waiting for your operator follow session", 10, 10, 0xffd4dce8, Math.min(270,g.guiWidth()-20));
            return;
        }
        hotbar(g,v);
        if (!detailed && v.type.equals("inventory")) return;
        boolean personal = v.type.equals("inventory") || v.type.equals("crafting_2x2");
        boolean crafting = personal || v.type.contains("crafting");
        int rows = crafting ? (personal ? 2 : 3) : (v.window.length+8)/9;
        boolean menu = personal || v.window.length > 0;
        int height = 134 + (menu ? 15 + rows*19 : 0);
        float scale = Math.min(1f, Math.min((g.guiWidth()-12)/184f, (g.guiHeight()-64)/(float)height));
        if (scale <= 0) return;
        var pose = g.pose();
        pose.pushMatrix();
        try {
            pose.translate(6,6).scale(scale);
            g.fill(0,0,184,height,BG);
            String label = personal ? "Personal crafting (2 × 2)"
                : v.type.startsWith("minecraft:generic_9x") ? "Container · "+v.window.length+" slots"
                : v.type.replace("minecraft:","").replace('_',' ');
            text(g,v.bot+"  |  live inventory",7,6,0xffedf4ff,170);
            text(g,"Armor / offhand          Cursor",7,21,0xffacbaca,170);
            for (int i=0;i<4;i++) slot(g,at(v.player,5+i),7+i*19,32,false);
            slot(g,at(v.player,45),83,32,false);
            slot(g,v.cursor,139,32,false);
            for (int i=0;i<36;i++) slot(g,at(v.player,9+i),7+(i%9)*19,53+(i/9)*19+(i>=27?3:0),i==27+v.selected);
            if (menu) {
                text(g,label,7,135,0xffacbaca,170);
                if (crafting) {
                    int width=personal?2:3;
                    for(int i=0;i<width*width;i++) slot(g,at(v.window,1+i),7+(i%width)*19,147+(i/width)*19,false);
                    text(g,"Result",86,147,0xffacbaca,80);
                    slot(g,at(v.window,0),86,158,false);
                } else {
                    for(int i=0;i<v.window.length;i++) slot(g,v.window[i],7+(i%9)*19,147+(i/9)*19,false);
                }
            }
        } finally { pose.popMatrix(); }
    }
}
