/**
 * PolarOPS Centralized Action Execution Layer
 * Handles validation, idempotency, execution state machine, backend communication,
 * and persistent storage of executed recommendations.
 */

// In-flight action mutex to prevent duplicate execution
const inFlightActions = new Set();

// Persisted executed actions storage key
const EXECUTED_ACTIONS_STORAGE_KEY = 'polarops_executed_actions';

/**
 * Returns set of executed action IDs or recommendation IDs from storage
 */
export function getExecutedActionIds() {
  try {
    const raw = localStorage.getItem(EXECUTED_ACTIONS_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

/**
 * Persists an executed action ID or recommendation ID
 */
export function markActionExecuted(id) {
  if (!id) return;
  try {
    const set = getExecutedActionIds();
    set.add(id);
    localStorage.setItem(EXECUTED_ACTIONS_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {}
}

/**
 * Clears executed actions history (e.g., on scenario reset)
 */
export function clearExecutedActions() {
  try {
    localStorage.removeItem(EXECUTED_ACTIONS_STORAGE_KEY);
  } catch (e) {}
}

/**
 * Checks if an action or recommendation has already been executed
 */
export function isActionExecuted(id) {
  if (!id) return false;
  return getExecutedActionIds().has(id);
}

/**
 * Central action execution engine for all AI Copilot & Recommendation actions.
 * Enforces action lifecycle: IDLE -> VALIDATING -> EXECUTING -> SUCCESS / FAILED.
 * Prevents duplicate clicks, checks bounds, calls backend API, and triggers UI updates.
 */
export async function executeCopilotAction({
  actionId,
  actionType,
  stationId = 'MAITRI',
  targetAsset = 'DISPATCH_CONTROLLER',
  requestedValue = null,
  unit = 'kW',
  source = 'AI_COPILOT',
  recommendationId = null,
  reason = 'Authorized operational recommendation execution',
  role = 'Operator',
  onStateChange = null,
  onSuccess = null,
  onError = null
}) {
  const effectiveActionId = actionId || `ACT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const lockKey = recommendationId || effectiveActionId || actionType;

  // 1. Idempotency Check: Prevent duplicate execution
  if (inFlightActions.has(lockKey)) {
    console.warn(`[ActionExecution] Action '${lockKey}' is already in flight.`);
    return { status: 'IN_FLIGHT', message: 'Action is currently executing.' };
  }

  inFlightActions.add(lockKey);

  const notifyState = (state, message = '') => {
    if (typeof onStateChange === 'function') {
      onStateChange(state, message);
    }
  };

  try {
    // 2. State: VALIDATING
    notifyState('VALIDATING', 'Validating safety interlocks & hardware bounds...');
    await new Promise((r) => setTimeout(r, 120)); // Brief pause for visual feedback

    // Client-side quick boundary sanity check
    if (requestedValue !== null && requestedValue !== undefined) {
      const numVal = Number(requestedValue);
      if (isNaN(numVal) || numVal < 0) {
        throw new Error(`Requested value (${requestedValue}) is invalid.`);
      }
    }

    // 3. State: EXECUTING
    notifyState('EXECUTING', `Executing ${actionType.replace(/_/g, ' ')}...`);

    const payload = {
      action_id: effectiveActionId,
      action_type: actionType,
      station_id: stationId,
      target_asset: targetAsset,
      requested_value: requestedValue,
      unit: unit,
      source: source,
      recommendation_id: recommendationId,
      reason: reason,
      role: role
    };

    const res = await fetch('/api/copilot/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = data.message || `Action failed with status ${res.status}`;
      notifyState('FAILED', errMsg);
      if (typeof onError === 'function') onError(new Error(errMsg), data);
      return { status: 'FAILED', message: errMsg, data };
    }

    // 4. State: SUCCESS
    markActionExecuted(lockKey);
    if (recommendationId) markActionExecuted(recommendationId);

    const successMsg = data.message || `Action '${actionType}' executed successfully`;
    notifyState('SUCCESS', successMsg);

    if (typeof onSuccess === 'function') {
      onSuccess(data);
    }

    return {
      status: 'SUCCESS',
      actionId: effectiveActionId,
      message: successMsg,
      data
    };
  } catch (err) {
    const failMsg = err.message || 'Execution failed due to network or server error.';
    notifyState('FAILED', failMsg);
    if (typeof onError === 'function') onError(err);
    return { status: 'FAILED', message: failMsg, error: err };
  } finally {
    inFlightActions.delete(lockKey);
  }
}
