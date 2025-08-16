const express = require("express");
const piexif = require("piexifjs");
const { Readable } = require("stream");
const { getAuthenticatedClient, isLoggedIn } = require("../oauth");
const {
  getDriveClient,
  findFile,
  FOLDER_NAME,
  findOrCreateFolder,
  createFile,
} = require("../drive-manager");
const { downloadPhoto } = require("../photo-manager");

const router = express.Router();

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

router.get("/:photoId", async (req, res, next) => {
  if (!isLoggedIn(req)) {
    return res.status(401).send("You must be logged in to download photos.");
  }

  try {
    const { photoId } = req.params;
    const oAuth2Client = await getAuthenticatedClient(req);
    const drive = await getDriveClient(oAuth2Client);
    const folder = await findOrCreateFolder(drive, FOLDER_NAME);
    const folderId = folder.id;
    const fileName = `${photoId}.jpg`;
    const file = await findFile(drive, fileName, folderId);

    if (file) {
      // File exists in Drive, stream it to the user
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );
      drive.files.get(
        { fileId: file.id, alt: "media" },
        { responseType: "stream" },
        (err, { data }) => {
          if (err) {
            return next(err);
          }
          data.pipe(res);
        }
      );
    } else {
      // File does not exist in Drive, download from Street View
      const photo = req.session.missingPhotos.find(
        (p) => p.photoId.id === photoId
      );

      if (!photo) {
        return res.status(404).send("Photo metadata not found.");
      }

      const { data } = await downloadPhoto(photo.downloadUrl, oAuth2Client);

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

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );
      res.send(newJpeg);

      // Asynchronously upload to Drive and update session
      (async () => {
        try {
          const stream = Readable.from(newJpeg);
          await createFile(
            drive,
            fileName,
            "image/jpeg",
            stream,
            folderId,
            newJpeg.length,
            () => {} // No progress tracking for single download
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
              req.session.save();
            }
          }
        } catch (error) {
          console.error("Error uploading file to Drive in background:", error);
        }
      })();
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
