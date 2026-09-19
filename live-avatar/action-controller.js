export const DIZA_ACTIONS = Object.freeze({
  IDLE: 'IDLE',
  SPEAK: 'SPEAK',
  SHOW_IMAGE: 'SHOW_IMAGE',
  SHOW_CHART: 'SHOW_CHART',
  SHOW_DATA: 'SHOW_DATA',
  HIDE_CANVAS: 'HIDE_CANVAS',
  POINT_LEFT: 'POINT_LEFT',
  POINT_RIGHT: 'POINT_RIGHT',
  PRESENT: 'PRESENT',
  THINK: 'THINK',
  CONFIRM: 'CONFIRM'
});

export function createDizaAction(action, payload = {}) {
  if (!Object.values(DIZA_ACTIONS).includes(action)) {
    throw new Error(`Unknown Diza action: ${action}`);
  }

  return {
    version: 1,
    action,
    payload,
    createdAt: new Date().toISOString()
  };
}

export function createPresentation({ speech = '', content = null, gesture = DIZA_ACTIONS.SPEAK } = {}) {
  return {
    speech,
    avatar: createDizaAction(gesture),
    canvas: content
      ? { visible: true, content }
      : { visible: false, content: null }
  };
}
