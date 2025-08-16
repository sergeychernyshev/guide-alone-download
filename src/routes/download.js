const express = require("express");
const { Readable } = require("stream");
const { getAuthenticatedClient, isLoggedIn } = require("../oauth");
const { downloadPhoto, addExifData } = require("../photo-manager");
const {
  getDriveClient,
  findOrCreateFolder,
  createFile,
  listFiles,
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
  const downloadedPhotosCount = req.session.downloadedPhotos.length;
  const missingPhotosCount = req.session.missingPhotos.length;

  resetState();
  updateState({ inProgress: true });

  downloadAllPhotos(req, photos, downloadedPhotosCount, missingPhotosCount);

  res.redirect("/");
});

async function downloadAllPhotos(
  req,
  photos,
  downloadedPhotosCount,
  missingPhotosCount
) {
  const progressCallback = (progress) => {
    updateState(progress);
  };

  try {
    const oAuth2Client = await getAuthenticatedClient(req);
    const drive = await getDriveClient(oAuth2Client);
    const folder = await findOrCreateFolder(drive, FOLDER_NAME);
    const folderId = folder.id;

    const driveFiles = await listFiles(drive, folderId);
    const existingFileNames = new Set(driveFiles.map((f) => f.name));

    const totalPhotos = photos.length;
    const totalPhotoCount = downloadedPhotosCount + missingPhotosCount;
    const initialProgress =
      totalPhotoCount > 0
        ? Math.round((downloadedPhotosCount / totalPhotoCount) * 100)
        : 0;

    progressCallback({
      message: `Starting download of ${totalPhotos} photos to Google Drive...`,
      total: totalPhotos,
      current: 0,
      totalProgress: initialProgress,
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

      if (existingFileNames.has(fileName)) {
        progressCallback({
          message: `Skipping existing file: ${fileName}`,
        });
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
          totalProgress: Math.round(
            ((downloadedPhotosCount + i + 1) /
              (downloadedPhotosCount + missingPhotosCount)) *
              100
          ),
        });
        continue;
      }

      progressCallback({
        message: `Processing photo ${
          downloadedPhotosCount + i + 1
        } of ${totalPhotoCount} (${fileName})...`,
        total: totalPhotos,
        current: i,
        photoId: photo.photoId.id,
        downloadProgress: 0,
        uploadProgress: 0,
      });

      const { buffer } = await downloadPhoto(
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

      const photoWithExif = addExifData(buffer, photo);
      const stream = Readable.from(photoWithExif);
      const size = photoWithExif.length;

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
        totalProgress: Math.round(
          ((downloadedPhotosCount + i + 1) /
            (downloadedPhotosCount + missingPhotosCount)) *
            100
        ),
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
