#!/usr/bin/env python3
"""Generate Temporal World v4 Novgorod daylight authoring rows.

Inputs are Julian-calendar dates for years 1230-1233 and the approved Novgorod
coordinate. Solar coordinates follow the standard NOAA/Meeus equations. The
result is local mean solar time. Each boundary is rounded once at authoring time
to the nearest whole minute with floor(value + 0.5). Runtime must use the frozen
lookup table and must not run this floating-point derivation.
"""
from __future__ import annotations
import json, math
from pathlib import Path

LATITUDE_NORTH = 58.5209888889
YEARS = range(1230, 1234)

def julian_day_for_julian_calendar(year: int, month: int, day: int, hour: float = 12.0) -> float:
    if month <= 2:
        year -= 1
        month += 12
    return (math.floor(365.25 * (year + 4716))
            + math.floor(30.6001 * (month + 1))
            + day - 1524.5 + hour / 24.0)

def solar_declination_and_equation_of_time(jd: float) -> tuple[float, float]:
    t = (jd - 2451545.0) / 36525.0
    mean_long = (280.46646 + t * (36000.76983 + 0.0003032 * t)) % 360.0
    mean_anomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t)
    eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
    anomaly_radians = math.radians(mean_anomaly)
    center = (math.sin(anomaly_radians) * (1.914602 - t * (0.004817 + 0.000014 * t))
              + math.sin(2 * anomaly_radians) * (0.019993 - 0.000101 * t)
              + math.sin(3 * anomaly_radians) * 0.000289)
    true_long = mean_long + center
    omega = 125.04 - 1934.136 * t
    apparent_long = true_long - 0.00569 - 0.00478 * math.sin(math.radians(omega))
    seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))
    mean_obliquity = 23.0 + (26.0 + seconds / 60.0) / 60.0
    obliquity = mean_obliquity + 0.00256 * math.cos(math.radians(omega))
    declination = math.degrees(math.asin(math.sin(math.radians(obliquity)) * math.sin(math.radians(apparent_long))))
    y = math.tan(math.radians(obliquity) / 2.0) ** 2
    equation = 4.0 * math.degrees(
        y * math.sin(2 * math.radians(mean_long))
        - 2 * eccentricity * math.sin(anomaly_radians)
        + 4 * eccentricity * y * math.sin(anomaly_radians) * math.cos(2 * math.radians(mean_long))
        - 0.5 * y * y * math.sin(4 * math.radians(mean_long))
        - 1.25 * eccentricity * eccentricity * math.sin(2 * anomaly_radians))
    return declination, equation

def pair(year: int, month: int, day: int, zenith_degrees: float) -> tuple[float, float]:
    declination, equation = solar_declination_and_equation_of_time(
        julian_day_for_julian_calendar(year, month, day))
    lat = math.radians(LATITUDE_NORTH)
    dec = math.radians(declination)
    cosine = (math.cos(math.radians(zenith_degrees)) / (math.cos(lat) * math.cos(dec))
              - math.tan(lat) * math.tan(dec))
    cosine = max(-1.0, min(1.0, cosine))
    hour_angle = math.degrees(math.acos(cosine))
    solar_noon_lmst = 720.0 - equation
    return solar_noon_lmst - 4.0 * hour_angle, solar_noon_lmst + 4.0 * hour_angle

def year_table(year: int) -> dict[str, dict[str, str]]:
    month_lengths = [31, 29 if year % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    result = {}
    for month, count in enumerate(month_lengths, 1):
        for day in range(1, count + 1):
            civil_dawn, civil_dusk = pair(year, month, day, 96.0)
            sunrise, sunset = pair(year, month, day, 90.833)
            values = [int(math.floor(value + 0.5)) for value in (civil_dawn, sunrise, sunset, civil_dusk)]
            if not (0 <= values[0] < values[1] < values[2] < values[3] <= 1440):
                raise ValueError((year, month, day, values))
            result[f"{month:02d}-{day:02d}"] = {
                'civil_dawn_minute_of_day': str(values[0]),
                'sunrise_minute_of_day': str(values[1]),
                'sunset_minute_of_day': str(values[2]),
                'civil_dusk_minute_of_day': str(values[3]),
            }
    return result

def main() -> None:
    output = {str(year): year_table(year) for year in YEARS}
    print(json.dumps(output, ensure_ascii=False, sort_keys=True, separators=(',', ':')))

if __name__ == '__main__':
    main()
