const { downloadAllPhotos } = require("./actions/download-all-photos");
const { downloadSinglePhoto } = require("./actions/download-single-photo");
const { cancelDownload } = require("./actions/cancel-download");
const { deleteDuplicates } = require("./actions/delete-duplicates");
const { updatePhotoList } = require("./actions/update-photo-list");
const { filterPhotos } = require("./actions/filter-photos");
const { updateState } = require("./download-state");


/**
 * Handles incoming WebSocket messages.
 * @param {object} req - The Express request object, containing the session.
 * @param {object} ws - The WebSocket object.
 * @param {string} message - The incoming message.
 */
async function handleMessage(req, ws, message) {
  const data = JSON.parse(message);
  const { type, payload } = data;

  switch (type) {
    case "download":
      await downloadAllPhotos(
        req,
        req.session.missingPhotos,
        req.session.downloadedPhotos.length,
        req.session.missingPhotos.length
      );
      break;
    case "cancel-download":
      cancelDownload();
      break;
    case "delete-duplicates":
      await deleteDuplicates(req, payload.fileIds);
      break;
    case "download-photo":
      const allPhotos = (req.session.downloadedPhotos || []).concat(req.session.missingPhotos || []);
      const photo = allPhotos.find(p => p.photoId.id === payload.photoId);
      if (photo) {
        await downloadSinglePhoto(
          req,
          photo,
        );
      } else {
        updateState({ error: `Photo with ID ${payload.photoId} not found.` });
      }
      break;
    case "update-photo-list":
      await updatePhotoList(req);
      break;
    case "filter-photos":
      await filterPhotos(req, ws, payload);
      break;
    default:
      console.log(`Unknown message type: ${type}`);
  }
}

module.exports = { handleMessage };
