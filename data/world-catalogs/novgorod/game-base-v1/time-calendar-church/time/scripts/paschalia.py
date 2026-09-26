#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Deterministic Julian-calendar paschalia (Orthodox Easter) and derived movable
feasts/fasts for Novgorod 1230-1250.

Algorithm: Gauss's congruence-based rule for the Julian-calendar (Orthodox)
Easter date, as attested by:
  book:356156 (Леонтьева, Кобрин, Шорин, "Вспомогательные исторические
  дисциплины", 2009) §Глава 6. Хронология ¶1328-1333, confidence B.

  a = Y mod 19
  b = Y mod 4
  c = Y mod 7
  d = (19a + 15) mod 30
  e = (2b + 4c + 6d + 6) mod 7
  if d+e < 9: Easter = 22 + d + e March (Julian)
  else:       Easter = d + e - 9 April (Julian)

Self-check: cross-validated against the independent Meeus "Julian Easter"
algorithm (Meeus, Astronomical Algorithms, ch.8) for the same year range;
the script aborts (AssertionError) if the two disagree for any year.

All other movable dates are simple day-offsets from Easter, using the
Julian proleptic calendar (leap year iff year % 4 == 0), per:
  book:356156 §Глава 6 ¶1323 (Great Lent -40d before Easter measured to
  Holy Saturday i.e. Clean Monday = Easter-48; Palm Sunday = Easter-7;
  Ascension = Easter+39) and standard Orthodox typikon offsets not
  separately contested in the evidence (Pentecost/Troitsa = Easter+49;
  All Saints Sunday = Easter+56; start of Peter's fast = Monday after
  All Saints = Easter+57) -- confidence B/C as marked in the output CSV
  by the caller script, not here.

No network access, no external libraries. Run:
  python paschalia.py            # prints a table for 1230..1250
  python paschalia.py --json out.json
"""
from __future__ import annotations
import json
import sys

FIRST_YEAR = 1230
LAST_YEAR = 1250  # inclusive

MONTH_LENS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


def is_leap(y: int) -> bool:
    return y % 4 == 0


def month_lengths(y: int):
    ml = MONTH_LENS.copy()
    if is_leap(y):
        ml[1] = 29
    return ml


def day_of_year(y: int, m: int, d: int) -> int:
    ml = month_lengths(y)
    return sum(ml[: m - 1]) + d


def add_days(y: int, m: int, d: int, delta: int):
    """Add (possibly negative) delta days to a Julian-calendar date."""
    doy = day_of_year(y, m, d) + delta
    while True:
        ylen = 366 if is_leap(y) else 365
        if doy > ylen:
            doy -= ylen
            y += 1
        elif doy < 1:
            y -= 1
            doy += 366 if is_leap(y) else 365
        else:
            break
    ml = month_lengths(y)
    mm = 1
    while doy > ml[mm - 1]:
        doy -= ml[mm - 1]
        mm += 1
    return y, mm, doy


def gauss_julian_easter(year: int):
    a = year % 19
    b = year % 4
    c = year % 7
    d = (19 * a + 15) % 30
    e = (2 * b + 4 * c + 6 * d + 6) % 7
    if d + e < 9:
        return year, 3, 22 + d + e
    day = d + e - 9
    if day == 0:
        # Edge case: "April 0" denotes 31 March (occurs e.g. in 1241).
        return year, 3, 31
    return year, 4, day


def meeus_julian_easter(year: int):
    """Independent cross-check algorithm (Meeus, Astronomical Algorithms)."""
    a = year % 4
    b = year % 7
    c = year % 19
    d = (19 * c + 15) % 30
    e = (2 * a + 4 * b - d + 34) % 7
    month = (d + e + 114) // 31
    day = ((d + e + 114) % 31) + 1
    return year, month, day


def fmt(y, m, d):
    return f"{y:04d}-{m:02d}-{d:02d}"


def build_year(year: int):
    ge = gauss_julian_easter(year)
    me = meeus_julian_easter(year)
    assert ge == me, f"paschalia mismatch for {year}: gauss={ge} meeus={me}"
    ey, em, ed = ge

    out = {"year": year, "easter": fmt(ey, em, ed)}

    def off(days, key):
        y2, m2, d2 = add_days(ey, em, ed, days)
        out[key] = fmt(y2, m2, d2)

    off(-55, "maslenitsa_monday")          # cheese/butter week start
    off(-48, "great_lent_clean_monday")    # Great Lent begins
    off(-7, "palm_sunday")
    off(-3, "holy_thursday")
    off(-2, "good_friday")
    off(-1, "holy_saturday")
    off(0, "easter_sunday")
    off(7, "fomino_antipascha")
    off(9, "radunitsa")
    off(39, "ascension")
    off(49, "trinity_pentecost")
    off(50, "rusalnaya_nedelya_start")
    off(56, "all_saints_sunday")
    off(57, "peter_fast_start")

    # Peter's fast ends on the eve of Peter & Paul, 28 June (Julian), fixed.
    out["peter_fast_end"] = fmt(year, 6, 28)
    py, pm, pd = [int(x) for x in out["peter_fast_start"].split("-")]
    length_days = day_of_year(year, 6, 28) - day_of_year(py, pm, pd)
    if py != year:
        length_days = None  # would only happen for pathological offsets; flag
    out["peter_fast_length_days"] = length_days
    return out


def main():
    years = list(range(FIRST_YEAR, LAST_YEAR + 1))
    rows = [build_year(y) for y in years]
    if "--json" in sys.argv:
        idx = sys.argv.index("--json")
        path = sys.argv[idx + 1]
        with open(path, "w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=2)
        print(f"wrote {len(rows)} years to {path}")
    else:
        for r in rows:
            print(r)


if __name__ == "__main__":
    main()
