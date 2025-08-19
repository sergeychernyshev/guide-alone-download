const { download } = require("./download");
const { cancelDownload } = require("./download-state");
const { deleteDuplicates } = require("./drive-manager");
const { downloadSinglePhoto } = require("./photo-manager");

async function handleMessage(ws, message) {
  const data = JSON.parse(message);
  const { type, payload } = data;

  switch (type) {
    case "download":
      await download(payload.photos, payload.drive, payload.folderId);
      break;
    case "cancel-download":
      cancelDownload();
      break;
    case "delete-duplicates":
      await deleteDuplicates(payload.drive, payload.folderId);
      break;
    case "download-photo":
      await downloadSinglePhoto(
        payload.photoId,
        payload.drive,
        payload.folderId
      );
      break;
    default:
      console.log(`Unknown message type: ${type}`);
  }
}

module.exports = { handleMessage };
