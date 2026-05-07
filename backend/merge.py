import copy
from datetime import datetime, timezone


STATUS_RANK = {
    "unseen": 0,
    "review": 1,
    "mastered": 2,
}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def parse_time(value):
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def newer_time(a, b):
    ta = parse_time(a)
    tb = parse_time(b)
    if ta and tb:
        return a if ta >= tb else b
    return a or b


def state_updated_at(state):
    meta = state.get("meta") or {}
    return meta.get("updatedAt")


def normalize_state(raw_state):
    state = copy.deepcopy(raw_state or {})
    state.setdefault("view", "dashboard")
    state.setdefault("activeTrack", "textbook")
    state.setdefault("mobileSidebarOpen", False)
    state.setdefault("selectedChapterId", None)
    state.setdefault("selectedSectionId", None)
    state.setdefault("selectedSimulatorId", None)
    state.setdefault("practiceMode", "passline")
    state.setdefault("progress", {})
    state["progress"].setdefault("points", {})
    state["progress"].setdefault("chapters", {})
    state["progress"].setdefault("lastChapterId", None)
    state["progress"].setdefault("lastPointId", None)
    state.setdefault("quizHistory", [])
    state.setdefault("wrongbook", {})
    state.setdefault("trackProgress", {})
    state["trackProgress"].setdefault("textbook", {})
    state["trackProgress"].setdefault("passline", {})
    state.setdefault("chapterWeakness", {})
    state.setdefault("lastPasslineScore", {})
    state.setdefault("meta", {})
    state["meta"].setdefault("updatedAt", None)
    return state


def merge_progress_states(local_state, remote_state):
    local = normalize_state(local_state)
    remote = normalize_state(remote_state)
    merged = normalize_state({})
    merged["meta"]["updatedAt"] = now_iso()

    local_updated = parse_time(state_updated_at(local)) or datetime.min.replace(tzinfo=timezone.utc)
    remote_updated = parse_time(state_updated_at(remote)) or datetime.min.replace(tzinfo=timezone.utc)
    preferred = local if local_updated >= remote_updated else remote

    for key in ("view", "activeTrack", "selectedChapterId", "selectedSectionId", "selectedSimulatorId", "practiceMode"):
        merged[key] = preferred.get(key) or local.get(key) or remote.get(key)

    merged["mobileSidebarOpen"] = False
    merged["progress"] = merge_progress(local["progress"], remote["progress"], preferred)
    merged["quizHistory"] = merge_quiz_history(local["quizHistory"], remote["quizHistory"])
    merged["wrongbook"] = merge_wrongbook(local["wrongbook"], remote["wrongbook"])
    merged["trackProgress"] = {
        "textbook": merge_track_map(local["trackProgress"]["textbook"], remote["trackProgress"]["textbook"]),
        "passline": merge_track_map(local["trackProgress"]["passline"], remote["trackProgress"]["passline"]),
    }
    merged["chapterWeakness"] = merge_chapter_weakness(local["chapterWeakness"], remote["chapterWeakness"])
    merged["lastPasslineScore"] = merge_passline_scores(local["lastPasslineScore"], remote["lastPasslineScore"])
    return merged


def merge_progress(local, remote, preferred):
    result = {
        "points": {},
        "chapters": {},
        "lastChapterId": preferred["progress"].get("lastChapterId") or local["progress"].get("lastChapterId") or remote["progress"].get("lastChapterId"),
        "lastPointId": preferred["progress"].get("lastPointId") or local["progress"].get("lastPointId") or remote["progress"].get("lastPointId"),
    }
    point_ids = set(local.get("points", {}).keys()) | set(remote.get("points", {}).keys())
    for point_id in point_ids:
        left = local["points"].get(point_id) or {}
        right = remote["points"].get(point_id) or {}
        left_status = left.get("status", "unseen")
        right_status = right.get("status", "unseen")
        chosen_status = left_status if STATUS_RANK.get(left_status, 0) >= STATUS_RANK.get(right_status, 0) else right_status
        if STATUS_RANK.get(left_status, 0) == STATUS_RANK.get(right_status, 0):
            left_time = parse_time(left.get("lastViewedAt"))
            right_time = parse_time(right.get("lastViewedAt"))
            if right_time and (not left_time or right_time > left_time):
                chosen_status = right_status
        result["points"][point_id] = {
            "status": chosen_status,
            "lastViewedAt": newer_time(left.get("lastViewedAt"), right.get("lastViewedAt")),
        }

    chapter_ids = set(local.get("chapters", {}).keys()) | set(remote.get("chapters", {}).keys())
    for chapter_id in chapter_ids:
        left = local["chapters"].get(chapter_id) or {}
        right = remote["chapters"].get(chapter_id) or {}
        result["chapters"][chapter_id] = {
            "read": bool(left.get("read")) or bool(right.get("read")),
            "quizCompleted": bool(left.get("quizCompleted")) or bool(right.get("quizCompleted")),
            "lastQuizScore": pick_newer_value(left.get("lastQuizScore"), right.get("lastQuizScore"), left.get("lastStudyAt"), right.get("lastStudyAt")),
            "lastStudyAt": newer_time(left.get("lastStudyAt"), right.get("lastStudyAt")),
        }
    return result


def pick_newer_value(left_value, right_value, left_time, right_time):
    left_dt = parse_time(left_time)
    right_dt = parse_time(right_time)
    if left_dt and right_dt:
        return left_value if left_dt >= right_dt else right_value
    return left_value or right_value


def merge_quiz_history(local_history, remote_history):
    merged = {}
    for item in list(local_history or []) + list(remote_history or []):
        key = "|".join(
            [
                str(item.get("chapterId", "")),
                str(item.get("mode", "")),
                str(item.get("completedAt", "")),
                str(item.get("score", "")),
                str(item.get("total", "")),
            ]
        )
        if key not in merged:
            merged[key] = item
    return sorted(merged.values(), key=lambda item: parse_time(item.get("completedAt")) or datetime.min.replace(tzinfo=timezone.utc))


def merge_wrongbook(local_book, remote_book):
    result = {}
    keys = set((local_book or {}).keys()) | set((remote_book or {}).keys())
    for key in keys:
        left = (local_book or {}).get(key) or {}
        right = (remote_book or {}).get(key) or {}
        latest = left if (parse_time(left.get("lastWrongAt")) or datetime.min.replace(tzinfo=timezone.utc)) >= (parse_time(right.get("lastWrongAt")) or datetime.min.replace(tzinfo=timezone.utc)) else right
        result[key] = {
            "id": latest.get("id") or key,
            "chapterId": latest.get("chapterId") or left.get("chapterId") or right.get("chapterId"),
            "chapterTitle": latest.get("chapterTitle") or left.get("chapterTitle") or right.get("chapterTitle"),
            "stem": latest.get("stem") or left.get("stem") or right.get("stem"),
            "type": latest.get("type") or left.get("type") or right.get("type"),
            "userAnswer": latest.get("userAnswer") or left.get("userAnswer") or right.get("userAnswer"),
            "correctAnswer": latest.get("correctAnswer") or left.get("correctAnswer") or right.get("correctAnswer"),
            "explanation": latest.get("explanation") or left.get("explanation") or right.get("explanation"),
            "relatedTopicId": latest.get("relatedTopicId") or left.get("relatedTopicId") or right.get("relatedTopicId"),
            "relatedSimulatorId": latest.get("relatedSimulatorId") or left.get("relatedSimulatorId") or right.get("relatedSimulatorId"),
            "wrongCount": int(left.get("wrongCount") or 0) + int(right.get("wrongCount") or 0) if left and right else int(latest.get("wrongCount") or 0),
            "lastWrongAt": newer_time(left.get("lastWrongAt"), right.get("lastWrongAt")),
        }
    return result


def merge_track_map(local_map, remote_map):
    result = {}
    keys = set((local_map or {}).keys()) | set((remote_map or {}).keys())
    for key in keys:
        left = (local_map or {}).get(key) or {}
        right = (remote_map or {}).get(key) or {}
        left_stamp = left.get("updatedAt") or left.get("completedAt")
        right_stamp = right.get("updatedAt") or right.get("completedAt")
        latest = left if (parse_time(left_stamp) or datetime.min.replace(tzinfo=timezone.utc)) >= (parse_time(right_stamp) or datetime.min.replace(tzinfo=timezone.utc)) else right
        result[key] = copy.deepcopy(latest)
        if "readyTopics" in left or "readyTopics" in right:
            result[key]["readyTopics"] = max(int(left.get("readyTopics") or 0), int(right.get("readyTopics") or 0))
        if "totalTopics" in left or "totalTopics" in right:
            result[key]["totalTopics"] = max(int(left.get("totalTopics") or 0), int(right.get("totalTopics") or 0))
        result[key]["updatedAt"] = newer_time(left_stamp, right_stamp)
    return result


def merge_chapter_weakness(local_map, remote_map):
    result = {}
    chapter_ids = set((local_map or {}).keys()) | set((remote_map or {}).keys())
    for chapter_id in chapter_ids:
        result[chapter_id] = {}
        section_ids = set((local_map or {}).get(chapter_id, {}).keys()) | set((remote_map or {}).get(chapter_id, {}).keys())
        for section_id in section_ids:
            result[chapter_id][section_id] = int((local_map or {}).get(chapter_id, {}).get(section_id) or 0) + int((remote_map or {}).get(chapter_id, {}).get(section_id) or 0)
    return result


def merge_passline_scores(local_scores, remote_scores):
    result = {}
    keys = set((local_scores or {}).keys()) | set((remote_scores or {}).keys())
    for key in keys:
        left = (local_scores or {}).get(key)
        right = (remote_scores or {}).get(key)
        result[key] = left if parse_score(left) >= parse_score(right) else right
        result[key] = result[key] or left or right
    return result


def parse_score(value):
    if value is None:
        return -1
    text = str(value).strip()
    digits = "".join(ch for ch in text if ch.isdigit())
    return int(digits) if digits else -1
