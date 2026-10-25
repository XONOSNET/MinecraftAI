"""Success remains the primary selection criterion; timing breaks ties."""
import math
import statistics


def completion_timing(values,expected):
    valid=[v for v in values if type(v) in (int,float) and math.isfinite(v) and v>0]
    return dict(timed_successes=len(valid),median_success_seconds=statistics.median(valid) if valid and len(valid)==expected else None)


def compare_candidate(baseline,score,timing,baseline_timing):
    if score<baseline:return False,'Lower success rate; retained the champion.'
    if score>baseline:return True,'Higher success rate; speed is secondary.'
    before=(baseline_timing or {}).get('median_success_seconds');after=timing.get('median_success_seconds')
    previous=(baseline_timing or {}).get('successful_case_seconds');current=timing.get('successful_case_seconds')
    if previous is not None or current is not None:
        if not previous or not current or set(previous)!=set(current):
            return True,'Success rate maintained; different successful routes prevent a fair timing comparison.'
    if before and after and min(timing.get('timed_successes',0),(baseline_timing or {}).get('timed_successes',0))>=3:
        if after>before*1.15:return False,'Same success rate but median successful completion was over 15% slower.'
        return True,'Success rate maintained; completion time remained within the 15% tolerance.'
    return True,'Success rate maintained; insufficient complete timing coverage for a speed comparison.'
