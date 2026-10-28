# First Night completion counter investigation

The reported text comes from the in-game observer bossbar. It used the current world's result dictionary even while that dictionary was empty during terrain restoration, and omitted whether the current trial was teacher or policy controlled. A new trial resets its own results.

Observed saved results: trial 368 student 6/8; trial 369 teacher 8/8; trial 370 student 5/8. Latest student failures were two entry progress timeouts and one refused floor placement. Current automatic cycle 91 was preparing its teacher trial when investigated. These results disprove an overall zero-completion interpretation, but do not establish every bot is reliable. Automatic advancement requires 75% student completion for two consecutive completed comparison cycles; teacher completion alone does not qualify.

The observer header now distinguishes restoration percentage from an active teacher/policy run, reports stopped bots separately, and includes the last completed policy result at the same support level. Teacher trials and reserved assessments cannot replace that score. The dashboard also explains the counter reset and advancement condition beside First Night progression.

Validation: all 60 observer tests pass, including restoration labels and selection of the previous matching policy run. The dashboard HTML is served from disk and updates on refresh. The observer Python change was staged initially to preserve the active trial, then loaded during the subsequent combat/hunting update restart.
