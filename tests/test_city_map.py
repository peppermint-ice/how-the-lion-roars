import json
from reconstruct_sessions import load_city_map


def test_load_city_map(tmp_path):
    data = {"cities": {
        "Tel Aviv": {"id": 1},
        "Jerusalem": {"id": 2},
        "Haifa": {"id": 3}
    }}
    p = tmp_path / "cities.json"
    p.write_text(json.dumps(data), encoding="utf-8")
    result = load_city_map(str(p))
    assert result == {"Tel Aviv": "1", "Jerusalem": "2", "Haifa": "3"}


def test_load_city_map_empty(tmp_path):
    data = {"cities": {}}
    p = tmp_path / "cities.json"
    p.write_text(json.dumps(data), encoding="utf-8")
    result = load_city_map(str(p))
    assert result == {}
