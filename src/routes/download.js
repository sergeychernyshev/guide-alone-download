const express = require("express");
const { getAuthenticatedClient, isLoggedIn } = require("../oauth");
const { downloadPhoto } = require("../photo-manager");
const {
  getDriveClient,
  findOrCreateFolder,
  createFile,
  FOLDER_NAME,
} = require("../drive-manager");
const { updateState, resetState, getState } = require("../download-state");

const router = express.Router();

router.get("/", async (req, res, next) => {
  if (!isLoggedIn(req)) {
    return res.status(401).send("You must be logged in to download photos.");
  }

  if (!req.session.photos || req.session.photos.length === 0) {
    return res.status(400).send("No photos to download.");
  }

  const photos = req.session.photos;
  
  resetState();
  updateState({ inProgress: true });
  
  downloadAllPhotos(req, photos);

  res.redirect("/");
});

async function downloadAllPhotos(req, photos) {
  const progressCallback = (progress) => {
    updateState(progress);
  };

  try {
    const oAuth2Client = await getAuthenticatedClient(req);
    const drive = await getDriveClient(oAuth2Client);
    const folder = await findOrCreateFolder(drive, FOLDER_NAME);
    const folderId = folder.id;

    const totalPhotos = photos.length;
    progressCallback({
      message: `Starting download of ${totalPhotos} photos to Google Drive...`,
      total: totalPhotos,
      current: 0,
    });

    for (let i = 0; i < photos.length; i++) {
      if (getState().cancelled) {
        progressCallback({
          message: "Cancelling...",
        });
        break;
      }
      const photo = photos[i];
      const fileName = `${photo.photoId.id}.jpg`;
      progressCallback({
        message: `Processing photo ${i + 1} of ${totalPhotos} (${fileName})...`,
        total: totalPhotos,
        current: i,
        photoId: photo.photoId.id,
        downloadProgress: 0,
        uploadProgress: 0,
        totalProgress: Math.round((i / totalPhotos) * 100),
      });

      const { stream, size } = await downloadPhoto(
        photo.downloadUrl,
        oAuth2Client,
        (percentage) => {
          progressCallback({ downloadProgress: percentage });
        }
      );

      if (getState().cancelled) {
        progressCallback({
          message: "Cancelling...",
        });
        break;
      }

      await createFile(
        drive,
        fileName,
        "image/jpeg",
        stream,
        folderId,
        size,
        (percentage) => {
          progressCallback({ uploadProgress: percentage });
        }
      );

      // Move the downloaded photo from missingPhotos to downloadedPhotos
      if (req.session.missingPhotos && req.session.downloadedPhotos) {
        const downloadedPhotoIndex = req.session.missingPhotos.findIndex(
          (p) => p.photoId.id === photo.photoId.id
        );
        if (downloadedPhotoIndex > -1) {
          const [downloadedPhoto] = req.session.missingPhotos.splice(
            downloadedPhotoIndex,
            1
          );
          req.session.downloadedPhotos.push(downloadedPhoto);
        }
      }

      progressCallback({
        fileComplete: true,
        downloadedCount: req.session.downloadedPhotos.length,
        notDownloadedCount: req.session.missingPhotos.length,
      });
    }

    delete req.session.photos;
    progressCallback({
      message: "All photos downloaded successfully to Google Drive!",
      complete: true,
      inProgress: false,
    });
  } catch (error) {
    progressCallback({
      error: `An error occurred: ${error.message}`,
      complete: true,
      inProgress: false,
    });
    console.error(error);
  }
}

module.exports = router;
