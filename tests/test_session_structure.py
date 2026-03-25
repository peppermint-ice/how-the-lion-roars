import json
import os


def test_all_sessions_have_required_fields():
    path = os.path.join(os.path.dirname(__file__), '..', 'history_processing', 'shelter_sessions.json')
    with open(path, encoding='utf-8') as f:
        sessions = json.load(f)

    assert len(sessions) > 0

    for s in sessions:
        assert 'session_id' in s, f"Missing session_id in {s}"
        assert 'start_time' in s, f"Missing start_time in {s.get('session_id')}"
        assert 'start_type' in s, f"Missing start_type in {s.get('session_id')}"
        assert isinstance(s['warned_city_ids'], list), f"warned_city_ids not list in {s['session_id']}"
        assert isinstance(s['alerted_city_ids'], list), f"alerted_city_ids not list in {s['session_id']}"
        assert s['duration_sec'] >= 0, f"Negative duration in {s['session_id']}"
        if s['start_type'] == 14:
            assert s['lead_time_sec'] >= 0, f"Negative lead_time in {s['session_id']}"
