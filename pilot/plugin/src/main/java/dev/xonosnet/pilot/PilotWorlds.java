package dev.xonosnet.pilot;

import com.destroystokyo.paper.event.player.PlayerSetSpawnEvent;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.channels.FileChannel;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import net.kyori.adventure.util.TriState;
import org.bukkit.Bukkit;
import org.bukkit.Difficulty;
import org.bukkit.GameMode;
import org.bukkit.GameRule;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.WorldCreator;
import org.bukkit.WorldType;
import org.bukkit.block.Block;
import org.bukkit.block.data.type.Bed;
import org.bukkit.block.data.type.Door;
import org.bukkit.block.data.Bisected;
import org.bukkit.block.BlockFace;
import org.bukkit.Material;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.command.ConsoleCommandSender;
import org.bukkit.command.RemoteConsoleCommandSender;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.Sheep;
import org.bukkit.DyeColor;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.player.PlayerBedEnterEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerLoginEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.event.player.PlayerTeleportEvent;
import org.bukkit.event.world.TimeSkipEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;
import org.spigotmc.event.player.PlayerSpawnLocationEvent;

/** No trial reset, resource grants, gameplay teleports, or home spawnpoint commands. */
public final class PilotWorlds extends JavaPlugin implements Listener {
    public static final String PRIMARY = "lab_persistent_pilot";
    public static final String PILOT = "HomeAI01";
    public static final String TAG = "lab_persistent_pilot";
    private static final Pattern FIXTURE = Pattern.compile("lab_pilot_fixture_[a-z0-9_]{1,24}");
    private static final Pattern FIXTURE_PLAYER = Pattern.compile("PilotFixture[A-Za-z0-9]{0,3}");
    private static final Pattern PLAYER = Pattern.compile("[A-Za-z0-9_]{3,16}");
    private static final Gson JSON = new GsonBuilder().serializeNulls().disableHtmlEscaping().create();
    private final String session = UUID.randomUUID().toString();
    private long sequence;
    private String activeRequest;
    private boolean durabilityFailed;

    @Override public void onEnable() {
        recoverConfiguration();
        getConfig().addDefault("enabled", false);
        getConfig().options().copyDefaults(true);
        saveConfig();
        Bukkit.getPluginManager().registerEvents(this, this);
        if (getCommand("labpilot") == null) throw new IllegalStateException("Missing labpilot command metadata");
        getCommand("labpilot").setExecutor(this);
        // A fresh installation is inert. Only an explicitly enabled, already-owned
        // world may reload. Missing terrain is never silently regenerated.
        if (getConfig().getBoolean("enabled")) {
            try { loadOwned(PRIMARY); }
            catch (Exception error) { emit("error", row("operation", "resume_world", "message", error.getMessage())); }
        }
        Bukkit.getScheduler().runTaskTimer(this, () -> {
            World world = Bukkit.getWorld(PRIMARY);
            if (world != null && owned(world) && getConfig().getBoolean("enabled"))
                emitWorld("clock", world);
        }, 600L, 600L);
        emit("enabled", row("world_enabled", getConfig().getBoolean("enabled"), "plugin_version", getDescription().getVersion()));
    }

    @Override public void onDisable() { saveConfig(); }

    private boolean validConfiguration(Path path) {
        try {
            if (!Files.isRegularFile(path) || Files.size(path)==0) return false;
            YamlConfiguration candidate = new YamlConfiguration(); candidate.load(path.toFile());
            ConfigurationSection worlds = candidate.getConfigurationSection("worlds");
            if (worlds != null) for (String name : worlds.getKeys(false)) {
                if (!nameAllowed(name)) return false;
                UUID.fromString(candidate.getString("worlds."+name+".uuid", ""));
            }
            return true;
        } catch (Exception error) { return false; }
    }

    private void recoverConfiguration() {
        Path main = getDataFolder().toPath().resolve("config.yml");
        Path backup = getDataFolder().toPath().resolve("config.yml.bak");
        if (Files.exists(main) && validConfiguration(main)) return;
        try {
            if (validConfiguration(backup)) {
                if (Files.exists(main)) Files.move(main, main.resolveSibling("config-corrupt-"+UUID.randomUUID()+".yml"));
                atomicWrite(main, Files.readAllBytes(backup));
            } else if (Files.exists(main)) {
                throw new IllegalStateException("Pilot ownership configuration is corrupt with no valid backup; refusing world adoption");
            }
        } catch (IOException error) { throw new IllegalStateException("Pilot ownership configuration recovery failed", error); }
    }

    private void atomicWrite(Path target, byte[] bytes) throws IOException {
        Files.createDirectories(target.getParent());
        Path temporary = target.resolveSibling("config-write-"+UUID.randomUUID()+".tmp");
        try {
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                java.nio.ByteBuffer buffer = java.nio.ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) channel.write(buffer);
                channel.force(true);
            }
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } finally { Files.deleteIfExists(temporary); }
    }

    @Override public void saveConfig() {
        Path main = getDataFolder().toPath().resolve("config.yml");
        try {
            if (validConfiguration(main)) atomicWrite(main.resolveSibling("config.yml.bak"), Files.readAllBytes(main));
            atomicWrite(main, getConfig().saveToString().getBytes(StandardCharsets.UTF_8));
            durabilityFailed = false;
        } catch (IOException error) {
            durabilityFailed = true;
            for (Player player : Bukkit.getOnlinePlayers()) if (memberName(player.getName()))
                player.kickPlayer("Pilot ownership could not be saved; continuing without durable state is refused.");
            throw new IllegalStateException("Pilot ownership metadata could not be durably saved", error);
        }
    }

    private static Map<String, Object> row(Object... values) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < values.length; i += 2) result.put((String) values[i], values[i + 1]);
        return result;
    }

    private void emit(String event, Map<String, Object> data) {
        Map<String, Object> record = row("protocol", 1, "event", event, "server_session", session,
            "sequence", ++sequence, "at_ms", System.currentTimeMillis());
        record.putAll(data);
        // Native events can fire synchronously inside a console operation (for
        // example PlayerDeathEvent during fixture kill). They are evidence, not
        // that operation's acknowledgement, even while its ticket is active.
        boolean reply = activeRequest != null && List.of("created", "loaded", "status", "unloaded",
            "fixture_retired", "admission_ready", "player_status", "fixture_time", "fixture_setup",
            "observer_joined", "observer_left", "error").contains(event);
        if (reply) {
            record.put("request_id", activeRequest);
            record.put("ok", !"error".equals(event));
        }
        getLogger().info((reply ? "LAB_PILOT_WORLD " : "LAB_PILOT_EVENT ") + JSON.toJson(record));
    }

    private void emitWorld(String event, World world) {
        Map<String, Object> record = worldRecord(world);
        record.put("event", event);
        record.put("protocol", 1);
        record.put("server_session", session);
        record.put("sequence", ++sequence);
        record.put("at_ms", System.currentTimeMillis());
        record.put("request_id", activeRequest);
        record.put("ok", true);
        getLogger().info("LAB_PILOT_WORLD " + JSON.toJson(record));
    }

    private Map<String, Object> location(Location location) {
        if (location == null || location.getWorld() == null) return null;
        return row("world", location.getWorld().getName(), "world_uuid", location.getWorld().getUID().toString(),
            "x", location.getX(), "y", location.getY(), "z", location.getZ(),
            "yaw", location.getYaw(), "pitch", location.getPitch());
    }

    private Map<String, Object> worldRecord(World world) {
        if (world == null) return row("world", PRIMARY, "loaded", false);
        return row("world", world.getName(), "world_uuid", world.getUID().toString(),
            "dimension", world.getKey().toString(), "loaded", true, "spawn", location(world.getSpawnLocation()),
            "game_time", world.getGameTime(), "full_time", world.getFullTime(), "time_of_day", world.getTime(),
            "environment", world.getEnvironment().name(), "difficulty", world.getDifficulty().name(), "keep_inventory", world.getGameRuleValue(GameRule.KEEP_INVENTORY),
            "daylight_cycle", world.getGameRuleValue(GameRule.DO_DAYLIGHT_CYCLE),
            "mob_spawning", world.getGameRuleValue(GameRule.DO_MOB_SPAWNING),
            "mob_griefing", world.getGameRuleValue(GameRule.MOB_GRIEFING),
            "random_tick_speed", world.getGameRuleValue(GameRule.RANDOM_TICK_SPEED),
            "spawn_chunk_radius", world.getGameRuleValue(GameRule.SPAWN_CHUNK_RADIUS),
            "players", world.getPlayers().stream().map(Player::getName).toList(),
            "view_distance", world.getViewDistance(), "simulation_distance", world.getSimulationDistance(),
            "border_size", world.getWorldBorder().getSize(), "auto_save", world.isAutoSave());
    }

    private boolean nameAllowed(String name) { return PRIMARY.equals(name) || FIXTURE.matcher(name).matches(); }
    private boolean fixtureName(String name) { return FIXTURE.matcher(name).matches(); }
    private boolean memberName(String name) { return PILOT.equals(name) || name.matches("PilotTest0[1-4]") || FIXTURE_PLAYER.matcher(name).matches(); }
    private String memberWorld(String name) { return getConfig().getString("members." + name + ".world"); }

    private boolean owned(World world) {
        return nameAllowed(world.getName()) && world.getUID().toString().equals(
            getConfig().getString("worlds." + world.getName() + ".uuid"));
    }

    private World requireWorld(String name) {
        World world = Bukkit.getWorld(name);
        if (world == null || !owned(world)) throw new IllegalArgumentException("Owned world must be loaded: " + name);
        return world;
    }

    private File worldFolder(String name) {
        if (!nameAllowed(name)) throw new IllegalArgumentException("Only the pilot and named pilot fixtures are managed");
        return new File(Bukkit.getWorldContainer(), name);
    }

    private void resourceCaps(World world) {
        world.setViewDistance(3);
        world.setSimulationDistance(2);
        world.setGameRule(GameRule.SPAWN_CHUNK_RADIUS, 0);
        world.setAutoSave(true);
    }

    private World loadOwned(String name) {
        String uuid = getConfig().getString("worlds." + name + ".uuid");
        if (!nameAllowed(name) || uuid == null || !new File(worldFolder(name), "level.dat").isFile()
                || !new File(worldFolder(name), "uid.dat").isFile())
            throw new IllegalArgumentException("No intact owned world exists; refusing regeneration: " + name);
        World existing = Bukkit.getWorld(name);
        World world = existing == null ? new WorldCreator(name).keepSpawnLoaded(TriState.FALSE).createWorld() : existing;
        if (world == null || !uuid.equals(world.getUID().toString())) {
            if (world != null && world.getPlayers().isEmpty()) Bukkit.unloadWorld(world, false);
            throw new IllegalStateException("World UUID differs from the ownership record");
        }
        resourceCaps(world);
        return world;
    }

    private World create(String name, String type, long seed) {
        if (!nameAllowed(name)) throw new IllegalArgumentException("Unknown pilot world name");
        if (!PRIMARY.equals(name) && !fixtureName(name)) throw new IllegalArgumentException("Unknown fixture name");
        if (PRIMARY.equals(name) && !"normal".equals(type)) throw new IllegalArgumentException("The continuing pilot uses natural terrain");
        if (!"normal".equals(type) && !"flat".equals(type)) throw new IllegalArgumentException("World type must be normal or flat");
        if (getConfig().contains("worlds." + name + ".uuid")) {
            World world = loadOwned(name);
            if (PRIMARY.equals(name)) { getConfig().set("enabled", true); saveConfig(); }
            return world;
        }
        if (worldFolder(name).exists() || Bukkit.getWorld(name) != null)
            throw new IllegalArgumentException("An unregistered world folder exists; refusing adoption or overwrite");
        WorldCreator creator = new WorldCreator(name).environment(World.Environment.NORMAL).type(
            "flat".equals(type) ? WorldType.FLAT : WorldType.NORMAL).seed(seed)
            .generateStructures(!fixtureName(name)).keepSpawnLoaded(TriState.FALSE);
        if ("flat".equals(type)) creator.generatorSettings("{\"layers\":[{\"block\":\"minecraft:bedrock\",\"height\":1},"
            + "{\"block\":\"minecraft:stone\",\"height\":124},{\"block\":\"minecraft:dirt\",\"height\":3},"
            + "{\"block\":\"minecraft:grass_block\",\"height\":1}],\"biome\":\"minecraft:plains\","
            + "\"lakes\":false,\"features\":false,\"structure_overrides\":[]}");
        World world = creator.createWorld();
        if (world == null) throw new IllegalStateException("World creation returned no world");
        resourceCaps(world);
        world.setDifficulty(Difficulty.NORMAL);
        world.setGameRule(GameRule.KEEP_INVENTORY, false);
        world.setGameRule(GameRule.DO_DAYLIGHT_CYCLE, true);
        world.setGameRule(GameRule.DO_WEATHER_CYCLE, true);
        world.setGameRule(GameRule.DO_MOB_SPAWNING, !fixtureName(name));
        world.setGameRule(GameRule.MOB_GRIEFING, true);
        world.setGameRule(GameRule.RANDOM_TICK_SPEED, 3);
        world.getWorldBorder().setCenter(world.getSpawnLocation());
        world.getWorldBorder().setSize(512);
        getConfig().set("worlds." + name + ".uuid", world.getUID().toString());
        getConfig().set("worlds." + name + ".seed", seed);
        getConfig().set("worlds." + name + ".type", type);
        if (PRIMARY.equals(name)) getConfig().set("enabled", true);
        saveConfig();
        world.save();
        return world;
    }

    @Override public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof ConsoleCommandSender) && !(sender instanceof RemoteConsoleCommandSender)) {
            sender.sendMessage("Pilot administration is console-only.");
            return true;
        }
        activeRequest = null;
        try {
            if (args.length >= 2 && "--request".equals(args[args.length - 2])) {
                String token = args[args.length - 1];
                if (!token.matches("[A-Za-z0-9_-]{1,64}")) throw new IllegalArgumentException("Invalid request identifier");
                activeRequest = token;
                args = Arrays.copyOf(args, args.length - 2);
            }
            if (args.length == 0) { emitWorld("status", Bukkit.getWorld(PRIMARY)); return true; }
            String action = args[0];
            String name = args.length > 1 ? args[1] : PRIMARY;
            switch (action) {
                case "create" -> {
                    if (args.length > 4) throw new IllegalArgumentException("create [world] [normal|flat] [seed]");
                    String type = args.length > 2 ? args[2] : "normal";
                    long seed = args.length > 3 ? Long.parseLong(args[3]) : 20261125L;
                    emitWorld("created", create(name, type, seed));
                }
                case "load" -> {
                    if (args.length > 2) throw new IllegalArgumentException("load [world]");
                    World world = loadOwned(name);
                    if (PRIMARY.equals(name)) { getConfig().set("enabled", true); saveConfig(); }
                    emitWorld("loaded", world);
                }
                case "status" -> {
                    if (args.length > 2 || !nameAllowed(name)) throw new IllegalArgumentException("status [owned world]");
                    World world = Bukkit.getWorld(name);
                    if (world != null && !owned(world)) throw new IllegalArgumentException("World ownership does not match");
                    Map<String, Object> record = worldRecord(world);
                    record.put("world", name);
                    record.put("event", "status");
                    record.put("request_id", activeRequest);
                    record.put("ok", true);
                    getLogger().info("LAB_PILOT_WORLD " + JSON.toJson(record));
                }
                case "unload" -> {
                    if (args.length > 2) throw new IllegalArgumentException("unload [owned world]");
                    World world = requireWorld(name);
                    if (!world.getPlayers().isEmpty()) throw new IllegalArgumentException("Disconnect or leave every player before unloading");
                    world.save();
                    if (!Bukkit.unloadWorld(world, true)) throw new IllegalStateException("World did not unload");
                    if (PRIMARY.equals(name)) { getConfig().set("enabled", false); saveConfig(); }
                    emit("unloaded", row("world", name, "world_uuid", world.getUID().toString(), "saved", true));
                }
                case "retire" -> {
                    if (args.length != 2 || !fixtureName(name) || Bukkit.getWorld(name) != null)
                        throw new IllegalArgumentException("Retire only an unloaded fixture world; no files are deleted");
                    ConfigurationSection members = getConfig().getConfigurationSection("members");
                    if (members != null) for (String player : new ArrayList<>(members.getKeys(false))) {
                        if (name.equals(memberWorld(player))) {
                            if (Bukkit.getPlayerExact(player) != null) throw new IllegalArgumentException("Fixture member still connected");
                            getConfig().set("members." + player, null);
                        }
                    }
                    String uuid = getConfig().getString("worlds." + name + ".uuid");
                    if (uuid == null) throw new IllegalArgumentException("Fixture is not owned");
                    getConfig().set("worlds." + name, null); saveConfig();
                    emit("fixture_retired", row("world", name, "world_uuid", uuid, "files_deleted", false));
                }
                case "admit" -> {
                    if (args.length < 2 || args.length > 3 || !memberName(name)) throw new IllegalArgumentException("admit HomeAI01|PilotFixture [owned world]");
                    String target = args.length == 3 ? args[2] : PRIMARY;
                    requireWorld(target);
                    if (PILOT.equals(name) && !PRIMARY.equals(target)) throw new IllegalArgumentException("The continuing identity stays in its persistent world");
                    if (!PILOT.equals(name) && !fixtureName(target)) throw new IllegalArgumentException("Fixture identities stay in fixture worlds");
                    String current = memberWorld(name);
                    if (current != null && !current.equals(target)) throw new IllegalArgumentException("Identity already belongs to another world");
                    if (Bukkit.getPlayerExact(name) != null) throw new IllegalArgumentException("Admit while the member is disconnected");
                    getConfig().set("members." + name + ".world", target);
                    if (!getConfig().contains("members." + name + ".admitted")) getConfig().set("members." + name + ".admitted", false);
                    saveConfig();
                    emit("admission_ready", row("player", name, "world", target, "first_admission", !getConfig().getBoolean("members." + name + ".admitted")));
                }
                case "player" -> {
                    if (args.length != 2 || !memberName(name)) throw new IllegalArgumentException("player [pilot identity]");
                    Player player = Bukkit.getPlayerExact(name);
                    if (player == null) { emit("player_status", row("player", name, "online", false)); break; }
                    Location respawn = player.getRespawnLocation();
                    Map<String, Object> record = playerRecord(player);
                    record.put("respawn", location(respawn));
                    record.putAll(respawnClaim(player, respawn));
                    emit("player_status", record);
                }
                case "fixture-time" -> {
                    if (args.length != 3 || !fixtureName(name)) throw new IllegalArgumentException("fixture-time [fixture] [0..23999]");
                    long time = Long.parseLong(args[2]);
                    if (time < 0 || time >= 24000) throw new IllegalArgumentException("Fixture time out of range");
                    World world = requireWorld(name); world.setTime(time); emitWorld("fixture_time", world);
                }
                case "fixture" -> {
                    if (args.length < 3 || args.length > 4) throw new IllegalArgumentException("fixture [world] [operation] [fixture player]");
                    fixture(requireWorld(name), args[2], args.length == 4 ? args[3] : "PilotTest01");
                }
                case "observe" -> {
                    if (args.length < 2 || args.length > 3 || !PLAYER.matcher(name).matches() || memberName(name)) throw new IllegalArgumentException("observe [human] [owned world]");
                    Player player = Bukkit.getPlayerExact(name);
                    if (player == null) throw new IllegalArgumentException("Observer must be online");
                    World world = requireWorld(args.length == 3 ? args[2] : PRIMARY);
                    String key = "viewers." + player.getUniqueId();
                    if (!getConfig().contains(key)) {
                        Location p = player.getLocation();
                        getConfig().set(key + ".world", p.getWorld().getUID().toString());
                        getConfig().set(key + ".x", p.getX()); getConfig().set(key + ".y", p.getY()); getConfig().set(key + ".z", p.getZ());
                        getConfig().set(key + ".yaw", p.getYaw()); getConfig().set(key + ".pitch", p.getPitch());
                        getConfig().set(key + ".mode", player.getGameMode().name()); saveConfig();
                    }
                    player.setGameMode(GameMode.SPECTATOR);
                    if (!player.teleport(world.getSpawnLocation())) throw new IllegalStateException("Observer transfer declined");
                    emit("observer_joined", row("player", name, "world", world.getName()));
                }
                case "leave" -> {
                    if (args.length != 2 || !PLAYER.matcher(name).matches() || memberName(name)) throw new IllegalArgumentException("leave [human observer]");
                    Player player = Bukkit.getPlayerExact(name);
                    if (player == null) throw new IllegalArgumentException("Observer must be online");
                    String key = "viewers." + player.getUniqueId();
                    World world = Bukkit.getWorld(UUID.fromString(getConfig().getString(key + ".world", "")));
                    if (world == null) throw new IllegalArgumentException("Original observer world is not loaded");
                    Location target = new Location(world, getConfig().getDouble(key + ".x"), getConfig().getDouble(key + ".y"),
                        getConfig().getDouble(key + ".z"), (float) getConfig().getDouble(key + ".yaw"), (float) getConfig().getDouble(key + ".pitch"));
                    if (!player.teleport(target)) throw new IllegalStateException("Observer return declined");
                    player.setGameMode(GameMode.valueOf(getConfig().getString(key + ".mode")));
                    getConfig().set(key, null); saveConfig(); emit("observer_left", row("player", name));
                }
                default -> throw new IllegalArgumentException("Allowed: create, load, status, unload, retire, admit, player, fixture-time, fixture, observe, leave");
            }
        } catch (Exception error) { emit("error", row("operation", args.length == 0 ? "status" : args[0], "message", String.valueOf(error.getMessage()))); }
        finally { activeRequest = null; }
        return true;
    }

    private Location fixtureHome(World world) {
        Location spawn = world.getSpawnLocation();
        return new Location(world, spawn.getBlockX() + 16, spawn.getBlockY(), spawn.getBlockZ() + 16);
    }

    private void requireFixtureStandingSpace(Location location, String label) {
        Block feet = location.getBlock();
        if (!feet.isPassable() || feet.isLiquid() || !feet.getRelative(BlockFace.UP).isPassable()
                || feet.getRelative(BlockFace.UP).isLiquid() || !feet.getRelative(BlockFace.DOWN).getType().isSolid())
            throw new IllegalArgumentException("Fixture " + label + " lacks supported, clear standing space");
    }

    private void requireFixtureResourceClearance(World world, int x, int z, Location home) {
        Location spawn = world.getSpawnLocation();
        for (Location protectedLocation : List.of(spawn, home)) {
            double dx = x - protectedLocation.getBlockX(), dz = z - protectedLocation.getBlockZ();
            if (dx * dx + dz * dz < 49)
                throw new IllegalArgumentException("Fixture resources overlap the protected spawn or home footprint");
        }
        for (Player actor : world.getPlayers()) {
            double dx = x + 0.5 - actor.getLocation().getX(), dz = z + 0.5 - actor.getLocation().getZ();
            if (dx * dx + dz * dz < 9)
                throw new IllegalArgumentException("Fixture resources overlap an actor's standing space");
        }
    }

    private void fixture(World world, String operation, String name) {
        if (!fixtureName(world.getName()) || !owned(world)) throw new IllegalArgumentException("Destructive setup is restricted to owned fixture worlds");
        if (PILOT.equals(name) || !memberName(name)) throw new IllegalArgumentException("The live pilot cannot receive fixture operations");
        Player player = Bukkit.getPlayerExact(name);
        Location home = fixtureHome(world); int x = home.getBlockX(), y = home.getBlockY(), z = home.getBlockZ();
        Map<String, Object> extra = row("setup", true, "autonomous_achievement", false,
            "operation", operation, "world", world.getName(), "world_uuid", world.getUID().toString(),
            "home", row("x", x, "y", y, "z", z));
        switch (operation) {
            case "home", "setup_home" -> {
                for (int dx = -5; dx <= 5; dx++) for (int dz = -5; dz <= 5; dz++) {
                    world.getBlockAt(x+dx,y-1,z+dz).setType(Material.GRASS_BLOCK, false);
                    for (int dy = 0; dy <= 4; dy++) world.getBlockAt(x+dx,y+dy,z+dz).setType(Material.AIR, false);
                }
                for (int dx = -2; dx <= 2; dx++) for (int dz = -2; dz <= 2; dz++) world.getBlockAt(x+dx,y-1,z+dz).setType(Material.OAK_PLANKS, false);
                for (int dy = 0; dy < 3; dy++) for (int dx = -3; dx <= 3; dx++) for (int dz = -3; dz <= 3; dz++)
                    if ((Math.abs(dx)==3 || Math.abs(dz)==3) && !(dx==0 && dz==-3 && dy<2)) world.getBlockAt(x+dx,y+dy,z+dz).setType(Material.OAK_PLANKS, false);
                for (int dx = -3; dx <= 3; dx++) for (int dz = -3; dz <= 3; dz++) world.getBlockAt(x+dx,y+3,z+dz).setType(Material.OAK_PLANKS, false);
                world.getBlockAt(x-3,y,z+1).setType(Material.CRAFTING_TABLE, false);
                world.getBlockAt(x+2,y,z+2).setType(Material.CHEST, false);
                world.getBlockAt(x-2,y,z+2).setType(Material.FURNACE, false);
                for (int dy = 0; dy < 2; dy++) {
                    Door door = (Door) Material.OAK_DOOR.createBlockData();
                    door.setFacing(BlockFace.NORTH); door.setHalf(dy==0 ? Bisected.Half.BOTTOM : Bisected.Half.TOP);
                    world.getBlockAt(x,y+dy,z-3).setBlockData(door, false);
                }
                for (int dz = 0; dz < 2; dz++) {
                    Bed bed = (Bed) Material.WHITE_BED.createBlockData(); bed.setFacing(BlockFace.SOUTH);
                    bed.setPart(dz==0 ? Bed.Part.FOOT : Bed.Part.HEAD);
                    world.getBlockAt(x+2,y,z-1+dz).setBlockData(bed, false);
                }
                extra.put("supplied", List.of("complete oak shell and floor", "oak door", "white bed", "crafting table", "chest", "furnace"));
            }
            case "damage_roof", "roof" -> world.getBlockAt(x,y+3,z).setType(Material.AIR, false);
            case "damage_access", "door" -> {
                world.getBlockAt(x,y,z-3).setType(Material.AIR, false);
                world.getBlockAt(x,y+1,z-3).setType(Material.AIR, false);
            }
            case "block_access" -> {
                world.getBlockAt(x,y,z-4).setType(Material.COBBLESTONE, false);
                world.getBlockAt(x,y+1,z-4).setType(Material.COBBLESTONE, false);
            }
            case "destroy_bed", "bed" -> {
                world.getBlockAt(x+2,y,z-1).setType(Material.AIR, false);
                world.getBlockAt(x+2,y,z).setType(Material.AIR, false);
            }
            case "resources" -> {
                if (getConfig().getBoolean("worlds." + world.getName() + ".resources_seeded"))
                    throw new IllegalArgumentException("Fixture resources were already seeded; no replenishment is performed");
                requireFixtureStandingSpace(world.getSpawnLocation(), "spawn");
                requireFixtureStandingSpace(home, "home");
                // Validate every solid resource footprint before changing any
                // block. In particular no trunk may occupy native world spawn.
                for (int i=0; i<12; i++)
                    requireFixtureResourceClearance(world, x-32+(i%4)*4, z-32+(i/4)*5, home);
                for (int dx=10; dx<14; dx++) for (int dz=-12; dz<-9; dz++)
                    requireFixtureResourceClearance(world, x+dx, z+dz, home);
                for (int i=0; i<12; i++) {
                    int tx=x-32+(i%4)*4, tz=z-32+(i/4)*5;
                    world.getBlockAt(tx,y-1,tz).setType(Material.GRASS_BLOCK, false);
                    for (int dy=0; dy<5; dy++) world.getBlockAt(tx,y+dy,tz).setType(Material.OAK_LOG, false);
                }
                for (int dx=10; dx<14; dx++) for (int dz=-12; dz<-9; dz++) for (int dy=0; dy<2; dy++)
                    world.getBlockAt(x+dx,y+dy,z+dz).setType(Material.STONE, false);
                for (int i=0; i<3; i++) {
                    Sheep sheep=(Sheep) world.spawnEntity(new Location(world,x+8.5,y,z+8.5+i), EntityType.SHEEP);
                    sheep.setColor(DyeColor.WHITE); sheep.setAdult(); sheep.setPersistent(true); sheep.addScoreboardTag("lab_pilot_fixture_resource");
                }
                for (int i=0; i<2; i++) world.spawnEntity(new Location(world,x+10.5,y,z+8.5+i),EntityType.COW).addScoreboardTag("lab_pilot_fixture_resource");
                getConfig().set("worlds." + world.getName() + ".resources_seeded", true); saveConfig();
                extra.put("supplied", List.of("12 five-log oak trunks", "24 stone blocks", "three adult white sheep", "two cows"));
                requireFixtureStandingSpace(world.getSpawnLocation(), "spawn after resource setup");
                requireFixtureStandingSpace(home, "home after resource setup");
                extra.put("spawn_standing_space_verified", true);
                extra.put("home_standing_space_verified", true);
            }
            case "kill", "supply", "position_home", "position_spawn" -> {
                if (player==null || !world.getUID().equals(player.getWorld().getUID()) || !world.getName().equals(memberWorld(name)))
                    throw new IllegalArgumentException("Fixture player must be online and bound to this fixture");
                extra.put("player", name);
                if ("kill".equals(operation)) player.setHealth(0);
                else if ("supply".equals(operation)) {
                    player.getInventory().clear();
                    ItemStack[] items = {new ItemStack(Material.OAK_LOG,8),new ItemStack(Material.OAK_PLANKS,16),
                        new ItemStack(Material.STICK,4),new ItemStack(Material.DIRT,8),new ItemStack(Material.COOKED_BEEF,4),
                        new ItemStack(Material.WOODEN_PICKAXE,1)};
                    player.getInventory().addItem(items);
                    extra.put("supplied", List.of("8 oak logs","16 oak planks","4 sticks","8 dirt","4 cooked beef","1 wooden pickaxe"));
                } else if ("position_home".equals(operation)) player.teleport(home.clone().add(0.5,0.1,0.5));
                else player.teleport(world.getSpawnLocation());
            }
            default -> throw new IllegalArgumentException("Unknown fixed fixture operation");
        }
        emit("fixture_setup", extra);
    }

    private Map<String, Object> playerRecord(Player player) {
        List<Map<String, Object>> inventory = new ArrayList<>();
        for (ItemStack item : player.getInventory().getStorageContents()) if (item != null && !item.getType().isAir())
            inventory.add(row("item", item.getType().getKey().toString(), "count", item.getAmount()));
        List<Map<String, Object>> equipment = new ArrayList<>();
        for (ItemStack item : player.getInventory().getArmorContents()) if (item != null && !item.getType().isAir())
            equipment.add(row("item", item.getType().getKey().toString(), "count", item.getAmount(), "slot", "armor"));
        ItemStack offhand = player.getInventory().getItemInOffHand();
        if (!offhand.getType().isAir()) equipment.add(row("item", offhand.getType().getKey().toString(), "count", offhand.getAmount(), "slot", "offhand"));
        return row("player", player.getName(), "player_uuid", player.getUniqueId().toString(), "online", true,
            "position", location(player.getLocation()), "health", player.getHealth(), "food", player.getFoodLevel(),
            "inventory", inventory, "equipment", equipment, "game_mode", player.getGameMode().name());
    }

    private void clearRespawnClaims(String name) {
        ConfigurationSection claims = getConfig().getConfigurationSection("respawn_claims");
        if (claims != null) for (String world : new ArrayList<>(claims.getKeys(false)))
            getConfig().set("respawn_claims." + world + "." + name, null);
    }

    private Map<String, Object> respawnClaim(Player player, Location safeSpawn) {
        String key = "respawn_claims." + player.getWorld().getUID() + "." + player.getName();
        ConfigurationSection claim = getConfig().getConfigurationSection(key);
        if (claim == null) return row("respawn_block_location", null, "respawn_raw_claim", null,
            "respawn_source", null, "respawn_forced", null, "respawn_claim_verified", false,
            "respawn_block", null, "respawn_block_is_bed", false);
        World world;
        try { world = Bukkit.getWorld(UUID.fromString(claim.getString("world_uuid", ""))); }
        catch (IllegalArgumentException ignored) { world = null; }
        Location raw = world == null ? null : new Location(world, claim.getInt("x"), claim.getInt("y"), claim.getInt("z"));
        Block block = raw == null ? null : raw.getBlock();
        boolean pair = false;
        if (block != null && block.getBlockData() instanceof Bed bed) {
            BlockFace facing = bed.getPart() == Bed.Part.HEAD ? bed.getFacing().getOppositeFace() : bed.getFacing();
            Block other = block.getRelative(facing);
            pair = other.getType() == block.getType() && other.getBlockData() instanceof Bed partner
                && partner.getPart() != bed.getPart() && partner.getFacing() == bed.getFacing();
        }
        boolean verified = raw != null && owned(world) && "BED".equals(claim.getString("cause"))
            && !claim.getBoolean("forced") && pair && safeSpawn != null && safeSpawn.getWorld() != null
            && safeSpawn.getWorld().getUID().equals(world.getUID()) && safeSpawn.distanceSquared(raw) <= 36;
        return row("respawn_block_location", location(raw), "respawn_raw_claim", claim.getValues(false),
            "respawn_source", "native_bed_event", "respawn_forced", claim.getBoolean("forced"),
            "respawn_claim_verified", verified, "respawn_block", block == null ? null : block.getType().getKey().toString(),
            "respawn_block_is_bed", pair);
    }

    @EventHandler(priority = EventPriority.HIGHEST) public void login(PlayerLoginEvent event) {
        String name = event.getPlayer().getName();
        if (!memberName(name)) return;
        String target = memberWorld(name);
        World world = target == null ? null : Bukkit.getWorld(target);
        String savedUuid = getConfig().getString("members." + name + ".player_uuid");
        if (durabilityFailed || world == null || !owned(world) || savedUuid != null && !savedUuid.equals(event.getPlayer().getUniqueId().toString()))
            event.disallow(PlayerLoginEvent.Result.KICK_OTHER, "Pilot realm is not explicitly loaded and admitted for this identity.");
    }

    @EventHandler(priority = EventPriority.HIGHEST) public void initialSpawn(PlayerSpawnLocationEvent event) {
        String name = event.getPlayer().getName();
        if (!memberName(name)) return;
        String target = memberWorld(name);
        World world = target == null ? null : Bukkit.getWorld(target);
        if (world == null || !owned(world)) return;
        if (!getConfig().getBoolean("members." + name + ".admitted")) {
            event.setSpawnLocation(world.getSpawnLocation());
            emit("initial_spawn_selected", row("player", name, "position", location(world.getSpawnLocation()), "setup", true));
        }
    }

    @EventHandler(priority = EventPriority.MONITOR) public void joined(PlayerJoinEvent event) {
        Player player = event.getPlayer(); String name = player.getName();
        if (!memberName(name)) return;
        if (!player.getWorld().getName().equals(memberWorld(name)) || !owned(player.getWorld())) {
            player.kickPlayer("Pilot world mismatch; refusing a gameplay transfer.");
            emit("scope_rejected", playerRecord(player)); return;
        }
        player.addScoreboardTag(TAG);
        if (!getConfig().getBoolean("members." + name + ".admitted")) {
            player.setGameMode(GameMode.SURVIVAL);
            getConfig().set("members." + name + ".admitted", true);
            getConfig().set("members." + name + ".player_uuid", player.getUniqueId().toString()); saveConfig();
            emit("initial_admission", row("player", name, "position", location(player.getLocation()), "setup", true));
        }
        emit("join", playerRecord(player));
    }

    @EventHandler(priority = EventPriority.MONITOR) public void quit(PlayerQuitEvent event) {
        if (memberName(event.getPlayer().getName())) emit("disconnect", playerRecord(event.getPlayer()));
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true) public void transfer(PlayerTeleportEvent event) {
        String target = memberWorld(event.getPlayer().getName());
        if (target != null && (event.getTo() == null || event.getTo().getWorld() == null || !target.equals(event.getTo().getWorld().getName()))) {
            event.setCancelled(true);
            emit("cross_world_transfer_refused", row("player", event.getPlayer().getName(), "cause", event.getCause().name()));
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST) public void respawn(PlayerRespawnEvent event) {
        Player player = event.getPlayer(); String target = memberWorld(player.getName());
        if (target == null) return;
        World world = Bukkit.getWorld(target);
        if (world == null || !owned(world)) { player.kickPlayer("Pilot world unavailable for native respawn."); return; }
        boolean validBed = event.isBedSpawn() && event.getRespawnLocation().getWorld() != null
            && event.getRespawnLocation().getWorld().getUID().equals(world.getUID());
        if (!validBed) event.setRespawnLocation(world.getSpawnLocation());
        emit("respawn_selected", row("player", player.getName(), "bed_spawn", validBed,
            "native_bed_flag", event.isBedSpawn(), "missing_respawn_block", event.isMissingRespawnBlock(),
            "reason", event.getRespawnReason().name(), "source", validBed ? "native_bed" : "realm_world_spawn",
            "position", location(event.getRespawnLocation()), "no_teleport", true));
        UUID id = player.getUniqueId();
        Bukkit.getScheduler().runTask(this, () -> {
            Player current = Bukkit.getPlayer(id);
            if (current != null) emit("respawn_actual", playerRecord(current));
        });
    }

    @EventHandler(priority = EventPriority.MONITOR) public void death(PlayerDeathEvent event) {
        if (!memberName(event.getEntity().getName())) return;
        List<Map<String, Object>> drops = new ArrayList<>();
        for (ItemStack item : event.getDrops()) drops.add(row("item", item.getType().getKey().toString(), "count", item.getAmount()));
        emit("death", row("player", event.getEntity().getName(), "position", location(event.getEntity().getLocation()),
            "keep_inventory", event.getKeepInventory(), "drops", drops, "dropped_exp", event.getDroppedExp()));
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true) public void damage(EntityDamageEvent event) {
        if (!(event.getEntity() instanceof Player player) || !memberName(player.getName()) || !owned(player.getWorld())) return;
        emit("damage", row("player", player.getName(), "position", location(player.getLocation()),
            "cause", event.getCause().name(), "damage", event.getDamage(), "final_damage", event.getFinalDamage(),
            "health_before", player.getHealth(), "fall_distance", player.getFallDistance(),
            "no_damage_ticks", player.getNoDamageTicks(), "cancelled", false));
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = false) public void bedEnter(PlayerBedEnterEvent event) {
        if (!memberName(event.getPlayer().getName())) return;
        emit("bed_enter", row("player", event.getPlayer().getName(), "bed", location(event.getBed().getLocation()),
            "result", event.getBedEnterResult().name(), "cancelled", event.isCancelled()));
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = false) public void spawnSet(PlayerSetSpawnEvent event) {
        if (!memberName(event.getPlayer().getName())) return;
        emit("respawn_point_set", row("player", event.getPlayer().getName(), "cause", event.getCause().name(),
            "forced", event.isForced(), "cancelled", event.isCancelled(), "position", location(event.getLocation())));
        // A native event is a remembered claim, not proof that its block still
        // exists. Inspection checks both bed halves and Bukkit's safe respawn.
        if (event.isCancelled()) return;
        String name = event.getPlayer().getName();
        clearRespawnClaims(name);
        Location raw = event.getLocation();
        if ("BED".equals(event.getCause().name()) && !event.isForced() && raw != null
                && raw.getWorld() != null && owned(raw.getWorld()) && raw.getWorld().getName().equals(memberWorld(name))) {
            String key = "respawn_claims." + raw.getWorld().getUID() + "." + name;
            getConfig().set(key + ".world_uuid", raw.getWorld().getUID().toString());
            getConfig().set(key + ".world", raw.getWorld().getName());
            getConfig().set(key + ".x", raw.getBlockX()); getConfig().set(key + ".y", raw.getBlockY()); getConfig().set(key + ".z", raw.getBlockZ());
            getConfig().set(key + ".cause", "BED"); getConfig().set(key + ".forced", false);
            getConfig().set(key + ".at_ms", System.currentTimeMillis());
            getConfig().set(key + ".server_session", session);
        }
        saveConfig();
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false) public void timeSkip(TimeSkipEvent event) {
        if (!owned(event.getWorld())) return;
        if (event.getSkipReason() == TimeSkipEvent.SkipReason.COMMAND) {
            event.setCancelled(true);
            emit("production_time_command_ignored", row("world", event.getWorld().getName(),
                "world_uuid", event.getWorld().getUID().toString(), "requested_skip", event.getSkipAmount(),
                "game_time", event.getWorld().getGameTime(), "full_time", event.getWorld().getFullTime()));
        } else if (event.getSkipReason() == TimeSkipEvent.SkipReason.NIGHT_SKIP) {
            emit("native_night_skip", row("world", event.getWorld().getName(), "skip", event.getSkipAmount(),
                "cancelled", event.isCancelled(), "game_time", event.getWorld().getGameTime()));
        }
    }
}
