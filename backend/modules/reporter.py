"""
modules/reporter.py — Generovanie týždenného trénigového reportu
Výstup skopíruj a pošli AI trénerovi.
"""

from datetime import date, timedelta
from typing import Optional
from .fetcher import (
    get_recent_activities, get_hrv_data, get_sleep_data,
    get_body_battery, get_training_readiness, get_training_load,
    get_stats_summary
)


def generate_report(client, days: int = 7, output: Optional[str] = None):
    """Vygeneruje komplexný tréningový report."""

    print()
    print("📊 Sťahujem dáta z Garmin Connect...")
    print("   (môže trvať 10–20 sekúnd)")
    print()

    # Stiahni všetky dáta
    activities = get_recent_activities(client, days)
    hrv = get_hrv_data(client)
    sleep_data = get_sleep_data(client, days)
    body_battery = get_body_battery(client)
    readiness = get_training_readiness(client)
    load = get_training_load(client)
    stats = get_stats_summary(client)

    # Zostav report
    lines = []
    lines.append("=" * 55)
    lines.append("  🏃 HANSONS HALF-MARATHON — TÝŽDENNÝ REPORT")
    lines.append(f"  Dátum: {date.today().strftime('%d.%m.%Y')}")
    lines.append(f"  Obdobie: posledných {days} dní")
    lines.append("=" * 55)

    # --- HRV ---
    lines.append("")
    lines.append("▶ HRV STATUS")
    if hrv:
        status_map = {
            "BALANCED": "✅ Vyvážený",
            "UNBALANCED": "⚠️  Nevyvážený",
            "LOW": "🔴 Nízky",
            "POOR": "🔴 Slabý",
        }
        status_label = status_map.get(str(hrv.get("status", "")).upper(), hrv.get("status", "N/A"))
        lines.append(f"  Stav:          {status_label}")
        if hrv.get("last_night"):
            lines.append(f"  Minulá noc:    {hrv['last_night']} ms")
        if hrv.get("weekly_avg"):
            lines.append(f"  Týždenný prier.: {hrv['weekly_avg']} ms")
    else:
        lines.append("  Dáta nie sú dostupné")

    # --- Training Readiness ---
    lines.append("")
    lines.append("▶ TRAINING READINESS")
    if readiness and readiness.get("score") is not None:
        score = readiness["score"]
        if score >= 70:
            emoji = "🟢"
        elif score >= 40:
            emoji = "🟡"
        else:
            emoji = "🔴"
        lines.append(f"  Skóre: {emoji} {score}/100")
        if readiness.get("level"):
            lines.append(f"  Úroveň: {readiness['level']}")
    else:
        lines.append("  Dáta nie sú dostupné")

    # --- Body Battery ---
    lines.append("")
    lines.append("▶ BODY BATTERY")
    if body_battery:
        today_val = body_battery.get("today_charged")
        weekly_avg = body_battery.get("weekly_avg")
        if today_val is not None:
            bb_emoji = "🟢" if today_val >= 60 else ("🟡" if today_val >= 30 else "🔴")
            lines.append(f"  Dnes ráno:     {bb_emoji} {today_val}/100")
        if weekly_avg is not None:
            lines.append(f"  Týždenný prier.: {weekly_avg}/100")
    else:
        lines.append("  Dáta nie sú dostupné")

    # --- Spánok ---
    lines.append("")
    lines.append("▶ SPÁNOK (posledných 7 nocí)")
    if sleep_data:
        total_hours = [s["duration_hours"] for s in sleep_data if s.get("duration_hours")]
        avg_sleep = round(sum(total_hours) / len(total_hours), 1) if total_hours else None
        scores = [s["score"] for s in sleep_data if s.get("score")]
        avg_score = round(sum(scores) / len(scores)) if scores else None

        if avg_sleep:
            sleep_emoji = "🟢" if avg_sleep >= 7 else ("🟡" if avg_sleep >= 6 else "🔴")
            lines.append(f"  Priemerná dĺžka: {sleep_emoji} {avg_sleep} hod.")
        if avg_score:
            lines.append(f"  Priemerné skóre: {avg_score}/100")

        lines.append("  Detaily:")
        for s in sleep_data[:7]:
            d = s["date"]
            h = f"{s['duration_hours']}h" if s.get("duration_hours") else "N/A"
            sc = f" (skóre: {s['score']})" if s.get("score") else ""
            lines.append(f"    {d}: {h}{sc}")
    else:
        lines.append("  Dáta nie sú dostupné")

    # --- Tréningová záťaž ---
    lines.append("")
    lines.append("▶ TRÉNINGOVÁ ZÁŤAŽ")
    if load:
        if load.get("acute_load"):
            lines.append(f"  Akútna záťaž:   {load['acute_load']:.0f}")
        if load.get("chronic_load"):
            lines.append(f"  Chronická záťaž: {load['chronic_load']:.0f}")
        if load.get("ratio"):
            ratio = load["ratio"]
            ratio_emoji = "🟢" if 0.8 <= ratio <= 1.3 else ("🟡" if 0.6 <= ratio <= 1.5 else "🔴")
            lines.append(f"  Pomer A:C:      {ratio_emoji} {ratio:.2f}")
    else:
        lines.append("  Dáta nie sú dostupné")

    # --- Pokojový tep ---
    lines.append("")
    lines.append("▶ OSTATNÉ METRIKY")
    if stats:
        if stats.get("resting_hr"):
            lines.append(f"  Pokojový tep:   {stats['resting_hr']} bpm")
        if stats.get("avg_stress") is not None:
            stress = stats["avg_stress"]
            stress_emoji = "🟢" if stress < 26 else ("🟡" if stress < 51 else "🔴")
            lines.append(f"  Priem. stres:   {stress_emoji} {stress}/100")

    # --- Aktivity ---
    lines.append("")
    lines.append(f"▶ AKTIVITY — posledných {days} dní")

    running_activities = [a for a in activities if
                          a.get("activityType", {}).get("typeKey", "") in ["running", "track_running"]]
    other_activities = [a for a in activities if
                        a.get("activityType", {}).get("typeKey", "") not in ["running", "track_running"]]

    total_run_km = sum(a.get("distance", 0) for a in running_activities) / 1000
    lines.append(f"  Celkový objem behu: {total_run_km:.1f} km")
    lines.append(f"  Počet behov: {len(running_activities)}")
    lines.append("")

    if running_activities:
        lines.append("  BEHY:")
        for act in running_activities:
            act_date = act.get("startTimeLocal", "")[:10]
            dist = act.get("distance", 0) / 1000
            duration_sec = act.get("duration", 0)
            avg_hr = act.get("averageHR")
            max_hr = act.get("maxHR")
            avg_speed = act.get("averageSpeed", 0)  # m/s

            # Vypočítaj tempo z rýchlosti
            if avg_speed and avg_speed > 0:
                pace_sec_per_km = 1000 / avg_speed
                pace_min = int(pace_sec_per_km // 60)
                pace_sec = int(pace_sec_per_km % 60)
                pace_str = f"{pace_min}:{pace_sec:02d}/km"
            else:
                pace_str = "N/A"

            hr_str = f"HR avg {avg_hr}/{max_hr} bpm" if avg_hr else "HR N/A"
            name = act.get("activityName", "Beh")
            lines.append(f"    {act_date}: {name}")
            lines.append(f"      {dist:.1f} km | {pace_str} | {hr_str}")

    if other_activities:
        lines.append("")
        lines.append("  INÉ AKTIVITY:")
        for act in other_activities:
            act_date = act.get("startTimeLocal", "")[:10]
            act_type = act.get("activityType", {}).get("typeKey", "unknown")
            duration_sec = act.get("duration", 0)
            duration_min = int(duration_sec // 60) if duration_sec else 0
            name = act.get("activityName", act_type)
            lines.append(f"    {act_date}: {name} ({duration_min} min)")

    # --- Záver ---
    lines.append("")
    lines.append("=" * 55)
    lines.append("  📋 KONIEC REPORTU — skopíruj a pošli AI trénerovi")
    lines.append("=" * 55)
    lines.append("")

    report_text = "\n".join(lines)

    # Vypíš na konzolu
    print(report_text)

    # Uloží do súboru ak požadované
    if output:
        with open(output, "w", encoding="utf-8") as f:
            f.write(report_text)
        print(f"💾 Report uložený: {output}")

    # Automaticky uloží do reports/ priečinka
    from pathlib import Path
    reports_dir = Path(__file__).parent.parent / "reports"
    reports_dir.mkdir(exist_ok=True)
    report_file = reports_dir / f"report_{date.today().isoformat()}.txt"
    with open(report_file, "w", encoding="utf-8") as f:
        f.write(report_text)
    print(f"💾 Report automaticky uložený: {report_file}")
