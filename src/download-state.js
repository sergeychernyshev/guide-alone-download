let state = {
  inProgress: false,
  total: 0,
  current: 0,
  message: "",
  downloadProgress: 0,
  uploadProgress: 0,
  totalProgress: 0,
  complete: false,
  cancelled: false,
  error: null,
  socket: null,
};

function getState() {
  const { socket, ...rest } = state;
  return rest;
}

function updateState(newState) {
  const oldState = { ...getState() };
  Object.assign(state, newState);

  if (state.socket) {
    const changes = {};
    for (const key in newState) {
      if (newState[key] !== oldState[key]) {
        changes[key] = newState[key];
      }
    }

    if (Object.keys(changes).length > 0) {
      state.socket.send(JSON.stringify(changes));
    }
  }
}

function setSocket(socket) {
  state.socket = socket;
  if (state.socket && state.inProgress) {
    state.socket.send(JSON.stringify(getState()));
  }
}

function resetState() {
  state.inProgress = false;
  state.total = 0;
  state.current = 0;
  state.message = "";
  state.downloadProgress = 0;
  state.uploadProgress = 0;
  state.totalProgress = 0;
  state.complete = false;
  state.cancelled = false;
  state.error = null;
}

module.exports = {
  getState,
  updateState,
  setSocket,
  resetState,
};