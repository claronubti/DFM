import datetime
from typing import Any, Dict, List, Optional, Set

CONTAINER_TYPES: Set[str] = {"foreach", "ifcondition", "switch", "until"}


def is_container_activity(act_type: Optional[str]) -> bool:
    """Checks whether an activity type represents a control-flow container."""
    if not act_type:
        return False
    t = str(act_type).strip().lower()
    return any(c in t for c in CONTAINER_TYPES)


from app.shared.utils import parse_iso


def nest_activity_runs(raw_activities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Nests inner activity executions inside container activities (ForEach, IfCondition, Switch, Until).

    Fabric and Azure Data Factory return all pipeline activity executions as a flat list.
    This helper identifies container executions by start and end timestamps and nests inner
    iterations and executions into an 'innerActivities' collection on their parent container.

    Args:
        raw_activities: Flat list of activity dictionaries for a pipeline run.

    Returns:
        Hierarchical list of activities with nested innerActivities on container activities.
    """
    if not raw_activities:
        return []

    # Sort strictly by start_time ascending (fallback to end_time, then activityName)
    sorted_acts = sorted(
        raw_activities,
        key=lambda x: (
            parse_iso(x.get("activityRunStart") or x.get("start_time")) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
            parse_iso(x.get("activityRunEnd") or x.get("end_time")) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
            x.get("activityName") or "",
        ),
    )

    def process_container(container_act: Dict[str, Any], inner_candidates: List[Dict[str, Any]]) -> None:
        """Processes candidate executions running inside a container window and structures them hierarchically."""
        c_name = container_act.get("activityName")

        # Discover sub-containers inside this container (e.g. IfCondition iterations inside ForEach)
        sub_containers = [
            a
            for a in inner_candidates
            if is_container_activity(a.get("activityType") or a.get("activity_type"))
            and a.get("activityName") != c_name
        ]

        if not sub_containers:
            # All inner candidates are direct children of this container, sorted by timeline
            inner_candidates.sort(
                key=lambda x: (
                    parse_iso(x.get("activityRunStart") or x.get("start_time")) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
                    parse_iso(x.get("activityRunEnd") or x.get("end_time")) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
                    x.get("activityName") or "",
                )
            )
            container_act["innerActivities"] = inner_candidates
            return

        sub_container_names = {sc.get("activityName") for sc in sub_containers}

        # Separate candidates into sub-containers and leaf activities
        leaf_acts = [
            a
            for a in inner_candidates
            if a.get("activityName") not in sub_container_names
        ]

        # Group leaf activities by their name to distribute parallel iterations
        leaf_by_name: Dict[str, List[Dict[str, Any]]] = {}
        for leaf in leaf_acts:
            name = leaf.get("activityName") or "Activity"
            leaf_by_name.setdefault(name, []).append(leaf)

        num_sc = len(sub_containers)
        assigned_leaf_ids = set()

        for k, sc in enumerate(sub_containers):
            sc_inners: List[Dict[str, Any]] = []
            for _, instances in leaf_by_name.items():
                if k < len(instances):
                    inst = instances[k]
                    sc_inners.append(inst)
                    act_id = inst.get("activityRunId") or inst.get("id") or str(inst)
                    assigned_leaf_ids.add(act_id)
                elif len(instances) == 1 and k == 0:
                    inst = instances[0]
                    sc_inners.append(inst)
                    act_id = inst.get("activityRunId") or inst.get("id") or str(inst)
                    assigned_leaf_ids.add(act_id)

            sc_inners.sort(
                key=lambda x: (
                    parse_iso(x.get("activityRunStart") or x.get("start_time")) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
                    parse_iso(x.get("activityRunEnd") or x.get("end_time")) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
                    x.get("activityName") or "",
                )
            )
            sc["innerActivities"] = sc_inners

        # Any unassigned leaf activities remain direct children of this container
        unassigned_leafs = [
            leaf for leaf in leaf_acts
            if (leaf.get("activityRunId") or leaf.get("id") or str(leaf)) not in assigned_leaf_ids
        ]

        all_inners = sub_containers + unassigned_leafs
        all_inners.sort(
            key=lambda x: (
                parse_iso(x.get("activityRunStart") or x.get("start_time")) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
                parse_iso(x.get("activityRunEnd") or x.get("end_time")) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
                x.get("activityName") or "",
            )
        )
        container_act["innerActivities"] = all_inners

    top_level_acts: List[Dict[str, Any]] = []
    i = 0
    n = len(sorted_acts)

    while i < n:
        act = dict(sorted_acts[i])
        act_type = act.get("activityType") or act.get("activity_type") or ""
        st = parse_iso(act.get("activityRunStart") or act.get("start_time"))
        et = parse_iso(act.get("activityRunEnd") or act.get("end_time"))

        if is_container_activity(act_type) and et:
            j = i + 1
            inner_candidates: List[Dict[str, Any]] = []
            while j < n:
                next_act = dict(sorted_acts[j])
                next_st = parse_iso(next_act.get("activityRunStart") or next_act.get("start_time"))

                # Any activity that started while this container was running belongs to it
                if next_st and next_st < et:
                    inner_candidates.append(next_act)
                    j += 1
                else:
                    break

            process_container(act, inner_candidates)
            top_level_acts.append(act)
            i = j
        else:
            act.setdefault("innerActivities", [])
            top_level_acts.append(act)
            i += 1

    top_level_acts.sort(
        key=lambda x: (
            parse_iso(x.get("activityRunStart") or x.get("start_time")) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
            parse_iso(x.get("activityRunEnd") or x.get("end_time")) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
            x.get("activityName") or "",
        )
    )
    return top_level_acts

