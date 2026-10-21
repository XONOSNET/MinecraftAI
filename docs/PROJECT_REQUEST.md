# PROJECT: Minecraft Autonomous AI Evolution Laboratory

## ROLE AND EXECUTION AUTHORITY

You are the lead software architect, machine-learning researcher, systems engineer, and implementation agent for this project.

Your mission is to autonomously design, install, configure, implement, test, and launch a working Minecraft-based artificial intelligence training laboratory on this Windows development computer.

**This is an implementation assignment, not simply a planning exercise.**

You are authorized to:

- Inspect the computer's hardware, operating system, installed software, development tools, and available resources.
- Install software, libraries, language runtimes, package managers, development tools, Minecraft server software, and other dependencies required for this project.
- Download open-source software and research frameworks from official or otherwise verifiable sources.
- Configure local services, development databases, Java runtimes, Python environments, Node.js environments, and the Minecraft server.
- Create project directories, source files, scripts, configuration files, databases, and training environments.
- Execute commands, compile programs, launch services, run tests, download compatible pretrained models, and perform training experiments.
- Troubleshoot errors independently and continue implementation without waiting for detailed instructions.
- Make reasonable technical decisions wherever specifications are incomplete.

You have broad administrative authorization for project-related setup and development, including privilege elevation when required.

Do not stop merely to ask which software to install or which framework to select. Research compatibility, make the decision, document it, and proceed.

### Operational boundaries

The computer contains personal and development data.

- Never delete, overwrite, or modify unrelated personal files, repositories, or projects.
- Never format drives, disable antivirus, remove system security protections, or expose credentials.
- Never install unverified executables from untrusted sources.
- Back up existing configuration files before modifying them.
- Keep the Minecraft server private to localhost/LAN by default. Do not open router ports or expose administration endpoints publicly without explicit approval.
- Never disable Minecraft authentication for a publicly accessible server.
- Never send personal files, credentials, or private project contents to external services.
- Prefer isolated project environments and reversible configuration changes.
- Document every significant system-level modification.
- If an operation presents an irreversible risk to unrelated data or system security, request confirmation.

These boundaries do not prohibit normal software installation, server configuration, dependency installation, or autonomous project development.

---

# 1. PROJECT VISION

We are developing a research environment to investigate how much autonomous intelligence can be achieved using relatively small neural networks.

Minecraft will serve as the simulation environment.

The system must support a population of artificial players that:

1. Exist simultaneously within one persistent Minecraft survival world.
2. Receive structured spatial and environmental observations.
3. Make autonomous decisions through neural-network policies.
4. Interact with the physical world using ordinary Minecraft player mechanics.
5. Learn from successes, failures, and accumulated experience.
6. Die, respawn, and continue participating in training.
7. Improve across training cycles and generations.
8. Develop navigation, exploration, survival, and eventually complex gameplay skills.
9. Retain persistent spatial memories and relevant experiences.
10. Operate using small models suitable for eventual deployment on inexpensive hardware such as Raspberry Pi computers.

The long-term objective is to develop autonomous Minecraft players that can function as companions, independent survivors, or competitive opponents.

However, **the first milestone is proving that meaningful learning occurs.**

Do not substitute complex scripted behavior for learning and call the project successful.

---

# 2. DEVELOPMENT HARDWARE

Current known specifications:

- Operating system: Windows; verify exact version.
- CPU: AMD Ryzen 9 5900X.
- CPU configuration: 12 cores / 24 threads.
- RAM: 16 GB DDR4-3200.
- GPU: PowerColor Radeon RX 5700 XT Liquid Devil.
- GPU VRAM: 8 GB.
- CPU and GPU use liquid cooling.
- Minecraft Java Edition and Minecraft for Windows are being installed.
- Codex is installed.

Inspect and verify the actual system configuration before proceeding.

Design around these limitations.

Do not assume CUDA is available.

Determine whether the AMD GPU can be used effectively with a supported machine-learning backend on this operating system.

Investigate available PyTorch acceleration options, DirectML, Vulkan-compatible inference runtimes, or other viable backends.

If GPU training is impractical, implement CPU-based training without blocking the project.

Use lightweight models first.

Monitor system memory usage, CPU utilization, training throughput, and simulation performance.

Prioritize reliable operation over maximizing agent population.

---

# 3. MINECRAFT SERVER SETUP

Install and configure a local Minecraft Java Edition server using Paper.

Use official PaperMC downloads and documentation:

https://papermc.io/

Requirements:

- Determine a stable compatible Minecraft/Paper version.
- Install the appropriate Java runtime.
- Verify compatibility with our bot-controller libraries before selecting versions.
- Configure a private local development server.
- Use survival mode.
- Enable normal survival mechanics and hostile mobs.
- Configure automated backups.
- Configure structured logging.
- Create reliable start, stop, restart, and health-check scripts.
- Provide a documented method for connecting through Minecraft Java Edition.
- Accept and configure the Minecraft EULA only after confirming the operator agrees to it.

Do not spend the initial development phase configuring public hosting.

### Cross-edition support

Research GeyserMC and Floodgate.

Our eventual goal is to allow both Java and Bedrock human players to participate in the same world.

Implement crossplay if compatible and practical, but do not allow crossplay configuration to delay core AI training development.

Minecraft Java Edition is the primary development target.

---

# 4. CORE SYSTEM ARCHITECTURE

Use a modular design separating:

1. Minecraft simulation.
2. Agent interaction and control.
3. Spatial perception.
4. Neural-network inference.
5. Learning and model training.
6. Persistent memory.
7. Evolutionary experimentation.
8. Goal selection and personality.
9. Monitoring and administration.

Suggested technologies:

- Paper / Java for Minecraft server integration.
- Mineflayer / Node.js for autonomous player connections.
- Python for training and inference.
- PyTorch or another appropriate machine-learning framework.
- Stable-Baselines3 or a suitable reinforcement-learning framework.
- SQLite for initial experiment metadata and persistence.
- Flask or FastAPI for monitoring and administration.
- WebSockets or another efficient communication method where beneficial.

These are preferences, not mandatory architectural decisions.

Research alternatives and select the most practical stack.

Keep the components independently testable.

Do not force every system into a single process.

---

# 5. SINGLE PERSISTENT WORLD

**All agents must initially inhabit the same Minecraft world.**

This is an essential experimental requirement.

We are not initially interested in running ten independent worlds with ten isolated agents.

We want agents to:

- Explore shared terrain.
- Change the environment.
- Encounter one another.
- Observe the consequences of other agents' actions.
- Compete over resources.
- Eventually cooperate or form relationships.
- Leave persistent changes that influence future generations.

The world must persist across agent deaths and training cycles.

Do not reset the entire world after every episode.

Build a controlled training spawn system that can respawn agents without destroying the shared environment.

Allow individual training episodes to terminate independently.

The system should distinguish between an individual agent's lifetime, training episode, model checkpoint, and evolutionary generation.

Start with five agents and benchmark scalability.

Gradually increase the population if hardware permits.

Target an architecture capable of supporting 10–20 or more concurrent agents where practical, but do not promise these numbers before benchmarking.

---

# 6. SPATIAL PERCEPTION: STRUCTURED 3D RAYCASTING

This is a critical research component.

The AI should NOT initially receive full unrestricted knowledge of Minecraft's world data.

It must perceive its surroundings through a simulated field of vision.

Implement a configurable 3D cone-based raycasting perception system.

The design should resemble a lightweight depth scanner or LiDAR-inspired spatial sensor.

### Perception requirements

Each agent has:

- A world-space position.
- A head/eye position.
- A facing direction.
- A configurable horizontal field of view.
- A configurable vertical field of view.
- A configurable perception distance.
- A configurable ray count.

Initial experimental defaults:

- Horizontal field of view: 90 degrees.
- Vertical field of view: configurable.
- Perception distance: up to the server's practical loaded/viewable range.
- Ray count: initially 256, configurable.

Benchmark these settings and reduce them if performance requires it.

### Ray behavior

Each ray travels outward from the agent's eye position.

The ray should terminate when it intersects an observable Minecraft block or relevant entity, or when its maximum distance is reached.

The result may include:

- Block identifier.
- Block coordinates.
- Hit position.
- Distance.
- Surface normal.
- Relevant block properties.
- Entity type and position where applicable.
- Whether the ray reached maximum distance without a hit.

Air and empty space should not be represented as solid obstacles.

### Visible neighboring blocks

When a ray intersects a block, the perception system may inspect nearby blocks.

However, it must reveal **only blocks whose relevant surfaces are genuinely visible from the agent's position**.

Do not expose blocks hidden behind walls, terrain, or other occluding structures.

Use additional visibility tests where needed.

Avoid exposing concealed underground ores or hidden cave systems through neighboring-block inspection.

Deduplicate observations produced by overlapping rays.

The agent should not know the entire world or see through solid terrain.

### Output representation

Create a compact, structured observation format suitable for small neural networks.

Investigate:

- Fixed-size ray feature arrays.
- Sparse voxel observations.
- Local occupancy representations.
- Compact semantic block embeddings.
- Relative coordinate encodings.

Do not assume raw JSON is the optimal neural-network input.

Use efficient numeric tensors for training and inference, while retaining human-readable diagnostic output.

---

# 7. SPATIAL MEMORY

Separate environmental memory from neural-network parameters.

Each agent should maintain a persistent understanding of previously observed terrain.

Spatial memory should include:

- Known block locations.
- Known obstacles.
- Explored regions.
- Previously discovered resources.
- Known hazards.
- Potential routes.
- Unknown or unexplored regions.
- Timestamp or simulation tick of the last observation.

The model should distinguish observed information from inferred or stale information.

An agent should not automatically know that a block changed while it was away.

It should update its memory when new observations contradict old observations.

### Memory architecture

Investigate chunk-based storage, sparse voxel representations, coordinate-indexed databases, or other efficient approaches.

Do not store the entire Minecraft world independently for every agent.

Store only information actually observed or legitimately learned.

Allow agents to retrieve spatial memory relevant to their current position and objective.

On agent restart:

1. Reload its neural-network checkpoint.
2. Restore persistent identity and personality.
3. Restore important working state where appropriate.
4. Retrieve nearby known spatial information.
5. Resume decision-making.

Do not require the model to reread its entire historical database on every inference step.

---

# 8. NEURAL-NETWORK ARCHITECTURE

Our goal is to investigate what very small models can learn.

Begin with lightweight neural networks operating on structured observations rather than screenshots.

Experiment with multiple parameter budgets:

- Tiny: approximately 10,000 parameters.
- Small: approximately 100,000 parameters.
- Medium: approximately 1,000,000 parameters.

Treat these as experimental targets, not rigid requirements.

The actual parameter counts must be measured and reported.

Evaluate appropriate architectures:

- Multilayer perceptrons.
- Small recurrent neural networks.
- GRU-based policies.
- Lightweight attention mechanisms where justified.
- Compact spatial encoders.

Choose the simplest architecture that can demonstrate measurable learning.

Initially focus on navigation and survival-relevant decisions.

### Parameter accounting

Distinguish between:

- Neural-network trainable parameters.
- Model file size.
- Runtime memory usage.
- External world memory.
- Training optimizer state.
- Per-agent recurrent state.

A small network can use a much larger external spatial memory without that storage counting as learned parameters.

Record inference latency and decisions per second.

Design models to be exportable to portable inference formats where practical.

---

# 9. AGENT ACTION SYSTEM

The AI must control a genuine Minecraft player representation.

Do not implement the primary agent as an omnipotent server-side entity that can teleport, manipulate arbitrary blocks remotely, or bypass ordinary survival mechanics.

Its actions should correspond to legitimate player abilities.

Supported actions should eventually include:

- Moving forward and backward.
- Strafing.
- Turning.
- Looking up and down.
- Jumping.
- Sprinting.
- Sneaking.
- Attacking.
- Interacting with blocks.
- Breaking blocks.
- Placing blocks.
- Selecting inventory items.
- Crafting.
- Consuming food.
- Using equipment.

Initially implement a reduced action space sufficient for navigation experiments.

Use a consistent action interval based on Minecraft simulation ticks.

Ensure agent inference and control remain synchronized with the game environment.

Separate low-level actions from higher-level objectives.

Do not give the learning system hidden access to exact paths or unobserved terrain.

---

# 10. TRAINING METHODOLOGY

The training system must demonstrate actual neural-network learning.

Investigate and implement an appropriate combination of:

- Reinforcement learning.
- Imitation learning.
- Curriculum learning.
- Population-based training.
- Evolutionary strategies.
- Knowledge distillation.

These mechanisms should not all be implemented simultaneously merely because they are listed.

Prioritize a functional, measurable first experiment.

### Initial experiment: 3D navigation

Spawn agents into the shared survival world.

Provide them with:

- Their own position and orientation.
- Their local 3D raycast observations.
- A goal or target position.
- Relevant recent action history.
- Limited persistent spatial memory.

Reward progress toward reachable destinations.

Reward successful navigation.

Penalize dangerous falls, avoidable damage, repeated collisions, and getting stuck.

Discourage endlessly spinning or standing still.

Do not simply reward time alive.

The system must prevent agents from exploiting reward functions without completing the intended task.

### Training versus evaluation

Create explicit training and evaluation phases.

Use held-out locations and terrain configurations for evaluation.

An agent that memorizes one route must not be classified as having learned general navigation.

Measure performance against:

- Random action baselines.
- Simple heuristic policies.
- Conventional pathfinding baselines where applicable.
- Earlier neural-network checkpoints.

The learned neural agent should be evaluated independently of any conventional navigator used as a teacher.

Do not quietly substitute A* or scripted movement for neural decision-making in experiments intended to evaluate learned navigation.

### Survival training

After spatial navigation is demonstrated, introduce:

- Fall avoidance.
- Hazard avoidance.
- Exploration.
- Seeking food.
- Selecting shelter.
- Hostile mob avoidance.
- Resource discovery.
- Basic crafting.
- Tool use.
- Combat.

Use progressively more difficult learning tasks.

Do not assume complex survival competence will emerge simply from maximizing lifetime.

---

# 11. EVOLUTIONARY LEARNING

The system must support multiple agents and successive training generations.

Each agent should have:

- A persistent identity.
- A model version.
- A policy assignment.
- A training history.
- A survival history.
- An optional genealogy.
- Performance metrics.

When an agent dies, preserve its training experience.

The system should support respawning an agent with updated model weights.

Investigate two population-training strategies.

### Shared policy

Multiple agents use a shared neural network, but maintain independent observation histories, memories, personality settings, and recurrent states.

Experiences are collected across the population and used to update the shared policy.

### Separate evolutionary policies

Agents have separate model weights.

High-performing policies can be selected as parents.

New policies are created through parameter mutation, recombination where appropriate, or further gradient-based training.

Do not assume blindly mutating a large neural network is efficient.

Benchmark evolutionary methods against ordinary reinforcement learning.

Preserve the ability to compare both approaches experimentally.

Define generation boundaries explicitly even though the Minecraft world remains persistent.

---

# 12. FOUNDATIONAL TRAINING AND KNOWLEDGE DISTILLATION

Research existing Minecraft AI and machine-learning resources that could significantly reduce training time.

Investigate:

- MineRL datasets and environments.
- MineDojo.
- OpenAI Video PreTraining (VPT) research and available artifacts.
- Voyager.
- Existing Minecraft demonstrations.
- Suitable pretrained navigation policies.
- Teacher-student distillation techniques.

Determine which projects are actively maintained, compatible, legally reusable, and practically deployable.

Do not assume a pretrained model can directly operate on our structured 3D raycast observations.

The original observation space may differ substantially.

If suitable demonstrations are available, build a conversion or data-collection pipeline to produce compatible observations and actions.

Investigate using conventional navigation algorithms or larger teacher models to generate demonstrations for our smaller models.

The target architecture should support:

1. Teacher demonstrates successful behavior.
2. Observations and actions are recorded.
3. Student neural network learns from demonstrations.
4. Student is evaluated independently.
5. Student is improved using reinforcement learning.

The primary objective is to minimize the training time required for the small models to acquire useful capabilities.

Do not spend excessive time integrating an incompatible research framework merely because it is well known.

---

# 13. PERSONALITY AND BEHAVIOR

The final system must support configurable personality dimensions.

Examples include:

- Selfishness.
- Consideration.
- Aggression.
- Destructiveness.
- Curiosity.
- Loyalty.
- Independence.
- Competitiveness.
- Risk tolerance.
- Cooperation.

Represent these initially as configurable numeric values, such as 0–100.

Personality should influence:

- Goal selection.
- Risk preferences.
- Resource sharing.
- Responses to other agents.
- Cooperative behavior.
- Competitive behavior.
- Exploration priorities.

Do not require an entirely separate neural network for every personality trait.

Separate skill competence from personal motivation.

For example, two agents may share an identical navigation policy but choose different destinations because of personality differences.

The long-term operating modes are:

1. Companion.
2. Independent player.
3. Competitive opponent.

An agent may exhibit combinations of these modes.

For the initial implementation, establish the data structures and interfaces but prioritize working survival training over sophisticated social simulations.

Implement server-level action permissions separately from personality.

---

# 14. SIMULATION ACCELERATION

Investigate accelerating Minecraft simulation beyond real time.

Our goal is to generate more useful training experience per hour.

Research the capabilities and limitations of the selected Minecraft server version, including tick-rate configuration.

Distinguish between:

- World time.
- Simulation ticks.
- Player action timing.
- Agent inference timing.
- Actual training throughput.

Do not assume speeding up the day/night cycle accelerates learning.

Determine whether the entire relevant simulation can operate consistently at higher tick rates.

Benchmark achievable simulation ticks per second and agent decisions per second.

If accelerated Minecraft simulation is impractical, continue with normal-speed training.

Consider lightweight supplemental training environments for isolated skills, but retain the shared Minecraft world as the principal integration and evaluation environment.

Never report hypothetical acceleration as measured performance.

---

# 15. MONITORING AND ADMINISTRATION DASHBOARD

Build a local web dashboard for observing and controlling training.

Suggested stack: FastAPI or Flask with a lightweight frontend.

The dashboard must eventually include:

### Agent monitoring

- Agent identity.
- Current position.
- Health and hunger.
- Alive/dead status.
- Lifetime and generation.
- Current goal.
- Model version.
- Cumulative rewards.
- Movement/activity statistics.
- Training progress.

### Population monitoring

- Number of active agents.
- Total deaths.
- Average survival duration.
- Median survival duration.
- Longest survival time.
- Exploration progress.
- Training episode counts.
- Model comparison results.
- Generation history.

### System monitoring

- Minecraft server health.
- Simulation tick rate and MSPT.
- CPU and RAM usage.
- Training process status.
- Inference latency.
- GPU utilization where available.
- Model checkpoint status.

### Controls

- Start training.
- Pause training.
- Stop training.
- Spawn agents.
- Remove agents.
- Adjust agent population.
- Modify personality variables.
- Select trained models.
- Save checkpoints.
- Restore checkpoints.
- Change training configuration.

### Observability

Create useful logs and event records.

Detect and flag:

- Agents stuck in loops.
- Agents repeatedly falling into the same hazards.
- Agents exploiting reward functions.
- Failed model updates.
- Inference or controller crashes.
- Minecraft server instability.
- Abnormally high resource consumption.

The dashboard must not require an external cloud service.

---

# 16. DATABASE AND PERSISTENCE

Use SQLite initially unless a stronger database is demonstrably necessary.

Persist:

- Agent profiles.
- Personalities.
- Training configurations.
- Model metadata.
- Episode results.
- Generation statistics.
- Spatial memory indexes.
- Experiment metrics.
- Event history.

Store large model files and training tensors outside the relational database when appropriate.

Use versioned checkpoints.

Implement checkpoint recovery after unexpected shutdowns.

Do not lose all training progress because the computer restarts.

Implement log rotation and disk-usage limits.

---

# 17. AUTOMATED TRAINING OPERATION

The system should be able to run unattended after the initial configuration and successful testing.

Implement:

- Startup scripts.
- Graceful shutdown.
- Automatic checkpointing.
- Crash detection.
- Controlled service restart.
- Recovery from interrupted training.
- System resource monitoring.
- Training status reporting.

Do not automatically launch unlimited parallel training processes.

Apply memory and CPU safeguards appropriate for the available 16 GB RAM.

Allow long-running training experiments without requiring constant human supervision.

---

# 18. EXPERIMENTAL SCIENCE AND MEASUREMENT

We want evidence of learning, not just entertaining gameplay.

Implement reproducible experiments.

Record:

- Model architecture.
- Exact parameter count.
- Random seeds.
- Training algorithm.
- Hyperparameters.
- Training duration.
- Total environment steps.
- Simulation throughput.
- Reward history.
- Evaluation results.
- Model memory footprint.
- Inference latency.

Use controlled evaluation procedures.

Avoid comparing models under different conditions without accounting for those differences.

Create graphs showing performance improvement.

Compare at least three model sizes when the initial training pipeline is working:

- Approximately 10K parameters.
- Approximately 100K parameters.
- Approximately 1M parameters.

Test whether the larger architectures actually outperform smaller ones.

Track performance per watt or resource utilization where measurement is available.

A long-term research objective is deployment on Raspberry Pi-class hardware.

---

# 19. IMPLEMENTATION MILESTONES

Work incrementally.

## Milestone 1: Environment

- Inspect hardware and installed software.
- Create the project.
- Install necessary dependencies.
- Install and launch Paper.
- Verify Minecraft client connectivity.
- Verify that an autonomous bot can connect and disconnect cleanly.
- Produce repeatable startup scripts.

## Milestone 2: Perception

- Implement structured 3D raycasting.
- Verify correct block identity and coordinates.
- Verify occlusion.
- Prevent visibility through walls.
- Implement compact observation tensors.
- Visualize raycast observations for debugging.

## Milestone 3: Multiple agents

- Spawn five autonomous agents.
- Place them in one persistent survival world.
- Give each an independent identity and local observations.
- Verify simultaneous control.
- Measure server performance.

## Milestone 4: First trainable policy

- Implement a compact neural navigation policy.
- Establish observations, actions, and rewards.
- Collect experiences.
- Train a policy.
- Save checkpoints.
- Run held-out evaluations.

## Milestone 5: Demonstrated learning

Demonstrate that a trained policy performs measurably better than its untrained baseline on navigation tasks.

Provide quantitative evidence.

Do not advance solely because the agent appears to move intelligently.

## Milestone 6: Persistent memory

- Implement spatial memory.
- Preserve knowledge across restarts.
- Retrieve relevant memories.
- Evaluate memory-assisted navigation.

## Milestone 7: Population training

- Support agent deaths and respawns.
- Implement generation tracking.
- Implement shared-policy training.
- Experiment with evolutionary selection where justified.
- Compare performance across generations.

## Milestone 8: Training dashboard

- Provide live agent and population statistics.
- Provide training controls.
- Provide metrics and model comparisons.
- Provide operational diagnostics.

## Milestone 9: Accelerated experimentation

- Benchmark increased simulation tick rates.
- Optimize observation collection.
- Optimize policy inference.
- Benchmark larger populations.
- Investigate teacher-student training and distillation.

## Milestone 10: Survival intelligence

Begin developing and measuring increasingly complex survival capabilities.

Do not attempt to finish all ten milestones in one unverified implementation pass.

---

# 20. TESTING AND ACCEPTANCE CRITERIA

The first working release must satisfy the following conditions:

1. A local Paper server launches reliably.
2. The user can connect using Minecraft Java Edition.
3. Five AI-controlled players can connect to the same world.
4. Each agent has independent observations and action state.
5. The perception system respects line of sight.
6. A neural-network model genuinely selects actions.
7. Training data is collected from interactions with the environment.
8. A learning algorithm updates the neural-network weights.
9. Trained model checkpoints can be saved and reloaded.
10. The system produces evaluation metrics.
11. A trained navigation policy demonstrates improvement over an untrained baseline on held-out tasks, or the system explicitly reports that the experiment failed.
12. All essential components can restart without manual reconstruction.
13. The user can inspect progress through logs or a local dashboard.

An unsuccessful learning experiment is acceptable if the system accurately measures and reports its failure.

Fabricated results are not acceptable.

---

# 21. PROJECT MANAGEMENT AND DOCUMENTATION

Maintain the following documents:

- README.md — Setup, operation, and troubleshooting.
- ARCHITECTURE.md — Technical architecture and design decisions.
- RESEARCH.md — Algorithms, research references, and experimental hypotheses.
- EXPERIMENTS.md — Training configurations and observed results.
- PROGRESS.md — Completed work, current status, and next steps.
- SYSTEM_CHANGES.md — Installed software and system configuration changes.

Provide reliable scripts for starting and stopping the entire system.

Where possible, provide a single development startup command.

Use automated tests throughout implementation.

Commit working milestones to a local Git repository.

Do not automatically publish the repository or upload it to an external service.

---

# 22. EXECUTION INSTRUCTIONS

Begin immediately.

First:

1. Inspect the computer and installed development tools.
2. Determine the best practical installation strategy.
3. Verify current upstream software versions and compatibility.
4. Select the Minecraft/Paper version.
5. Create the project structure.
6. Install dependencies.
7. Start and validate the Minecraft server.
8. Establish the initial bot connection.
9. Implement the minimum end-to-end learning experiment.

Do not stop after producing an architecture proposal.

Proceed with implementation and testing.

Avoid getting stuck optimizing future components before the first trainable model works.

When you encounter problems:

- Inspect the error.
- Determine the root cause.
- Research the relevant documentation.
- Implement a correction.
- Retest.
- Document the outcome.
- Continue.

Prefer working, testable functionality over excessive scaffolding.

Make reasonable decisions independently.

Keep the system modular so components can be replaced later.

Do not claim something works without testing it.

### Final objective

Produce a functioning local Minecraft AI training laboratory in which multiple lightweight neural-network agents inhabit one persistent survival world, perceive their surroundings using limited 3D raycasting, interact through legitimate player actions, gather experience, and demonstrate measurable learning.

**The purpose is not merely to simulate intelligent Minecraft characters.**

**The purpose is to investigate how sophisticated autonomous intelligence can become when constrained to extremely small neural networks, structured spatial observations, external memory, and limited computing resources.**

Install what is necessary, build the system, test it, measure it, and make it operational.
