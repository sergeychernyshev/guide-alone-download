const { updateState } = require("../download-state");

/**
 * Cancels the current download operation.
 */
function cancelDownload() {
  // Set the cancelled flag in the download state
  updateState({ cancelled: true });
}

module.exports = { cancelDownload };
