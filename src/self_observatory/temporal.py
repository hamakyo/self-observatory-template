"""Precision-preserving calendar values; bounds are search aids, not event dates."""

from __future__ import annotations

import calendar
import re
from datetime import date


def temporal_bounds(value: dict | None) -> tuple[int, int] | None:
    if not value or value["precision"] == "unknown":
        return None
    precision = value["precision"]
    if precision == "range":
        return temporal_bounds(value["start"])[0], temporal_bounds(value["end"])[1]
    parts = [int(part) for part in value["value"].split("-")]
    year = parts[0]
    if precision == "year":
        return date(year, 1, 1).toordinal(), date(year, 12, 31).toordinal() + 1
    month = parts[1]
    if precision == "month":
        return date(year, month, 1).toordinal(), date(year, month, calendar.monthrange(year, month)[1]).toordinal() + 1
    day = date(*parts).toordinal()
    return day, day + 1


def validate_temporal(value, *, endpoint=False) -> dict:
    if not isinstance(value, dict) or not isinstance(value.get("precision"), str):
        raise ValueError("temporal value must have a precision")
    precision = value["precision"]
    if precision == "unknown" and not endpoint:
        if set(value) != {"precision"}:
            raise ValueError("unknown temporal value cannot contain a date")
        return value
    if precision == "range" and not endpoint:
        if set(value) != {"precision", "start", "end"}:
            raise ValueError("temporal range requires exactly start and end")
        result = {"precision": "range", "start": validate_temporal(value["start"], endpoint=True),
                  "end": validate_temporal(value["end"], endpoint=True)}
        lower, upper = temporal_bounds(result)
        if lower >= upper:
            raise ValueError("temporal range is reversed")
        return result
    patterns = {"year": r"[0-9]{4}", "month": r"[0-9]{4}-[0-9]{2}", "date": r"[0-9]{4}-[0-9]{2}-[0-9]{2}"}
    if precision not in patterns or set(value) != {"precision", "value"}:
        raise ValueError("invalid temporal precision or fields")
    raw = value["value"]
    if type(raw) is date and precision == "date":
        raw = raw.isoformat()
    if not isinstance(raw, str) or not re.fullmatch(patterns[precision], raw):
        raise ValueError("temporal value does not match its precision")
    result = {"precision": precision, "value": raw}
    try:
        temporal_bounds(result)
    except (ValueError, OverflowError, calendar.IllegalMonthError) as exc:
        raise ValueError("temporal value must be a valid calendar value") from exc
    return result


def temporal_label(value: dict | None) -> str:
    if value is None:
        return "未記録"
    if value["precision"] == "unknown":
        return "時期不明"
    if value["precision"] == "range":
        return f'{temporal_label(value["start"])}〜{temporal_label(value["end"])}'
    parts = value["value"].split("-")
    return "".join(f"{int(part)}{unit}" for part, unit in zip(parts, ("年", "月", "日")))


def temporal_warnings(data: dict) -> list[str]:
    values = data.get("temporal", {})
    warnings = []
    for before, after in (("experienced", "noticed"), ("noticed", "adopted")):
        a, b = temporal_bounds(values.get(before)), temporal_bounds(values.get(after))
        if a and b and a[0] >= b[1]:
            warnings.append(f"{before}_after_{after}")
    return warnings
