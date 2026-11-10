import { parseUtcTime } from './formatters';

/**
 * Checks if an activity is a container activity (ForEach, IfCondition, Switch, Until)
 * or holds an innerActivities array.
 * @param {Object} activity
 * @returns {boolean}
 */
export function isContainerActivity(activity) {
  if (!activity) return false;
  const t = (activity.activityType || '').toLowerCase();
  const hasInners = Array.isArray(activity.innerActivities) && activity.innerActivities.length > 0;
  return hasInners || ['foreach', 'ifcondition', 'switch', 'until'].some(k => t.includes(k));
}

/**
 * Sorts an array of activities chronologically by start timestamp, then end timestamp, then name.
 * @param {Array} activities
 * @returns {Array}
 */
export function sortActivitiesByTimeline(activities) {
  if (!Array.isArray(activities)) return [];
  return [...activities].sort((a, b) => {
    const startA = parseUtcTime(a.activityRunStart || a.startTime);
    const startB = parseUtcTime(b.activityRunStart || b.startTime);
    if (startA !== startB) return startA - startB;
    const endA = parseUtcTime(a.activityRunEnd || a.endTime);
    const endB = parseUtcTime(b.activityRunEnd || b.endTime);
    if (endA !== endB) return endA - endB;
    return (a.activityName || '').localeCompare(b.activityName || '');
  });
}

/**
 * Reconstructs container hierarchy when flat activities are returned by Fabric API.
 * Ensures leaf execution runs inside If, Switch, and ForEach loops are grouped under their parent container.
 * @param {Array} flatActivities
 * @returns {Array} Nested and sorted activities array.
 */
export function nestContainerActivities(flatActivities) {
  if (!Array.isArray(flatActivities) || flatActivities.length === 0) return [];
  const alreadyNested = flatActivities.some(a => isContainerActivity(a) && Array.isArray(a.innerActivities) && a.innerActivities.length > 0);
  if (alreadyNested) return sortActivitiesByTimeline(flatActivities);

  const hasContainer = flatActivities.some(a => isContainerActivity(a));
  if (!hasContainer) return sortActivitiesByTimeline(flatActivities);

  const sorted = [...flatActivities].sort((a, b) => {
    const tA = parseUtcTime(a.activityRunStart || a.startTime);
    const tB = parseUtcTime(b.activityRunStart || b.startTime);
    return tA - tB;
  });

  const result = [];
  let i = 0;
  const n = sorted.length;

  while (i < n) {
    const act = { ...sorted[i], innerActivities: [] };
    const et = parseUtcTime(act.activityRunEnd || act.endTime);

    if (isContainerActivity(act) && et > 0) {
      let j = i + 1;
      const inners = [];
      while (j < n) {
        const nextAct = sorted[j];
        const nextSt = parseUtcTime(nextAct.activityRunStart || nextAct.startTime);
        if (nextSt > 0 && nextSt < et) {
          inners.push({ ...nextAct, innerActivities: [] });
          j++;
        } else {
          break;
        }
      }

      const subContainers = inners.filter(a => isContainerActivity(a) && a.activityName !== act.activityName);
      if (subContainers.length > 0) {
        const scNames = new Set(subContainers.map(sc => sc.activityName));
        const leafActs = inners.filter(a => !scNames.has(a.activityName));
        const leafByName = {};
        for (const leaf of leafActs) {
          if (!leafByName[leaf.activityName]) leafByName[leaf.activityName] = [];
          leafByName[leaf.activityName].push(leaf);
        }
        for (let k = 0; k < subContainers.length; k++) {
          const sc = subContainers[k];
          const scInners = [];
          for (const name in leafByName) {
            const list = leafByName[name];
            if (k < list.length) {
              scInners.push(list[k]);
            } else if (list.length === 1 && k === 0) {
              scInners.push(list[0]);
            }
          }
          scInners.sort((a, b) => parseUtcTime(a.activityRunStart || a.startTime) - parseUtcTime(b.activityRunStart || b.startTime));
          sc.innerActivities = scInners;
        }
        act.innerActivities = subContainers;
      } else {
        act.innerActivities = inners;
      }

      result.push(act);
      i = j;
    } else {
      result.push(act);
      i++;
    }
  }

  return sortActivitiesByTimeline(result);
}
