const express = require("express");
const { getAuthenticatedClient, isLoggedIn } = require("../oauth");
const { downloadPhoto } = require("../photo-manager");
const {
  getDriveClient,
  findOrCreateFolder,
  createFile,
  updateFile,
  findFile,
  listFiles,
  FOLDER_NAME,
} = require("../drive-manager");
const { updateState, resetState, getState } = require("../download-state");
const piexif = require("piexifjs");
const { Readable } = require("stream");

const router = express.Router();

router.get("/:photoId", async (req, res, next) => {
  if (!isLoggedIn(req)) {
    return res.status(401).send("You must be logged in to download photos.");
  }

  const { photoId } = req.params;
  const allPhotos = req.session.downloadedPhotos.concat(req.session.missingPhotos);
  const photo = allPhotos.find(p => p.photoId.id === photoId);

  if (!photo) {
    return res.status(404).send("Photo not found.");
  }

  resetState();
  updateState({ inProgress: true });

  downloadSinglePhoto(req, photo);

  res.redirect("/");
});

function degToDmsRational(deg) {
    const d = Math.floor(deg);
    const minFloat = (deg - d) * 60;
    const m = Math.floor(minFloat);
    const secFloat = (minFloat - m) * 60;
    const s = Math.round(secFloat * 100);
    return [
      [d, 1],
      [m, 1],
      [s, 100],
    ];
  }

async function downloadSinglePhoto(req, photo) {
  const progressCallback = (progress) => {
    updateState(progress);
  };

  try {
    const oAuth2Client = await getAuthenticatedClient(req);
    const drive = await getDriveClient(oAuth2Client);
    const folder = await findOrCreateFolder(drive, FOLDER_NAME);
    const folderId = folder.id;

    progressCallback({
      message: `Starting download of 1 photo to Google Drive...`,
      total: 1,
      current: 0,
      totalProgress: 0,
    });

    const fileName = `${photo.photoId.id}.jpg`;

    progressCallback({
      message: `Processing photo ${fileName}...`,
      total: 1,
      current: 0,
      photoId: photo.photoId.id,
      downloadProgress: 0,
      uploadProgress: 0,
    });

    const { data, size } = await downloadPhoto(
      photo.downloadUrl,
      oAuth2Client,
      (percentage) => {
        progressCallback({ downloadProgress: percentage });
      }
    );

    const jpegData = data.toString("binary");
    const exifObj = piexif.load(jpegData);

    const lat = photo.pose.latLngPair.latitude;
    const lng = photo.pose.latLngPair.longitude;

    const gpsData = {
      [piexif.GPSIFD.GPSLatitudeRef]: lat < 0 ? "S" : "N",
      [piexif.GPSIFD.GPSLatitude]: degToDmsRational(Math.abs(lat)),
      [piexif.GPSIFD.GPSLongitudeRef]: lng < 0 ? "W" : "E",
      [piexif.GPSIFD.GPSLongitude]: degToDmsRational(Math.abs(lng)),
    };

    exifObj["GPS"] = gpsData;
    const exifbytes = piexif.dump(exifObj);
    const newData = piexif.insert(exifbytes, jpegData);
    const newJpeg = Buffer.from(newData, "binary");

    const stream = Readable.from(newJpeg);

    const existingFile = await findFile(drive, fileName, folderId);

    if (existingFile) {
      await updateFile(
        drive,
        existingFile.id,
        "image/jpeg",
        stream,
        newJpeg.length,
        (percentage) => {
          progressCallback({ uploadProgress: percentage });
        }
      );
    } else {
      await createFile(
        drive,
        fileName,
        "image/jpeg",
        stream,
        folderId,
        newJpeg.length,
        (percentage) => {
          progressCallback({ uploadProgress: percentage });
        }
      );
    }

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
      totalProgress: 100,
    });

    progressCallback({
      message: "Photo downloaded successfully to Google Drive!",
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
