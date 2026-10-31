# Resuming terrain preparation after memory pressure

The repeated zero-percent save on October 30 came from the memory watchdog: above 90% system memory it stopped WorldTraining, discarding its copy queue. Below 84%, WorldLearning began a new comparison and a new snapshot of the same site. Minecraft itself stayed online. This was separate from the preceding site survey failure, where no safe natural spawn existed.

Memory suspension now holds an active snapshot or restoration in place. It preserves the run, percentage, remaining tiles, current slice, log offset, preloaded tile and livestock preparation. The preparation tick sends no commands while held; its status message and in-game label explain the memory wait. Recovery below the existing 84% threshold resumes the original baseline, demonstration or candidate evaluation, retaining that comparison's model weights and protected-model bundle. Command deadlines exclude the time spent held so an acknowledgement received during the wait remains valid. No template is declared saved until the whole preparation succeeds.

Continuation is deliberately process-local. Manual stop, server restart, service restart, missing preparation or a memory interruption during actual gameplay use the existing fresh-comparison recovery path, restoring unvalidated models first. This does not resume a partially saved world after a service restart. It does not change the memory limits, copy pacing, resources or success criteria.

Focused tests cover an in-flight clone acknowledged during a five-minute hold, the next slice's position, unchanged queues and progress, fauna acknowledgement deadlines, wrong run IDs, manual stop, candidate-weight preservation and recovery when continuation is unavailable.
